"""AI คัดผลดี — measurement service.

    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import io
import logging
import os

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ExifTags

from .fruits import get_fruit
from .messages import msg, normalise_locale
from .schemas import (
    ErrorResponse,
    FruitColor,
    FruitMeasurement,
    GrowerIn,
    GrowerOut,
    MeasurementResult,
)
from pathlib import Path

from .storage import (
    CAPTURE_DIR,
    GROWERS_FILE,
    RETAIN,
    Grower,
    grower_exists,
    record_grower,
    save_capture,
    save_failed,
)


def _count_growers() -> int:
    try:
        if not GROWERS_FILE.exists():
            return 0
        with GROWERS_FILE.open(encoding="utf-8") as fh:
            return sum(1 for ln in fh if ln.strip())
    except Exception:
        return -1
from .vision.markers import MarkerError
from .vision.mats import MATS, get_mat
from .vision.pipeline import measure_image
from .vision.segment import SegmentParams

log = logging.getLogger("kpd")

MAX_UPLOAD_BYTES = 25 * 1024 * 1024

# One capture peaks near 0.5 GB. Two at once would double that and OOM a small
# instance, so the CV stage is serialised rather than left to chance — a request
# that waits is far better than a container that dies.
MAX_CONCURRENT = int(os.getenv("MAX_CONCURRENT_JOBS", "1"))
_cv_slot = asyncio.Semaphore(MAX_CONCURRENT)
# a phone photo is 12 MP+; downscaling below this loses marker corner accuracy
MIN_LONG_SIDE = 1600

app = FastAPI(title="AI คัดผลดี — Measurement API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _writable(path: Path) -> bool:
    """Can we actually persist here, right now?"""
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".write-probe"
        probe.write_text("ok")
        probe.unlink()
        return True
    except Exception:
        return False


@app.get("/api/health")
def health() -> dict:
    """Includes storage state on purpose.

    Retention is best-effort by design — a failed write must never break a
    measurement someone is waiting on. But that means a missing or unmounted
    disk loses every capture and every grower record in total silence, which is
    exactly the failure that costs you the training set. Surfacing it here makes
    it something you can see and monitor instead of discover months later.
    """
    captures_ok = _writable(CAPTURE_DIR)
    growers_ok = _writable(GROWERS_FILE.parent)
    return {
        "ok": True,
        "opencv": cv2.__version__,
        "mats": {k: {"mat": v.mat, "baseline": v.baseline} for k, v in MATS.items()},
        "storage": {
            "retain": RETAIN,
            "captureDir": str(CAPTURE_DIR),
            "capturesWritable": captures_ok,
            "growersFile": str(GROWERS_FILE),
            "growersWritable": growers_ok,
            "growersRecorded": _count_growers(),
            # if this is false while retain is on, photos and grower records are
            # being dropped on the floor
            "persisting": bool(RETAIN and captures_ok and growers_ok),
        },
    }


def _equiv35mm(raw: bytes) -> float | None:
    """35 mm-equivalent focal length from EXIF — without it the camera height,
    and therefore the height correction, is only approximate."""
    try:
        exif = Image.open(io.BytesIO(raw)).getexif()
        if not exif:
            return None
        tags = {ExifTags.TAGS.get(k, k): v for k, v in exif.items()}
        v = tags.get("FocalLengthIn35mmFilm")
        return float(v) if v else None
    except Exception:
        return None


@app.post("/api/grower", response_model=GrowerOut, responses={422: {"model": ErrorResponse}})
def register_grower(body: GrowerIn, locale: str = "th") -> GrowerOut:
    """Register a grower once and hand back their pseudonymous id.

    Separated from /api/measure so a name and phone number travel over the wire
    exactly once, instead of riding along with every photo for the rest of time.
    After this the client sends only `growerId`.
    """
    lc = normalise_locale(locale)
    g = Grower(
        name=body.name,
        phone=body.phone,
        province=body.province,
        orchard=body.orchard,
        consent_at=body.consentAt,
        line_user_id=body.lineUserId,
    )
    if not g.consent_at:
        raise HTTPException(422, msg("NO_CONSENT", lc))
    if not g.id:
        raise HTTPException(422, msg("NO_IDENTITY", lc))

    existed = grower_exists(g.id)
    record_grower(g)
    log.info("grower %s %s", g.id, "returning" if existed else "registered")
    return GrowerOut(growerId=g.id, isNew=not existed)


@app.post(
    "/api/measure",
    response_model=MeasurementResult,
    responses={422: {"model": ErrorResponse}},
)
async def measure(
    image: UploadFile = File(...),
    fruitId: str = Form("longan"),
    matId: str = Form("full"),
    baselineMm: float | None = Form(None),
    locale: str = Form("th"),
    growerId: str = Form(""),
) -> MeasurementResult:
    lc = normalise_locale(locale)

    def fail(status: int, code: str, **kw):
        # keep the failed frame: the captures that do NOT work are exactly the
        # ones worth looking at when tuning detection
        save_failed(raw, fruitId, matId, code)
        log.info("measure rejected: %s %s", code, kw)
        return HTTPException(status, msg(code, lc, **kw))

    raw = await image.read()
    if not raw:
        raise HTTPException(422, msg("EMPTY_UPLOAD", lc))
    if len(raw) > MAX_UPLOAD_BYTES:
        raise fail(413, "IMAGE_TOO_LARGE", max_mb=MAX_UPLOAD_BYTES // (1024 * 1024))

    try:
        mat = get_mat(matId)
    except KeyError as e:
        raise fail(422, "UNKNOWN_MAT", mat_id=matId) from e

    # the client tells us which sheet it printed; disagreeing on the baseline
    # means one side is measuring against geometry that is not on the table
    if baselineMm is not None and abs(baselineMm - mat.baseline) > 0.01:
        raise fail(422, "BASELINE_MISMATCH", client=baselineMm,
                   mat_id=matId, server=mat.baseline)

    bgr = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if bgr is None:
        raise fail(422, "DECODE_FAILED")
    if max(bgr.shape[:2]) < MIN_LONG_SIDE:
        raise fail(422, "IMAGE_TOO_SMALL", w=bgr.shape[1], h=bgr.shape[0],
                   min_px=MIN_LONG_SIDE)

    fruit = get_fruit(fruitId)
    params = SegmentParams(
        metric=fruit.metric,
        min_mm=fruit.min_mm,
        max_mm=fruit.max_mm,
        hue_range=fruit.hue_range,
    )

    try:
        async with _cv_slot:
            # off the event loop: OpenCV holds the GIL for seconds at a time and
            # would otherwise stall health checks and every other request
            res = await asyncio.to_thread(
                measure_image, bgr, mat, params, _equiv35mm(raw)
            )
    except MarkerError as e:
        raise fail(422, e.code, **e.params) from e
    except Exception as e:  # noqa: BLE001
        log.exception("pipeline failed")
        raise fail(500, "PIPELINE_FAILED", err=str(e)[:120]) from e

    # keep the original for retraining — the segmentation model needs real sheets
    save_capture(raw, fruitId, matId, grower_id=growerId)

    # colour summary over the fruit whose outline was fully visible
    lit = [f.color for f in res.fruits if f.color and not f.occluded]
    avg = (lambda key: round(sum(c[key] for c in lit) / len(lit), 1)) if lit else None

    return MeasurementResult(
        fruitId=fruitId,
        matId=matId,
        counted=res.counted,
        measured=res.measured,
        meanDiameter=res.mean,
        minDiameter=res.minimum,
        maxDiameter=res.maximum,
        stdDiameter=res.std,
        scale=res.scale_mm_per_px,
        cameraHeight=res.camera_height_mm,
        heightCorrected=res.height_corrected,
        markersFound=res.markers_found,
        processingMs=res.processing_ms,
        fruits=[
            FruitMeasurement(
                i=f.i, x=f.x, y=f.y, d=f.d,
                confidence=f.confidence, occluded=f.occluded, grade=None,
                color=FruitColor(**f.color) if f.color else None,
            )
            for f in res.fruits
        ],
        colorCalibrated=res.color_calibrated,
        colorNote=res.color_note,
        meanL=avg("L") if avg else None,
        meanChroma=avg("chroma") if avg else None,
        meanUniformity=avg("uniformity") if avg else None,
        intrinsicsSource=res.intrinsics_source,
        reprojectionErrorPx=res.reprojection_error_px,
        sharpness=res.sharpness,
        warnings=[msg(code, lc, **kw) for code, kw in res.warnings],
    )
