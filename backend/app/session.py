"""Counting sessions.

One session is one basket poured across the sheet by hand: place a handful,
let it settle, sweep it right, repeat. The device runs the tracker and decides
when a fruit has left; this module is the durable record of what it decided.

Append-only JSONL, replayed on read. Three reasons over a database:

  * a half-written append leaves the earlier counts intact, so a phone dying
    mid-basket costs the last event rather than the session
  * the whole PoC storage layer is files, so moving to a real host is rsync
  * a count you can read with `tail` is a count you can argue with a buyer about

Unlike capture retention, a failed write here is NOT swallowed. Losing a photo
costs one row of training data; losing a count means the number on the farmer's
screen and the number on disk disagree, and neither of them is trustworthy
after that.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

SESSION_DIR = Path(os.getenv("SESSION_DIR", "data/sessions"))

# Guards a runaway client from filling the disk with one session. A basket is
# a few hundred fruit; 20k is far past any real day's work.
MAX_EVENTS = int(os.getenv("MAX_SESSION_EVENTS", "20000"))


class SessionError(RuntimeError):
    def __init__(self, code: str, **params):
        super().__init__(code)
        self.code = code
        self.params = params


@dataclass
class Counted:
    tid: int
    d: float
    grade: str
    x: float
    y: float
    borderline: bool = False


@dataclass
class Session:
    id: str
    fruit_id: str
    mat_id: str
    grower_id: str
    note: str
    started_at: str
    closed_at: str = ""
    fruits: dict[int, Counted] = field(default_factory=dict)
    events: int = 0

    @property
    def counted(self) -> int:
        return len(self.fruits)

    @property
    def tally(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for f in self.fruits.values():
            out[f.grade] = out.get(f.grade, 0) + 1
        return dict(sorted(out.items()))

    def stats(self) -> dict:
        ds = [f.d for f in self.fruits.values() if f.d > 0]
        if not ds:
            return {"mean": 0.0, "min": 0.0, "max": 0.0}
        return {
            "mean": round(sum(ds) / len(ds), 2),
            "min": round(min(ds), 1),
            "max": round(max(ds), 1),
        }


def _path(sid: str) -> Path:
    # sid is generated here, never taken from the client, but join with a
    # validated stem anyway so a crafted id can never escape the directory
    if not sid or not all(c in "0123456789abcdef" for c in sid):
        raise SessionError("SESSION_NOT_FOUND", session_id=sid)
    return SESSION_DIR / f"{sid}.jsonl"


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def _append(sid: str, row: dict) -> None:
    p = _path(sid)
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    except OSError as e:
        raise SessionError("SESSION_WRITE_FAILED", err=str(e)[:120]) from e


def open_session(fruit_id: str, mat_id: str, grower_id: str = "", note: str = "") -> Session:
    sid = uuid.uuid4().hex[:16]
    started = _now()
    _append(sid, {
        "t": "open", "at": started, "fruit_id": fruit_id,
        "mat_id": mat_id, "grower_id": grower_id, "note": note,
    })
    return Session(id=sid, fruit_id=fruit_id, mat_id=mat_id,
                   grower_id=grower_id, note=note, started_at=started)


def load(sid: str) -> Session:
    p = _path(sid)
    if not p.exists():
        raise SessionError("SESSION_NOT_FOUND", session_id=sid)

    s: Session | None = None
    try:
        with p.open(encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    # a torn last line from a crash mid-append: everything before
                    # it is still valid, so keep the session rather than lose it
                    continue
                kind = row.get("t")
                if kind == "open":
                    s = Session(
                        id=sid,
                        fruit_id=row.get("fruit_id", "longan"),
                        mat_id=row.get("mat_id", "full"),
                        grower_id=row.get("grower_id", ""),
                        note=row.get("note", ""),
                        started_at=row.get("at", ""),
                    )
                elif s is None:
                    continue
                elif kind == "count":
                    # keyed by tracker id, so a client that retries a request it
                    # already delivered adds nothing. The device cannot tell a
                    # dropped response from a dropped request; the server can.
                    s.fruits[int(row["tid"])] = Counted(
                        tid=int(row["tid"]),
                        d=float(row.get("d", 0.0)),
                        grade=str(row.get("grade", "?")),
                        x=float(row.get("x", 0.0)),
                        y=float(row.get("y", 0.0)),
                        borderline=bool(row.get("borderline", False)),
                    )
                elif kind == "uncount":
                    s.fruits.pop(int(row["tid"]), None)
                elif kind == "close":
                    s.closed_at = row.get("at", "")
                s.events += 1
    except OSError as e:
        raise SessionError("SESSION_READ_FAILED", err=str(e)[:120]) from e

    if s is None:
        raise SessionError("SESSION_NOT_FOUND", session_id=sid)
    return s


def _guard_open(s: Session) -> None:
    if s.closed_at:
        raise SessionError("SESSION_CLOSED", session_id=s.id)
    if s.events >= MAX_EVENTS:
        raise SessionError("SESSION_TOO_LONG", session_id=s.id, max=MAX_EVENTS)


def add_counts(sid: str, fruits: list[Counted]) -> Session:
    s = load(sid)
    _guard_open(s)
    at = _now()
    for f in fruits:
        if f.tid in s.fruits:
            continue  # already recorded; a retry, not a second fruit
        _append(sid, {
            "t": "count", "at": at, "tid": f.tid, "d": f.d,
            "grade": f.grade, "x": f.x, "y": f.y, "borderline": f.borderline,
        })
        s.fruits[f.tid] = f
        s.events += 1
    return s


def remove_counts(sid: str, tids: list[int]) -> Session:
    """Undo. The tracker will miscount — a fruit swept back in, two read as one —
    and a tally with no way to correct it is one the farmer stops believing."""
    s = load(sid)
    _guard_open(s)
    at = _now()
    for tid in tids:
        if tid not in s.fruits:
            continue
        _append(sid, {"t": "uncount", "at": at, "tid": tid})
        s.fruits.pop(tid, None)
        s.events += 1
    return s


def close_session(sid: str) -> Session:
    s = load(sid)
    if s.closed_at:
        return s
    at = _now()
    _append(sid, {"t": "close", "at": at})
    s.closed_at = at
    return s


def recent(limit: int = 50, grower_id: str = "") -> list[dict]:
    """Newest sessions first, for the history screen."""
    if not SESSION_DIR.exists():
        return []
    paths = sorted(
        (p for p in SESSION_DIR.glob("*.jsonl")),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    out: list[dict] = []
    for p in paths:
        if len(out) >= limit:
            break
        try:
            s = load(p.stem)
        except SessionError:
            continue
        if grower_id and s.grower_id != grower_id:
            continue
        out.append({
            "sessionId": s.id,
            "startedAt": s.started_at,
            "closedAt": s.closed_at,
            "fruitId": s.fruit_id,
            "matId": s.mat_id,
            "counted": s.counted,
            "tally": s.tally,
            **s.stats(),
        })
    return out


__all__ = [
    "Session", "Counted", "SessionError", "SESSION_DIR",
    "open_session", "load", "add_counts", "remove_counts", "close_session", "recent",
]
