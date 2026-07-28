"""Ways a real capture differs from a clean render.

A farmer in an orchard is not a photographer in a studio. They shoot into their
own shadow, at arm's length, with a phone that has been in a pocket, and the
picture may reach the server after a messaging app has re-compressed it. Each
function here models one of those, so the pipeline is tested against the photos
it will actually receive.
"""
from __future__ import annotations

import cv2
import numpy as np


def blur(img: np.ndarray, sigma: float) -> np.ndarray:
    """Out of focus, or the phone moved. sigma in source pixels."""
    return cv2.GaussianBlur(img, (0, 0), sigmaX=sigma)


def exposure(img: np.ndarray, factor: float) -> np.ndarray:
    """Under- or over-exposed. >1 brightens and can clip highlights."""
    return np.clip(img.astype(np.float64) * factor, 0, 255).astype(np.uint8)


def shadow(img: np.ndarray, coverage: float = 0.45, strength: float = 0.45) -> np.ndarray:
    """The farmer's own shadow falling across part of the sheet.

    A soft diagonal edge, not a hard mask — a body at arm's length casts a
    penumbra several centimetres wide.
    """
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    d = (xx / w) * 0.7 + (yy / h) * 0.3
    edge = np.clip((d - (1.0 - coverage)) / 0.18, 0.0, 1.0)
    factor = 1.0 - strength * edge
    return np.clip(img.astype(np.float64) * factor[:, :, None], 0, 255).astype(np.uint8)


def jpeg(img: np.ndarray, quality: int) -> np.ndarray:
    """Re-encoded by a messaging app before it ever reaches the server."""
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR) if ok else img


def resize(img: np.ndarray, long_side: int) -> np.ndarray:
    """Downscaled by a share sheet or an upload limit."""
    h, w = img.shape[:2]
    s = long_side / max(h, w)
    return cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)


def cover_marker(img: np.ndarray, corner: int = 0, radius: int = 220) -> np.ndarray:
    """A thumb, a leaf or a stray fruit sitting on one of the four markers."""
    h, w = img.shape[:2]
    pts = {0: (0.20, 0.18), 1: (0.80, 0.18), 2: (0.80, 0.82), 3: (0.20, 0.82)}
    cx, cy = pts[corner]
    out = img.copy()
    cv2.circle(out, (int(w * cx), int(h * cy)), radius, (58, 74, 96), -1)
    return out


def leaves(img: np.ndarray, n: int = 5) -> np.ndarray:
    """Stem and leaves left attached to the bunch — green, elongated, not fruit."""
    h, w = img.shape[:2]
    rng = np.random.default_rng(3)
    out = img.copy()
    for _ in range(n):
        cx = int(w * rng.uniform(0.34, 0.66))
        cy = int(h * rng.uniform(0.34, 0.66))
        cv2.ellipse(
            out, (cx, cy),
            (int(w * rng.uniform(0.035, 0.06)), int(w * rng.uniform(0.010, 0.016))),
            float(rng.uniform(0, 180)), 0, 360, (58, 107, 74), -1, cv2.LINE_AA,
        )
    return out


def white_balance_off(img: np.ndarray, tint=(0.82, 0.97, 1.15)) -> np.ndarray:
    """Phone auto-white-balance guessing wrong under a shade cloth."""
    return np.clip(img.astype(np.float64) * np.array(tint), 0, 255).astype(np.uint8)
