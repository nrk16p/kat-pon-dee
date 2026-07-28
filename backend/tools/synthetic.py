"""Render a physically-correct synthetic capture of a calibration sheet.

Why this exists: the height correction is the difference between a ~1 mm
systematic bias and a usable measurement, and there is no way to check it
against real photos until someone has a printed sheet, a bunch of longan and a
pair of calipers. A synthetic scene with exact projective geometry lets the maths
be verified today — and it stays useful afterwards as a regression test.

The renderer deliberately models the thing that matters: a fruit is a SPHERE
resting on the plane, so its centre sits one radius above the sheet and its
silhouette is computed from the true tangent cone, not from a flat circle.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.vision.color import CHECKER_SRGB       # noqa: E402
from app.vision.mats import MatVariant, get_mat  # noqa: E402

CANVAS_PX_PER_MM = 6.0
SHEET = (250, 250, 248)      # BGR, matte white
GRID = (214, 218, 216)
FRUIT = (74, 107, 139)       # BGR of longan skin #8B6B4A


@dataclass
class Sphere:
    x: float      # centre on the sheet, mm
    y: float
    d: float      # true diameter, mm


def draw_sheet(mat: MatVariant, with_strip: bool = True) -> np.ndarray:
    """The printed sheet, flat, in canvas pixels."""
    s = CANVAS_PX_PER_MM
    side = int(mat.mat * s)
    img = np.full((side, side, 3), SHEET, np.uint8)

    for v in np.arange(mat.inset, mat.mat - mat.inset + 1e-6, 10.0):
        p = int(v * s)
        cv2.line(img, (p, int(mat.inset * s)), (p, int((mat.mat - mat.inset) * s)), GRID, 1)
        cv2.line(img, (int(mat.inset * s), p), (int((mat.mat - mat.inset) * s), p), GRID, 1)

    # the 24 printed patches -- without these there is nothing to calibrate
    # colour against, and the sheet is not a faithful stand-in for the real one
    for (px, py, pw, ph), rgb in zip(
        mat.colorchecker_patches_mm() if with_strip else [], CHECKER_SRGB
    ):
        cv2.rectangle(
            img,
            (int(px * s), int(py * s)),
            (int((px + pw) * s), int((py + ph) * s)),
            (float(rgb[2]), float(rgb[1]), float(rgb[0])),
            -1,
        )

    d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    for mid, (cx, cy) in mat.centers.items():
        n = int(mat.marker * s)
        m = cv2.aruco.generateImageMarker(d, mid, n, borderBits=1)
        x0, y0 = int((cx - mat.marker / 2) * s), int((cy - mat.marker / 2) * s)
        q = int(6 * s)
        cv2.rectangle(img, (x0 - q, y0 - q), (x0 + n + q, y0 + n + q), SHEET, -1)
        img[y0:y0 + n, x0:x0 + n] = cv2.cvtColor(m, cv2.COLOR_GRAY2BGR)
    return img


def look_at(cam: np.ndarray, target: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """World->camera rotation and translation in OpenCV convention.

    Mat coordinates are image-like: x right, y DOWN, z into the table. So a
    camera looking down at the sheet sits at NEGATIVE z. Putting it at +z instead
    mirrors the view and the ArUco bit patterns stop decoding entirely.
    """
    z = target - cam
    z /= np.linalg.norm(z)
    up = np.array([0.0, 1.0, 0.0])
    x = np.cross(up, z)
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    R = np.stack([x, y, z])            # rows
    t = -R @ cam
    return R, t


def render(
    mat: MatVariant,
    spheres: list[Sphere],
    height_mm: float = 520.0,
    offset_mm: tuple[float, float] = (18.0, -12.0),
    image_size: tuple[int, int] = (4032, 3024),
    equiv35mm: float = 26.0,
    tint: tuple[float, float, float] = (1.0, 1.0, 1.0),
    skin_noise: float = 0.0,
    with_strip: bool = True,
) -> tuple[np.ndarray, dict]:
    """Return (BGR image, ground truth)."""
    W, H_img = image_size
    f_px = (equiv35mm / 36.0) * max(W, H_img)
    K = np.array([[f_px, 0, W / 2], [0, f_px, H_img / 2], [0, 0, 1]], np.float64)

    cam = np.array(
        [mat.mat / 2 + offset_mm[0], mat.mat / 2 + offset_mm[1], -height_mm], np.float64
    )
    R, t = look_at(cam, np.array([mat.mat / 2, mat.mat / 2, 0.0]))
    rvec, _ = cv2.Rodrigues(R)
    tvec = t.reshape(3, 1)

    def project(pts: np.ndarray) -> np.ndarray:
        out, _ = cv2.projectPoints(pts, rvec, tvec, K, None)
        return out.reshape(-1, 2)

    # warp the flat sheet into the camera view
    sheet = draw_sheet(mat, with_strip)
    s = CANVAS_PX_PER_MM
    corners_mm = np.array(
        [[0, 0, 0], [mat.mat, 0, 0], [mat.mat, mat.mat, 0], [0, mat.mat, 0]], np.float64
    )
    src = np.array(
        [[0, 0], [mat.mat * s, 0], [mat.mat * s, mat.mat * s], [0, mat.mat * s]],
        np.float32,
    )
    hom = cv2.getPerspectiveTransform(src, project(corners_mm).astype(np.float32))
    img = np.full((H_img, W, 3), (66, 74, 84), np.uint8)      # table
    warped = cv2.warpPerspective(sheet, hom, (W, H_img), borderMode=cv2.BORDER_TRANSPARENT,
                                 dst=img, flags=cv2.INTER_CUBIC)
    img = warped

    # spheres, painted far-to-near so nearer fruit occlude the ones behind
    order = sorted(spheres, key=lambda sp: -np.linalg.norm(
        cam - np.array([sp.x, sp.y, -sp.d / 2])
    ))
    truth = []
    for sp in order:
        r = sp.d / 2.0
        centre = np.array([[sp.x, sp.y, -r]], np.float64)
        uv = project(centre)[0]
        dist = float(np.linalg.norm(cam - centre.ravel()))
        if dist <= r:
            continue
        # exact silhouette: the tangent cone, not a flat disc
        theta = math.asin(r / dist)

        # A sphere projects to an ELLIPSE, circular only on the optical axis.
        # Drawing a circle understates the radial extent and shows up as a fake
        # ~0.7 mm shortfall in off-axis fruit, so the true conic is drawn:
        #   semi-major (radial)     f * (tan(a+th) - tan(a-th)) / 2
        #   semi-minor (tangential) f * tan(th) / cos(a)
        # with the centre at the midpoint of the radial extremes, which is not
        # the projected centre of the sphere.
        pp = np.array([W / 2.0, H_img / 2.0])
        radial = uv - pp
        rad_len = float(np.linalg.norm(radial))
        alpha = math.atan2(rad_len, f_px)
        a_img = f_px * (math.tan(alpha + theta) - math.tan(alpha - theta)) / 2.0
        b_img = f_px * math.tan(theta) / math.cos(alpha)
        mid = f_px * (math.tan(alpha + theta) + math.tan(alpha - theta)) / 2.0
        direction = radial / rad_len if rad_len > 1e-9 else np.array([1.0, 0.0])
        centre = pp + direction * mid
        angle = math.degrees(math.atan2(direction[1], direction[0]))

        cv2.ellipse(img, (int(round(centre[0])), int(round(centre[1]))),
                    (int(round(a_img)), int(round(b_img))), angle, 0, 360,
                    FRUIT, -1, lineType=cv2.LINE_AA)
        rho = b_img
        truth.append({"x": sp.x, "y": sp.y, "d": sp.d, "u": uv[0], "v": uv[1],
                      "rho_px": rho})

    if skin_noise > 0:
        # mottled skin, so surface uniformity has something real to measure
        rng = np.random.default_rng(99)
        speck = rng.normal(0.0, skin_noise, img.shape[:2])
        speck = cv2.GaussianBlur(speck, (0, 0), 3.0)
        fruit_px = np.all(np.abs(img.astype(int) - np.array(FRUIT)) < 42, axis=2)
        img = np.clip(
            img.astype(np.float64) + (speck * fruit_px)[:, :, None], 0, 255
        ).astype(np.uint8)

    if tint != (1.0, 1.0, 1.0):
        # simulate a coloured sky / tungsten bulb over the whole scene
        img = np.clip(img.astype(np.float64) * np.array(tint), 0, 255).astype(np.uint8)

    return img, {
        "height_mm": height_mm,
        "f_px": f_px,
        "equiv35mm": equiv35mm,
        "image_size": [W, H_img],
        "spheres": truth,
    }


def grid_of_spheres(
    mat: MatVariant, diameter: float, gap: float = 4.0, jitter: float = 0.0
) -> list[Sphere]:
    """Well-separated fruit, so segmentation is not the thing under test."""
    step = diameter + gap
    lo = mat.area_lo + diameter
    hi = mat.area_hi - diameter
    rng = np.random.default_rng(7)
    out: list[Sphere] = []
    y = lo
    while y <= hi:
        x = lo
        while x <= hi:
            out.append(
                Sphere(
                    x + (rng.uniform(-jitter, jitter) if jitter else 0.0),
                    y + (rng.uniform(-jitter, jitter) if jitter else 0.0),
                    diameter,
                )
            )
            x += step
        y += step
    return out


if __name__ == "__main__":
    m = get_mat("full")
    img, gt = render(m, grid_of_spheres(m, 28.4, gap=10.0))
    cv2.imwrite("synthetic.jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"synthetic.jpg  {img.shape[1]}x{img.shape[0]}  "
          f"{len(gt['spheres'])} spheres @ H={gt['height_mm']} mm")
