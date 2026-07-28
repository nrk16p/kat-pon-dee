"""ArUco detection, plane rectification and camera pose."""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .mats import MatVariant
from .optics import Intrinsics

ARUCO_DICT = cv2.aruco.DICT_4X4_50
REQUIRED_IDS = (0, 1, 2, 3)


@dataclass
class MarkerFix:
    """Everything recovered from the four corner markers."""

    ids_found: list[int]
    centers_px: dict[int, tuple[float, float]]
    homography: np.ndarray            # mat mm -> source pixels
    px_per_mm: float                  # scale of the rectified image
    camera_pos_mm: tuple[float, float, float] | None  # in mat coords, from solvePnP
    intrinsics: Intrinsics | None
    reprojection_error_px: float | None
    sharpness: float = 0.0

    @property
    def complete(self) -> bool:
        return len(self.ids_found) == 4

    @property
    def camera_height_mm(self) -> float | None:
        return abs(self.camera_pos_mm[2]) if self.camera_pos_mm else None

    @property
    def nadir_mm(self) -> tuple[float, float] | None:
        """Where the optical axis meets the mat plane — the origin the off-axis
        correction measures each fruit's radial distance from."""
        return (self.camera_pos_mm[0], self.camera_pos_mm[1]) if self.camera_pos_mm else None


class MarkerError(RuntimeError):
    """Carries a message code so the API layer can localise it."""

    def __init__(self, code: str, **params):
        super().__init__(code)
        self.code = code
        self.params = params


def _detector() -> cv2.aruco.ArucoDetector:
    params = cv2.aruco.DetectorParameters()
    # subpixel corners matter: a half-pixel bias on the baseline propagates
    # straight into mm/px and therefore into every diameter
    params.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
    params.cornerRefinementWinSize = 5
    params.cornerRefinementMaxIterations = 50
    params.cornerRefinementMinAccuracy = 0.01
    return cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(ARUCO_DICT), params)


def detect(
    image: np.ndarray, mat: MatVariant, intrinsics: Intrinsics | None = None
) -> MarkerFix:
    """Find the four markers, solve the plane homography and the camera pose."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    corners, ids, _ = _detector().detectMarkers(gray)

    if ids is None:
        raise MarkerError("NO_MARKERS")

    found: dict[int, np.ndarray] = {}
    for i, c in zip(ids.flatten().tolist(), corners):
        if i in REQUIRED_IDS:
            found[int(i)] = c[0].astype(np.float64)   # 4x2, TL TR BR BL

    if len(found) < 4:
        raise MarkerError("MARKERS_INCOMPLETE", n=len(found))

    ids_found = sorted(found)
    centers = {i: tuple(found[i].mean(axis=0)) for i in ids_found}

    # homography from mat millimetres to source pixels, using all 16 corners
    src_mm, dst_px = [], []
    for i in ids_found:
        src_mm.extend(mat.marker_corners_mm(i))
        dst_px.extend(found[i].tolist())
    hom, _ = cv2.findHomography(
        np.array(src_mm, np.float64), np.array(dst_px, np.float64), method=0
    )
    if hom is None:
        raise MarkerError("HOMOGRAPHY_FAILED")

    cam_pos, reproj = None, None
    if intrinsics is not None:
        obj = np.array([[x, y, 0.0] for (x, y) in src_mm], np.float64)
        img = np.array(dst_px, np.float64)
        ok, rvec, tvec = cv2.solvePnP(
            obj, img, intrinsics.matrix, None, flags=cv2.SOLVEPNP_ITERATIVE
        )
        if ok:
            R, _ = cv2.Rodrigues(rvec)
            # camera centre in mat coordinates; Z is height above the plane
            cam = (-R.T @ tvec).ravel()
            cam_pos = (float(cam[0]), float(cam[1]), float(cam[2]))
            proj, _ = cv2.projectPoints(obj, rvec, tvec, intrinsics.matrix, None)
            reproj = float(np.sqrt(((proj.reshape(-1, 2) - img) ** 2).sum(1)).mean())

    return MarkerFix(
        ids_found=ids_found,
        centers_px=centers,
        homography=hom,
        px_per_mm=0.0,     # set by rectify()
        camera_pos_mm=cam_pos,
        intrinsics=intrinsics,
        reprojection_error_px=reproj,
    )


def measure_sharpness(image: np.ndarray, fix: "MarkerFix") -> float:
    """Focus score from the marker edges, in the ORIGINAL image.

    The markers are the highest-contrast, known-sharp edges in any capture, so
    they make a reliable focus reference. Dividing the peak edge gradient by the
    local contrast makes the score independent of exposure.

    A Laplacian variance on the rectified sheet does NOT work here: warping
    interpolates, and the score collapses from 48 to 1.0 at the first hint of
    blur and then flattens, so it cannot tell slight blur from severe.

    Calibrated against known bias:  4.0 -> +0.02 mm,  1.2 -> -0.25 mm,
    0.8 -> -0.49 mm,  0.36 -> -1.20 mm.  Below ~1.0 the reading is not reliable.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    scores = []
    for _, (cx, cy) in fix.centers_px.items():
        half = 90
        y0, y1 = max(0, int(cy - half)), int(cy + half)
        x0, x1 = max(0, int(cx - half)), int(cx + half)
        patch = gray[y0:y1, x0:x1]
        if patch.size < 100:
            continue
        contrast = float(patch.max()) - float(patch.min())
        if contrast < 20:            # marker washed out; tells us nothing
            continue
        gx = cv2.Sobel(patch, cv2.CV_64F, 1, 0, ksize=3)
        gy = cv2.Sobel(patch, cv2.CV_64F, 0, 1, ksize=3)
        scores.append(float(np.percentile(np.hypot(gx, gy), 99.5)) / contrast)
    return round(float(np.median(scores)), 3) if scores else 0.0


def rectify(
    image: np.ndarray, mat: MatVariant, fix: MarkerFix, px_per_mm: float = 8.0
) -> tuple[np.ndarray, float]:
    """Warp the sheet to a square top-down view at a fixed, known scale.

    Working at a fixed px/mm means downstream code never has to carry a scale
    factor around — a pixel is always 1/px_per_mm millimetres.
    """
    side = int(round(mat.mat * px_per_mm))
    dst = np.array(
        [[0, 0], [side, 0], [side, side], [0, side]], np.float64
    )
    src = cv2.perspectiveTransform(
        np.array([[[0, 0]], [[mat.mat, 0]], [[mat.mat, mat.mat]], [[0, mat.mat]]],
                 np.float64),
        fix.homography,
    ).reshape(-1, 2)
    warp = cv2.getPerspectiveTransform(src.astype(np.float32), dst.astype(np.float32))
    out = cv2.warpPerspective(image, warp, (side, side), flags=cv2.INTER_CUBIC)
    fix.px_per_mm = px_per_mm
    return out, px_per_mm
