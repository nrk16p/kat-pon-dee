"""Capture retention.

Every real sheet photographed is training data for the segmentation model that
has to replace the watershed baseline. Losing them means re-collecting a dataset
later, so keep the originals by default and make disabling it explicit.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path

log = logging.getLogger("kpd.storage")

CAPTURE_DIR = Path(os.getenv("CAPTURE_DIR", "data/captures"))
RETAIN = os.getenv("RETAIN_CAPTURES", "1") != "0"


@dataclass
class Grower:
    """Who took the photo. Personal data under Thailand's PDPA (พ.ร.บ.
    คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562), so it is only ever written when the app
    reports an explicit consent timestamp."""

    name: str = ""
    phone: str = ""
    province: str = ""
    orchard: str = ""
    consent_at: str = ""
    line_user_id: str = ""

    @property
    def consented(self) -> bool:
        return bool(self.consent_at and (self.name or self.phone or self.line_user_id))

    @property
    def id(self) -> str:
        """Stable pseudonymous id for this grower.

        Prefers the LINE userId: it is already unique and stable, and it survives
        a change of phone number. Falls back to the phone for growers who signed
        up in a plain browser.

        Either way it is hashed, so grouping and lookup never require reading
        someone's LINE id or phone number back out.
        """
        if self.line_user_id:
            return hashlib.sha256(f"kpd:line:{self.line_user_id}".encode()).hexdigest()[:16]
        digits = "".join(c for c in self.phone if c.isdigit())
        if not digits:
            return ""
        return hashlib.sha256(f"kpd:{digits}".encode()).hexdigest()[:16]


GROWERS_FILE = Path(os.getenv("GROWERS_FILE", "data/growers.jsonl"))


def save_capture(
    raw: bytes, fruit_id: str, mat_id: str, grower: "Grower | None" = None
) -> Path | None:
    if not RETAIN:
        return None
    try:
        day = time.strftime("%Y-%m-%d")
        d = CAPTURE_DIR / day / fruit_id
        d.mkdir(parents=True, exist_ok=True)
        stem = f"{int(time.time())}-{mat_id}-{uuid.uuid4().hex[:8]}"
        p = d / f"{stem}.jpg"
        p.write_bytes(raw)

        # sidecar: which grower, which sheet, when. Keeps the JPEG a plain JPEG
        # while still making the training set traceable.
        meta = {
            "captured_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "fruit_id": fruit_id,
            "mat_id": mat_id,
            "grower_id": grower.id if grower and grower.consented else None,
            "province": grower.province if grower and grower.consented else None,
        }
        (d / f"{stem}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))

        if grower and grower.consented:
            record_grower(grower)
        return p
    except Exception:
        # retention must never fail a measurement the farmer is waiting on
        log.warning("could not persist capture", exc_info=True)
        return None


def record_grower(grower: "Grower") -> None:
    """Append to the roster, once per grower.

    Append-only rather than a database: there is no server yet worth running one
    on, and a JSONL file is trivial to inspect, export for a PDPA deletion
    request, or migrate later.
    """
    if not RETAIN or not grower.consented:
        return
    try:
        GROWERS_FILE.parent.mkdir(parents=True, exist_ok=True)
        gid = grower.id
        if GROWERS_FILE.exists():
            with GROWERS_FILE.open(encoding="utf-8") as fh:
                for line in fh:
                    if f'"id": "{gid}"' in line or f'"id":"{gid}"' in line:
                        return
        row = {"id": gid, "first_seen": time.strftime("%Y-%m-%dT%H:%M:%S%z"), **asdict(grower)}
        with GROWERS_FILE.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    except Exception:
        log.warning("could not record grower", exc_info=True)


FAILED_DIR = Path(os.getenv("FAILED_DIR", "data/failed"))


def save_failed(raw: bytes, fruit_id: str, mat_id: str, code: str) -> Path | None:
    """Keep rejected frames, grouped by reason.

    A capture that failed is more informative than one that worked — it is the
    only record of what a farmer actually pointed the phone at.
    """
    if not RETAIN or not raw:
        return None
    try:
        d = FAILED_DIR / code
        d.mkdir(parents=True, exist_ok=True)
        p = d / f"{int(time.time())}-{fruit_id}-{mat_id}-{uuid.uuid4().hex[:8]}.jpg"
        p.write_bytes(raw)
        return p
    except Exception:
        log.warning("could not persist failed capture", exc_info=True)
        return None
