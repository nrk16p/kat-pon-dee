"""Camera intrinsics and the fruit-height correction.

THE CORRECTION THIS MODULE EXISTS FOR
-------------------------------------
A homography maps the *mat plane*. Fruit sit ON the mat, so a sphere's equator is
one radius closer to the camera than the surface the scale was calibrated
against, and it projects larger. The error is systematic, so averaging more fruit
does not remove it:

    H =  400 mm   true 28.4 mm  ->  reads 29.47 mm   (+1.07)
    H =  600 mm   true 28.4 mm  ->  reads 29.10 mm   (+0.70)
    H = 1000 mm   true 28.4 mm  ->  reads 28.81 mm   (+0.41)

Even at a metre this is past a +/-0.3 mm target. Removing it needs the camera
height H, which a homography cannot give — hence solvePnP and intrinsics.

FORWARD MODEL
    A sphere of radius r rests on the plane, so its centre is at height r and
    lies at distance d = H - r from a pinhole at height H. Its angular radius
    obeys sin(theta) = r / d, and the apparent radius expressed in plane
    millimetres is

        a = H * tan(theta) = H * r / sqrt((H - r)^2 - r^2)

INVERSE (what we apply)
    Solving that for r gives a closed form, no iteration:

        r = a * (sqrt(a^2 + H^2) - a) / H
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Intrinsics:
    fx: float
    fy: float
    cx: float
    cy: float
    source: str          # "exif" | "assumed" | "calibrated"

    @property
    def matrix(self) -> np.ndarray:
        return np.array(
            [[self.fx, 0.0, self.cx], [0.0, self.fy, self.cy], [0.0, 0.0, 1.0]],
            dtype=np.float64,
        )


# Most phone main cameras sit near a 26 mm full-frame equivalent.
# Only a fallback: it makes the height correction approximate, never exact.
ASSUMED_EQUIV_35MM = 26.0
FULL_FRAME_WIDTH_MM = 36.0


def intrinsics_from_exif(
    width: int, height: int, equiv35mm: float | None
) -> Intrinsics:
    """Pinhole intrinsics from a 35 mm-equivalent focal length.

    f_px = (f_35 / 36 mm) * image_width_px, with the principal point assumed
    centred. Good enough for pose; not a substitute for a real calibration if
    the lens has meaningful distortion.
    """
    f35 = equiv35mm if equiv35mm and equiv35mm > 0 else ASSUMED_EQUIV_35MM
    long_side = max(width, height)
    f_px = (f35 / FULL_FRAME_WIDTH_MM) * long_side
    return Intrinsics(
        fx=f_px,
        fy=f_px,
        cx=width / 2.0,
        cy=height / 2.0,
        source="exif" if equiv35mm else "assumed",
    )


def apparent_from_true(true_d_mm: float, height_mm: float) -> float:
    """Forward model — what the uncorrected pipeline would report. For tests."""
    r = true_d_mm / 2.0
    inner = (height_mm - r) ** 2 - r**2
    if inner <= 0:
        raise ValueError("camera is inside the sphere")
    return 2.0 * height_mm * r / math.sqrt(inner)


def true_from_apparent(apparent_d_mm: float, height_mm: float) -> float:
    """Remove the sphere-height bias. Exact, closed form.

    r = a * (sqrt(a^2 + H^2) - a) / H,  where a is the apparent radius.
    """
    if height_mm <= 0:
        return apparent_d_mm
    a = apparent_d_mm / 2.0
    r = a * (math.sqrt(a * a + height_mm * height_mm) - a) / height_mm
    return 2.0 * r


def correct_diameters(
    apparent_mm: np.ndarray, height_mm: float | None
) -> tuple[np.ndarray, bool]:
    """Vectorised nadir correction. Returns (corrected, applied).

    Exact only directly under the lens. Prefer `solve_true_diameter`, which also
    accounts for how far off-axis the fruit sits.
    """
    if height_mm is None or height_mm <= 0:
        return apparent_mm, False
    a = apparent_mm / 2.0
    r = a * (np.sqrt(a * a + height_mm * height_mm) - a) / height_mm
    return 2.0 * r, True


# --------------------------------------------------------------- off-axis --
#
# The nadir formula above is only exact for fruit directly beneath the camera.
# Off to the side, the silhouette cone meets the mat plane obliquely and
# back-projects to an ellipse whose radial semi-axis grows faster than the
# tangential one. On a 350 mm sheet shot from ~520 mm the corner fruit sit 25 deg
# off-axis, which is far too much to ignore at a 0.3 mm target.
#
# For a sphere of radius r resting at horizontal distance R from the nadir point,
# with the camera H above the plane:
#
#     d      = sqrt(R^2 + (H - r)^2)          camera -> sphere centre
#     theta  = asin(r / d)                     angular radius
#     alpha  = atan(R / (H - r))               off-axis angle
#     a_rad  = H * (tan(alpha + theta) - tan(alpha - theta)) / 2
#     b_tan  = H * d * tan(theta) / (H - r)
#     equiv  = 2 * sqrt(a_rad * b_tan)         what the pipeline measures
#
# At R = 0 both semi-axes collapse to H*tan(theta) and this reduces exactly to
# the nadir case.


def plane_apparent_diameter(true_d_mm: float, height_mm: float, radial_mm: float) -> float:
    """Forward model: what a resting sphere measures on the rectified plane."""
    r = true_d_mm / 2.0
    hr = height_mm - r
    if hr <= 0:
        raise ValueError("camera below the top of the fruit")
    d = math.hypot(radial_mm, hr)
    if d <= r:
        raise ValueError("camera inside the sphere")
    theta = math.asin(r / d)
    alpha = math.atan2(radial_mm, hr)
    a_rad = height_mm * (math.tan(alpha + theta) - math.tan(alpha - theta)) / 2.0
    b_tan = height_mm * d * math.tan(theta) / hr
    return 2.0 * math.sqrt(a_rad * b_tan)


def solve_true_diameter(
    apparent_d_mm: float, height_mm: float, radial_measured_mm: float
) -> float:
    """Invert the model above by bisection.

    `radial_measured_mm` is where the fruit appears on the rectified sheet, which
    is pushed outward from where it actually rests by the same height effect, so
    the resting radius is recovered alongside the diameter.
    """
    if height_mm <= 0:
        return apparent_d_mm

    lo, hi = 1e-3, min(apparent_d_mm, height_mm * 0.98)
    for _ in range(60):
        mid = (lo + hi) / 2.0
        # a fruit of this size would appear displaced outward by H / (H - r)
        r_true = radial_measured_mm * (height_mm - mid / 2.0) / height_mm
        try:
            got = plane_apparent_diameter(mid, height_mm, r_true)
        except ValueError:
            hi = mid
            continue
        if got > apparent_d_mm:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2.0
