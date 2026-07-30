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
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ExifTags

from . import session as sessions
from . import zones as zonelib
from .fruits import get_fruit
from .messages import msg, normalise_locale
from .schemas import (
    CountIn,
    ErrorResponse,
    FruitColor,
    FruitMeasurement,
    GrowerIn,
    GrowerOut,
    MeasurementResult,
    SessionIn,
    SessionOut,
    UncountIn,
    ZoneOut,
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
from .vision.pipeline import LIVE_PX_PER_MM, measure_image
from .vision.segment import SegmentParams

log = logging.getLogger("kpd")

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
# A preview frame is not a photo. Live frames are deliberately small — that is
# what makes them fast — so they get their own floor. Markers still decode at
# 360p (37 px a side); 960 keeps a margin over that.
MIN_LIVE_LONG_SIDE = int(os.getenv("MIN_LIVE_LONG_SIDE", "960"))
MAX_LIVE_UPLOAD_BYTES = 4 * 1024 * 1024

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


# A Cloudflare tunnel puts this server on the public internet. Without a token
# anyone holding the URL can upload, fill the disk, and pollute the training set.
# Left unset the server stays open, which is right for `localhost` development
# and wrong the moment a tunnel is running — start.sh warns about it.
API_TOKEN = os.getenv("API_TOKEN", "")


def require_token(x_api_token: str = Header(default="")) -> None:
    if API_TOKEN and x_api_token != API_TOKEN:
        raise HTTPException(401, msg("UNAUTHORIZED", "th"))


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
    sessions_ok = _writable(sessions.SESSION_DIR)
    return {
        "ok": True,
        "opencv": cv2.__version__,
        "mats": {k: {"mat": v.mat, "baseline": v.baseline} for k, v in MATS.items()},
        "counting": {
            "supportedMats": zonelib.supported_mats(MATS),
            "livePxPerMm": LIVE_PX_PER_MM,
        },
        "auth": {"tokenRequired": bool(API_TOKEN)},
        "storage": {
            "retain": RETAIN,
            "captureDir": str(CAPTURE_DIR),
            "capturesWritable": captures_ok,
            "growersFile": str(GROWERS_FILE),
            "growersWritable": growers_ok,
            "growersRecorded": _count_growers(),
            "sessionDir": str(sessions.SESSION_DIR),
            # sessions are called out separately: a tally that is not on disk is
            # worse than a photo that is not on disk, because the farmer already
            # saw the number and believes it
            "sessionsWritable": sessions_ok,
            # if this is false while retain is on, photos and grower records are
            # being dropped on the floor
            "persisting": bool(RETAIN and captures_ok and growers_ok and sessions_ok),
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


async def _measure(
    raw: bytes,
    fruitId: str,
    matId: str,
    baselineMm: float | None,
    lc: str,
    growerId: str = "",
    *,
    live: bool = False,
) -> MeasurementResult:
    """Shared by the still capture and the live counting frame.

    The two differ only in how much they are willing to pay for accuracy — the
    geometry, the height correction and the colour handling must stay identical,
    so they run the same code rather than a second copy that drifts.
    """
    max_bytes = MAX_LIVE_UPLOAD_BYTES if live else MAX_UPLOAD_BYTES
    min_side = MIN_LIVE_LONG_SIDE if live else MIN_LONG_SIDE

    def fail(status: int, code: str, **kw):
        # keep the failed frame: the captures that do NOT work are exactly the
        # ones worth looking at when tuning detection. Live frames arrive many
        # per basket, so keeping every rejected one would bury the useful ones.
        if not live:
            save_failed(raw, fruitId, matId, code)
        log.info("measure rejected: %s %s", code, kw)
        return HTTPException(status, msg(code, lc, **kw))

    if not raw:
        raise HTTPException(422, msg("EMPTY_UPLOAD", lc))
    if len(raw) > max_bytes:
        raise fail(413, "IMAGE_TOO_LARGE", max_mb=max_bytes // (1024 * 1024))

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
    if max(bgr.shape[:2]) < min_side:
        raise fail(422, "IMAGE_TOO_SMALL", w=bgr.shape[1], h=bgr.shape[0],
                   min_px=min_side)

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
                measure_image, bgr, mat, params, _equiv35mm(raw),
                None, LIVE_PX_PER_MM if live else None,
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

    warnings = [msg(code, lc, **kw) for code, kw in res.warnings]
    if live:
        # say it on every frame, not once in a settings screen: the number on
        # screen looks exactly as authoritative as a still capture's
        warnings.append(msg("WARN_LIVE_PRECISION", lc, mm=0.5))

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
        homography=res.homography,
        warnings=warnings,
    )


@app.post(
    "/api/measure",
    response_model=MeasurementResult,
    responses={422: {"model": ErrorResponse}},
    dependencies=[Depends(require_token)],
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
    return await _measure(await image.read(), fruitId, matId, baselineMm, lc, growerId)


# ------------------------------------------------------------ counting mode --
#
# One session is one basket fed across the sheet by hand. The device runs the
# tracker and decides when a fruit has been swept out; the server holds the
# durable tally and refuses to count the same tracker id twice, so a retried
# request cannot inflate a number someone is going to sell against.


def _zones_out(mat_id: str, lc: str) -> list[ZoneOut]:
    try:
        mat = get_mat(mat_id)
    except KeyError as e:
        raise HTTPException(422, msg("UNKNOWN_MAT", lc, mat_id=mat_id)) from e
    try:
        zs = zonelib.zones_for(mat)
    except zonelib.ZoneError as e:
        raise HTTPException(422, msg(e.code, lc, **e.params)) from e
    return [ZoneOut(key=z.key, x0=z.x0, y0=z.y0, x1=z.x1, y1=z.y1) for z in zs.values()]


def _session_out(s: sessions.Session, zones: list[ZoneOut]) -> SessionOut:
    st = s.stats()
    return SessionOut(
        sessionId=s.id,
        startedAt=s.started_at,
        closedAt=s.closed_at,
        fruitId=s.fruit_id,
        matId=s.mat_id,
        zones=zones,
        counted=s.counted,
        tally=s.tally,
        meanDiameter=st["mean"],
        minDiameter=st["min"],
        maxDiameter=st["max"],
    )


def _load(sid: str, lc: str) -> sessions.Session:
    try:
        return sessions.load(sid)
    except sessions.SessionError as e:
        raise HTTPException(404 if e.code == "SESSION_NOT_FOUND" else 500,
                            msg(e.code, lc, **e.params)) from e


@app.get("/api/zones")
def get_zones(matId: str = "full", locale: str = "th") -> dict:
    """Zone geometry and which sheets can run the counting mode.

    Served so the app can grey out A3 and A4 up front rather than letting
    someone print one, drive to the orchard, and find out there.
    """
    lc = normalise_locale(locale)
    return {
        "matId": matId,
        "zones": [z.model_dump() for z in _zones_out(matId, lc)],
        "supportedMats": zonelib.supported_mats(MATS),
        "laneMm": zonelib.LANE_MM,
    }


@app.post("/api/session", response_model=SessionOut,
          dependencies=[Depends(require_token)])
def start_session(body: SessionIn, locale: str = "th") -> SessionOut:
    lc = normalise_locale(locale)
    zones = _zones_out(body.matId, lc)   # rejects an unusable sheet before opening
    try:
        s = sessions.open_session(body.fruitId, body.matId, body.growerId, body.note)
    except sessions.SessionError as e:
        raise HTTPException(500, msg(e.code, lc, **e.params)) from e
    log.info("session %s opened (%s / %s)", s.id, body.fruitId, body.matId)
    return _session_out(s, zones)


@app.post(
    "/api/session/{sid}/frame",
    response_model=MeasurementResult,
    responses={422: {"model": ErrorResponse}},
    dependencies=[Depends(require_token)],
)
async def session_frame(
    sid: str,
    image: UploadFile = File(...),
    locale: str = Form("th"),
) -> MeasurementResult:
    """One settled frame. Returns every fruit in mat millimetres plus the
    homography, which is all the on-device tracker needs.

    Fruit positions come back in sheet coordinates rather than image pixels on
    purpose: the phone gets nudged between handfuls, and a tracker keyed on
    pixels would give every fruit a new id and count the basket twice.
    """
    lc = normalise_locale(locale)
    s = _load(sid, lc)
    if s.closed_at:
        raise HTTPException(409, msg("SESSION_CLOSED", lc, session_id=sid))
    return await _measure(
        await image.read(), s.fruit_id, s.mat_id, None, lc, s.grower_id, live=True
    )


@app.post("/api/session/{sid}/count", response_model=SessionOut,
          dependencies=[Depends(require_token)])
def session_count(sid: str, body: CountIn, locale: str = "th") -> SessionOut:
    lc = normalise_locale(locale)
    try:
        s = sessions.add_counts(
            sid,
            [sessions.Counted(tid=f.tid, d=f.d, grade=f.grade, x=f.x, y=f.y,
                              borderline=f.borderline)
             for f in body.fruits],
        )
    except sessions.SessionError as e:
        status = {"SESSION_NOT_FOUND": 404, "SESSION_CLOSED": 409,
                  "SESSION_TOO_LONG": 409}.get(e.code, 500)
        raise HTTPException(status, msg(e.code, lc, **e.params)) from e
    return _session_out(s, _zones_out(s.mat_id, lc))


@app.post("/api/session/{sid}/uncount", response_model=SessionOut,
          dependencies=[Depends(require_token)])
def session_uncount(sid: str, body: UncountIn, locale: str = "th") -> SessionOut:
    lc = normalise_locale(locale)
    try:
        s = sessions.remove_counts(sid, body.tids)
    except sessions.SessionError as e:
        status = {"SESSION_NOT_FOUND": 404, "SESSION_CLOSED": 409}.get(e.code, 500)
        raise HTTPException(status, msg(e.code, lc, **e.params)) from e
    return _session_out(s, _zones_out(s.mat_id, lc))


@app.post("/api/session/{sid}/close", response_model=SessionOut,
          dependencies=[Depends(require_token)])
def session_close(sid: str, locale: str = "th") -> SessionOut:
    lc = normalise_locale(locale)
    try:
        s = sessions.close_session(sid)
    except sessions.SessionError as e:
        raise HTTPException(404 if e.code == "SESSION_NOT_FOUND" else 500,
                            msg(e.code, lc, **e.params)) from e
    log.info("session %s closed: %d fruit %s", s.id, s.counted, s.tally)
    return _session_out(s, _zones_out(s.mat_id, lc))


@app.get("/api/session/{sid}", response_model=SessionOut)
def session_get(sid: str, locale: str = "th") -> SessionOut:
    lc = normalise_locale(locale)
    s = _load(sid, lc)
    return _session_out(s, _zones_out(s.mat_id, lc))


@app.get("/api/sessions")
def session_list(limit: int = 50, growerId: str = "") -> dict:
    return {"sessions": sessions.recent(min(limit, 200), growerId)}
