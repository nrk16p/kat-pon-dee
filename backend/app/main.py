"""AI คัดผลดี — measurement service.

    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

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
    MeasurementResult,
)
from .storage import save_capture, save_failed
from .vision.markers import MarkerError
from .vision.mats import MATS, get_mat
from .vision.pipeline import measure_image
from .vision.segment import SegmentParams

log = logging.getLogger("kpd")

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
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


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "opencv": cv2.__version__,
        "mats": {k: {"mat": v.mat, "baseline": v.baseline} for k, v in MATS.items()},
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
        res = measure_image(bgr, mat, params, equiv35mm=_equiv35mm(raw))
    except MarkerError as e:
        raise fail(422, e.code, **e.params) from e
    except Exception as e:  # noqa: BLE001
        log.exception("pipeline failed")
        raise fail(500, "PIPELINE_FAILED", err=str(e)[:120]) from e

    # keep the original for retraining — the segmentation model needs real sheets
    save_capture(raw, fruitId, matId)

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
