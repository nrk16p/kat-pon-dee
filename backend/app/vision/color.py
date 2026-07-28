"""Skin colour and surface assessment, calibrated against the printed strip.

Why calibration is not optional here. Size is self-calibrating — the markers give
absolute scale, so a warm sky or a cheap sensor cannot change a millimetre. Colour
has no such anchor: the same fruit photographed at noon and at dusk, on two
different phones, produces wildly different RGB. A raw camera reading is not a
measurement of the fruit, it is a measurement of the light.

So every colour number here is derived AFTER mapping the image through the 24
printed patches, whose true sRGB values are known. What is reported is the fruit
relative to a known reference under the same light.

Reported per fruit:
  L*  lightness      0 (black) .. 100 (white)
  a*  green -> red
  b*  blue -> yellow
  C*  chroma          how saturated
  h   hue angle, degrees
  uniformity          spread of L* across the fruit -- blemishes and spotting
                      raise it, an even skin keeps it low
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .mats import MatVariant

# Classic X-Rite ColorChecker, sRGB — identical list to gen_mat.py.
CHECKER_SRGB = np.array(
    [
        (115, 82, 68), (194, 150, 130), (98, 122, 157), (87, 108, 67),
        (133, 128, 177), (103, 189, 170), (214, 126, 44), (80, 91, 166),
        (193, 90, 99), (94, 60, 108), (157, 188, 64), (224, 163, 46),
        (56, 61, 150), (70, 148, 73), (175, 54, 60), (231, 199, 31),
        (187, 86, 149), (8, 133, 161), (243, 243, 242), (200, 200, 200),
        (160, 160, 160), (122, 122, 121), (85, 85, 85), (52, 52, 52),
    ],
    dtype=np.float64,
)
NEUTRAL_PATCHES = (18, 19, 20, 21, 22, 23)   # white -> black greyscale ramp


@dataclass
class ColorStats:
    L: float
    a: float
    b: float
    chroma: float
    hue: float
    uniformity: float


@dataclass
class ColorCalibration:
    matrix: np.ndarray | None      # 3x3 linear correction, RGB
    applied: bool
    residual: float | None         # mean sRGB error on the patches after fitting
    note: str


def _sample_patches(rect_bgr: np.ndarray, mat: MatVariant, px_per_mm: float) -> np.ndarray:
    """Median BGR of each printed patch, sampled from its centre 60%."""
    out = np.zeros((24, 3), np.float64)
    h, w = rect_bgr.shape[:2]
    for i, (x, y, pw, ph) in enumerate(mat.colorchecker_patches_mm()):
        x0 = int((x + pw * 0.2) * px_per_mm)
        x1 = int((x + pw * 0.8) * px_per_mm)
        y0 = int((y + ph * 0.2) * px_per_mm)
        y1 = int((y + ph * 0.8) * px_per_mm)
        x0, x1 = max(0, x0), min(w, x1)
        y0, y1 = max(0, y0), min(h, y1)
        if x1 <= x0 or y1 <= y0:
            return np.zeros((0, 3))
        out[i] = np.median(rect_bgr[y0:y1, x0:x1].reshape(-1, 3), axis=0)
    return out


def calibrate(rect_bgr: np.ndarray, mat: MatVariant, px_per_mm: float) -> ColorCalibration:
    """Least-squares 3x3 map from camera RGB to reference sRGB.

    A 3x3 handles white balance and channel cross-talk together. It is fitted on
    all 24 patches, so it is over-determined and one misread patch cannot wreck it.
    """
    sampled = _sample_patches(rect_bgr, mat, px_per_mm)
    if sampled.shape[0] != 24:
        return ColorCalibration(None, False, None, "colour strip not in frame")

    cam = sampled[:, ::-1] / 255.0                 # BGR -> RGB, 0..1
    ref = CHECKER_SRGB / 255.0

    # the strip must actually be visible: a blown-out or shadowed strip has no
    # dynamic range to fit against
    span = float(np.ptp(cam[NEUTRAL_PATCHES, :].mean(axis=1)))
    if span < 0.20:
        return ColorCalibration(
            None, False, None,
            "colour strip has too little contrast (over- or under-exposed)",
        )

    m, *_ = np.linalg.lstsq(cam, ref, rcond=None)
    residual = float(np.abs(cam @ m - ref).mean() * 255.0)
    if residual > 28.0:
        return ColorCalibration(
            None, False, round(residual, 1),
            "colour calibration did not converge — reporting uncorrected colour",
        )
    return ColorCalibration(m, True, round(residual, 1), "calibrated")


def apply(rect_bgr: np.ndarray, cal: ColorCalibration) -> np.ndarray:
    """Colour-corrected BGR.

    Segmentation runs on this rather than on raw pixels: under a strong colour
    cast the sheet itself becomes saturated and fixed thresholds stop separating
    fruit from paper. Correcting first makes detection lighting-independent for
    free, since the correction has to be computed anyway.
    """
    if not cal.applied or cal.matrix is None:
        return rect_bgr
    # float32, not float64: a 12 MP sheet in float64 is ~380 MB per copy and
    # will OOM a 512 MB instance on its own
    rgb = rect_bgr[:, :, ::-1].astype(np.float32) / np.float32(255.0)
    h, w = rgb.shape[:2]
    m = cal.matrix.astype(np.float32)
    out = np.clip(rgb.reshape(-1, 3) @ m, 0.0, 1.0).reshape(h, w, 3)
    return (out[:, :, ::-1] * 255.0).astype(np.uint8)


def to_lab(corrected_bgr: np.ndarray) -> np.ndarray:
    """CIE L*a*b* of an ALREADY colour-corrected image.

    Takes the corrected image rather than re-applying the matrix, so the large
    intermediate array exists once instead of twice.
    """
    rgb = corrected_bgr[:, :, ::-1].astype(np.float32) / np.float32(255.0)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)


def measure_color(lab: np.ndarray, blob: np.ndarray) -> ColorStats:
    """Colour and surface uniformity of one fruit.

    The mask is eroded first: rim pixels are half background, and the shaded
    limb of a sphere is darker than the fruit — including either would report
    the geometry as if it were skin tone.
    """
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    core = cv2.erode(blob, k, iterations=2)
    if core.sum() < 40:
        core = blob
    sel = core.astype(bool)

    L = lab[:, :, 0][sel]
    a = lab[:, :, 1][sel]
    b = lab[:, :, 2][sel]
    mL, ma, mb = float(L.mean()), float(a.mean()), float(b.mean())
    hue = float(np.degrees(np.arctan2(mb, ma)) % 360.0)
    return ColorStats(
        L=round(mL, 1),
        a=round(ma, 1),
        b=round(mb, 1),
        chroma=round(float(np.hypot(ma, mb)), 1),
        hue=round(hue, 1),
        # spread of lightness across the skin: even skin stays low, spotting and
        # blemishes raise it
        uniformity=round(float(L.std()), 2),
    )
