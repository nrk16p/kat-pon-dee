"""Capture retention.

Every real sheet photographed is training data for the segmentation model that
has to replace the watershed baseline. Losing them means re-collecting a dataset
later, so keep the originals by default and make disabling it explicit.
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from pathlib import Path

log = logging.getLogger("kpd.storage")

CAPTURE_DIR = Path(os.getenv("CAPTURE_DIR", "data/captures"))
RETAIN = os.getenv("RETAIN_CAPTURES", "1") != "0"


def save_capture(raw: bytes, fruit_id: str, mat_id: str) -> Path | None:
    if not RETAIN:
        return None
    try:
        day = time.strftime("%Y-%m-%d")
        d = CAPTURE_DIR / day / fruit_id
        d.mkdir(parents=True, exist_ok=True)
        p = d / f"{int(time.time())}-{mat_id}-{uuid.uuid4().hex[:8]}.jpg"
        p.write_bytes(raw)
        return p
    except Exception:
        # retention must never fail a measurement the farmer is waiting on
        log.warning("could not persist capture", exc_info=True)
        return None


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
