"""The measurement pipeline, end to end.

    Camera image
      -> ArUco detection
      -> Camera pose (solvePnP)        <- needed for the height correction
      -> Perspective correction
      -> Scale calibration
      -> Fruit segmentation
      -> Contour measurement
      -> Height compensation           <- removes the systematic +1 mm bias
      -> Measurement report
"""
from __future__ import annotations

import math
import os
import time
from dataclasses import dataclass, field

import numpy as np

from .color import apply as apply_color, calibrate, to_lab
from .mats import MatVariant
from .markers import MarkerError, detect, measure_sharpness, rectify
from .optics import Intrinsics, intrinsics_from_exif, solve_true_diameter
from .segment import Detection, SegmentParams, segment

# Rectified sheet resolution. Drives both accuracy and peak memory:
#   8 px/mm -> 482 MB peak, bias -0.05 mm
#   5 px/mm -> 339 MB peak, bias -0.17 mm
# 8 is the default because the accuracy is the point; drop it only to fit a
# small instance, and know what it costs.
RECT_PX_PER_MM = float(os.getenv("RECT_PX_PER_MM", "8.0"))


@dataclass
class FruitResult:
    i: int
    x: float
    y: float
    d: float
    confidence: float
    occluded: bool
    color: dict | None = None


@dataclass
class PipelineResult:
    counted: int
    measured: int
    mean: float
    minimum: float
    maximum: float
    std: float
    scale_mm_per_px: float
    camera_height_mm: float | None
    height_corrected: bool
    markers_found: int
    color_calibrated: bool
    color_note: str
    intrinsics_source: str | None
    reprojection_error_px: float | None
    sharpness: float
    # 3x3 homography, row-major: mat millimetres -> pixels in the ORIGINAL photo.
    # Lets the client draw the detections back onto the farmer's own picture
    # instead of the server shipping a second image for it.
    homography: list[float]
    processing_ms: int
    fruits: list[FruitResult] = field(default_factory=list)
    warnings: list[tuple[str, dict]] = field(default_factory=list)


def measure_image(
    bgr: np.ndarray,
    mat: MatVariant,
    params: SegmentParams,
    equiv35mm: float | None = None,
    intrinsics: Intrinsics | None = None,
) -> PipelineResult:
    t0 = time.perf_counter()
    warnings: list[tuple[str, dict]] = []

    h, w = bgr.shape[:2]
    if intrinsics is None:
        intrinsics = intrinsics_from_exif(w, h, equiv35mm)
    if intrinsics.source == "assumed":
        warnings.append(("WARN_NO_EXIF_FOCAL", {}))

    fix = detect(bgr, mat, intrinsics)

    if fix.reprojection_error_px is not None and fix.reprojection_error_px > 3.0:
        warnings.append(("WARN_HIGH_REPROJECTION",
                         {"px": round(fix.reprojection_error_px, 1)}))

    fix.sharpness = measure_sharpness(bgr, fix)
    if fix.sharpness < 1.0:
        warnings.append(("WARN_BLURRY", {"score": fix.sharpness}))

    rect, px_per_mm = rectify(bgr, mat, fix, RECT_PX_PER_MM)

    # colour is meaningless without the printed reference: the same fruit at noon
    # and at dusk gives completely different RGB
    cal = calibrate(rect, mat, px_per_mm)
    if not cal.applied:
        warnings.append(("WARN_COLOR_UNCALIBRATED", {"why": cal.note}))
    # Crop to the measurement area BEFORE any float conversion. The colour strip
    # has already been sampled from the full sheet, so nothing is lost.
    lo = int(round(mat.area_lo * px_per_mm))
    hi = int(round(mat.area_hi * px_per_mm))
    crop = rect[lo:hi, lo:hi].copy()
    del rect

    corrected = apply_color(crop, cal)
    del crop
    lab = to_lab(corrected)

    seg_stats: dict = {}
    dets: list[Detection] = segment(corrected, mat, px_per_mm, params, lab, seg_stats)
    del lab

    # Past ~20% overlap every fruit fuses into one blob, which then fails the
    # size filter and vanishes. Reporting "no fruit found" for a mat that is
    # visibly covered in fruit is worse than useless -- say what to change.
    coverage = seg_stats.get("coverage", 0.0)
    if coverage > 0.05 and len(dets) < 3:
        warnings.append(("WARN_TOO_CROWDED", {"pct": round(coverage * 100)}))

    # Correct each fruit against its own off-axis angle: a fruit at the corner
    # of a 350 mm sheet sits ~25 deg off the optical axis, where a nadir-only
    # correction is visibly wrong.
    height = fix.camera_height_mm
    nadir = fix.nadir_mm
    applied = height is not None and height > 0
    if applied:
        corrected = np.array(
            [
                solve_true_diameter(
                    d.size_mm, height, math.hypot(d.x_mm - nadir[0], d.y_mm - nadir[1])
                )
                for d in dets
            ],
            dtype=np.float64,
        )
    else:
        corrected = np.array([d.size_mm for d in dets], dtype=np.float64)
    if not applied:
        warnings.append(("WARN_NO_CAMERA_HEIGHT", {}))

    fruits = [
        FruitResult(
            i=i,
            x=round(d.x_mm, 1),
            y=round(d.y_mm, 1),
            d=round(float(c), 1),
            confidence=d.confidence,
            occluded=d.occluded,
            color=(
                {
                    "L": d.color.L, "a": d.color.a, "b": d.color.b,
                    "chroma": d.color.chroma, "hue": d.color.hue,
                    "uniformity": d.color.uniformity,
                }
                if d.color
                else None
            ),
        )
        for i, (d, c) in enumerate(zip(dets, corrected))
    ]

    # occluded fruit are counted but never measured: a clipped outline
    # under-reads, and grading on it pushes fruit into lower bands
    good = np.array([f.d for f in fruits if not f.occluded], dtype=np.float64)

    return PipelineResult(
        counted=len(fruits),
        measured=int(good.size),
        mean=round(float(good.mean()), 2) if good.size else 0.0,
        minimum=round(float(good.min()), 1) if good.size else 0.0,
        maximum=round(float(good.max()), 1) if good.size else 0.0,
        std=round(float(good.std(ddof=1)), 2) if good.size > 1 else 0.0,
        scale_mm_per_px=round(1.0 / px_per_mm, 5),
        camera_height_mm=(
            round(height, 1) if height else None
        ),
        height_corrected=applied,
        markers_found=len(fix.ids_found),
        color_calibrated=cal.applied,
        color_note=cal.note,
        intrinsics_source=intrinsics.source,
        reprojection_error_px=(
            round(fix.reprojection_error_px, 2)
            if fix.reprojection_error_px is not None
            else None
        ),
        sharpness=fix.sharpness,
        homography=[round(float(v), 8) for v in fix.homography.ravel()],
        processing_ms=int((time.perf_counter() - t0) * 1000),
        fruits=fruits,
        warnings=warnings,
    )


__all__ = ["measure_image", "PipelineResult", "FruitResult", "MarkerError"]
