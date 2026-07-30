"""Counting sessions and zone geometry.

The tally is the product of this mode, so the tests here are mostly about the
ways a count goes wrong: a retried request, an undo, a torn file, a sheet too
small to divide.
"""
from __future__ import annotations

import json

import pytest

from app import session as sessions
from app import zones as zonelib
from app.vision.mats import MATS


@pytest.fixture(autouse=True)
def tmp_sessions(tmp_path, monkeypatch):
    monkeypatch.setattr(sessions, "SESSION_DIR", tmp_path / "sessions")
    yield


def _counted(tid: int, d: float = 27.0, grade: str = "A"):
    return sessions.Counted(tid=tid, d=d, grade=grade, x=200.0, y=200.0)


# ------------------------------------------------------------------ zones ---


def test_only_the_production_sheet_can_be_divided_into_zones():
    """A3 leaves 50 mm of work zone and A4 leaves none. Offering them would let
    someone print the wrong sheet and only find out in the orchard."""
    assert zonelib.supported_mats(MATS) == ["full"]
    for small in ("a3", "a4"):
        with pytest.raises(zonelib.ZoneError) as e:
            zonelib.zones_for(MATS[small])
        assert e.value.code == "MAT_TOO_SMALL_FOR_ZONES"


def test_zones_tile_the_measurement_area_without_gaps_or_overlap():
    mat = MATS["full"]
    zs = zonelib.zones_for(mat)
    area = (mat.area_hi - mat.area_lo) ** 2
    assert sum((z.x1 - z.x0) * (z.y1 - z.y0) for z in zs.values()) == pytest.approx(area)

    # every point lands in exactly one zone -- a fruit sitting on a boundary that
    # belonged to two zones could be counted twice
    for x in range(80, 425, 7):
        for y in range(80, 425, 11):
            hits = [k for k, z in zs.items() if z.contains(x, y)]
            assert len(hits) == 1, f"({x},{y}) in {hits}"


def test_work_zone_is_the_only_place_fruit_is_measured():
    zs = zonelib.zones_for(MATS["full"])
    assert zonelib.locate(zs, 250, 250) == "work"
    assert zonelib.locate(zs, 100, 250) == "entry_left"
    assert zonelib.locate(zs, 250, 100) == "entry_top"
    assert zonelib.locate(zs, 400, 250) == "exit_right"
    # the exit lane runs the full height so a sweep along the top still counts
    assert zonelib.locate(zs, 400, 90) == "exit_right"
    assert zonelib.locate(zs, 20, 20) == ""     # outside the measurement area


# --------------------------------------------------------------- counting ---


def test_count_and_tally():
    s = sessions.open_session("longan", "full")
    sessions.add_counts(s.id, [_counted(1, 29.0, "AA"), _counted(2, 26.0, "A")])
    s = sessions.add_counts(s.id, [_counted(3, 23.0, "B")])
    assert s.counted == 3
    assert s.tally == {"A": 1, "AA": 1, "B": 1}
    assert s.stats()["mean"] == pytest.approx(26.0)


def test_a_retried_request_does_not_count_the_fruit_twice():
    """The phone cannot tell a dropped response from a dropped request, so it
    will re-send. Deduping by tracker id is what keeps the tally honest."""
    s = sessions.open_session("longan", "full")
    batch = [_counted(1), _counted(2)]
    sessions.add_counts(s.id, batch)
    s = sessions.add_counts(s.id, batch)
    assert s.counted == 2
    assert sessions.load(s.id).counted == 2


def test_uncount_removes_and_survives_a_reload():
    s = sessions.open_session("longan", "full")
    sessions.add_counts(s.id, [_counted(1), _counted(2), _counted(3)])
    s = sessions.remove_counts(s.id, [2])
    assert s.counted == 2
    assert sorted(sessions.load(s.id).fruits) == [1, 3]

    # undoing something that was never counted is a no-op, not an error
    assert sessions.remove_counts(s.id, [99]).counted == 2


def test_closed_session_refuses_more_counts():
    s = sessions.open_session("longan", "full")
    sessions.add_counts(s.id, [_counted(1)])
    sessions.close_session(s.id)
    with pytest.raises(sessions.SessionError) as e:
        sessions.add_counts(s.id, [_counted(2)])
    assert e.value.code == "SESSION_CLOSED"
    assert sessions.load(s.id).counted == 1


def test_closing_twice_is_idempotent():
    s = sessions.open_session("longan", "full")
    first = sessions.close_session(s.id).closed_at
    assert sessions.close_session(s.id).closed_at == first


def test_a_torn_final_line_keeps_every_earlier_count():
    """A phone dying mid-append should cost the last fruit, not the basket."""
    s = sessions.open_session("longan", "full")
    sessions.add_counts(s.id, [_counted(1), _counted(2)])
    p = sessions.SESSION_DIR / f"{s.id}.jsonl"
    with p.open("a", encoding="utf-8") as fh:
        fh.write('{"t": "count", "tid": 3, "d": 2')   # cut off mid-write

    reloaded = sessions.load(s.id)
    assert reloaded.counted == 2
    # and the session is still usable afterwards
    assert sessions.add_counts(s.id, [_counted(4)]).counted == 3


def test_unknown_session_is_not_found():
    for sid in ("deadbeef", ""):
        with pytest.raises(sessions.SessionError) as e:
            sessions.load(sid)
        assert e.value.code == "SESSION_NOT_FOUND"


def test_session_id_cannot_escape_the_session_directory():
    for sid in ("../../etc/passwd", "a/b", "AAAA", "zzzz"):
        with pytest.raises(sessions.SessionError):
            sessions.load(sid)


def test_recent_lists_newest_first_and_filters_by_grower():
    a = sessions.open_session("longan", "full", grower_id="g1")
    b = sessions.open_session("longan", "full", grower_id="g2")
    sessions.add_counts(b.id, [_counted(1)])

    ids = [r["sessionId"] for r in sessions.recent()]
    assert set(ids) == {a.id, b.id}
    only_g2 = sessions.recent(grower_id="g2")
    assert [r["sessionId"] for r in only_g2] == [b.id]
    assert only_g2[0]["counted"] == 1


def test_event_log_is_append_only():
    """Replayability is the whole reason for the format; a rewritten file would
    lose the history that makes an undo auditable."""
    s = sessions.open_session("longan", "full")
    sessions.add_counts(s.id, [_counted(1)])
    sessions.remove_counts(s.id, [1])
    rows = [json.loads(ln) for ln in
            (sessions.SESSION_DIR / f"{s.id}.jsonl").read_text().splitlines() if ln]
    assert [r["t"] for r in rows] == ["open", "count", "uncount"]
