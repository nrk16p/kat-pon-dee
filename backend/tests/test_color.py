"""Colour must describe the fruit, not the light that fell on it."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.vision.mats import get_mat                      # noqa: E402
from app.vision.pipeline import measure_image            # noqa: E402
from app.vision.segment import SegmentParams             # noqa: E402
from tools.synthetic import Sphere, render               # noqa: E402

LIGHTS = {
    "daylight": (1.00, 1.00, 1.00),
    "tungsten": (0.78, 0.94, 1.18),
    "shade": (1.20, 1.02, 0.84),
    "dim": (0.75, 0.75, 0.75),
}


def _run(tint, skin_noise=6.0):
    mat = get_mat("full")
    sph = [Sphere(150 + 55 * (i % 4), 150 + 55 * (i // 4), 28.4) for i in range(16)]
    img, _ = render(mat, sph, height_mm=620.0, tint=tint, skin_noise=skin_noise)
    return measure_image(img, mat, SegmentParams(), equiv35mm=26.0)


def test_colour_calibrates_under_every_light():
    for name, tint in LIGHTS.items():
        res = _run(tint)
        assert res.color_calibrated, f"{name}: {res.color_note}"


def test_segmentation_survives_a_colour_cast():
    """Detection runs on the corrected image; a warm bulb used to lose every fruit."""
    for name, tint in LIGHTS.items():
        res = _run(tint)
        assert res.measured == 16, f"{name}: measured {res.measured} of 16"


def test_same_fruit_reads_the_same_colour_under_any_light():
    """The point of the printed strip. Uncorrected, a* swings by ~9 across these."""
    means = {}
    for name, tint in LIGHTS.items():
        res = _run(tint)
        cs = [f.color for f in res.fruits if f.color and not f.occluded]
        means[name] = {k: np.mean([c[k] for c in cs]) for k in ("L", "a", "b")}

    for channel, tol in (("L", 1.5), ("a", 2.5), ("b", 2.5)):
        vals = [m[channel] for m in means.values()]
        assert np.ptp(vals) < tol, (
            f"{channel}* varies by {np.ptp(vals):.1f} across lighting: {means}"
        )


def test_uniformity_tracks_actual_skin_mottling():
    """A blemish metric that ignores blemishes is worse than none at all."""
    smooth = _run(LIGHTS["daylight"], skin_noise=0.0)
    mottled = _run(LIGHTS["daylight"], skin_noise=14.0)

    def mean_uniformity(res):
        cs = [f.color for f in res.fruits if f.color and not f.occluded]
        return float(np.mean([c["uniformity"] for c in cs]))

    assert mean_uniformity(mottled) > mean_uniformity(smooth) * 2


def test_missing_colour_strip_is_reported_not_guessed():
    """A bare sheet with no strip must say so rather than invent a correction."""
    mat = get_mat("full")
    # a sheet printed without the strip -- not a blacked-out one, which would
    # also cover the corner markers and fail for the wrong reason
    img, _ = render(mat, [Sphere(250, 250, 28.4)], height_mm=620.0, with_strip=False)
    res = measure_image(img, mat, SegmentParams(), equiv35mm=26.0)
    assert res.markers_found == 4, "the sheet must still be located"
    assert not res.color_calibrated
    assert "WARN_COLOR_UNCALIBRATED" in [c for c, _ in res.warnings]
