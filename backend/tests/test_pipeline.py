"""Geometry and accuracy tests against a synthetic capture with known truth."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.fruits import get_fruit                                   # noqa: E402
from app.vision.mats import get_mat                                # noqa: E402
from app.vision.markers import detect, rectify                      # noqa: E402
from app.vision.optics import (                                    # noqa: E402
    apparent_from_true,
    intrinsics_from_exif,
    plane_apparent_diameter,
    solve_true_diameter,
    true_from_apparent,
)
from app.vision.pipeline import measure_image                      # noqa: E402
from app.vision.optics import intrinsics_from_exif as _k           # noqa: E402,F811
from app.vision.segment import SegmentParams, segment              # noqa: E402
from tools.synthetic import Sphere, grid_of_spheres, render        # noqa: E402

TRUE_D = 28.4
# 520 mm is too close: a 500 mm sheet overflows a 3024 px frame and the corner
# markers fall outside it. ~560 mm is the closest a phone can frame the full sheet.
HEIGHT = 560.0


# ------------------------------------------------------------------ optics --

def test_forward_and_inverse_are_exact_inverses():
    for h in (300.0, 400.0, 520.0, 1000.0, 2000.0):
        for d in (18.0, 28.4, 55.0, 120.0):
            assert true_from_apparent(apparent_from_true(d, h), h) == pytest.approx(
                d, abs=1e-9
            )


def test_uncorrected_bias_is_large_enough_to_matter():
    """The whole reason optics.py exists. If this ever shrinks, re-check the model."""
    expected = {400.0: 1.07, 600.0: 0.70, 1000.0: 0.41}
    for h, bias in expected.items():
        assert apparent_from_true(TRUE_D, h) - TRUE_D == pytest.approx(bias, abs=0.02)


def test_bias_always_reads_high_never_low():
    for h in (250.0, 500.0, 1500.0):
        assert apparent_from_true(TRUE_D, h) > TRUE_D


def test_offaxis_model_round_trips():
    """The position-aware model must invert exactly, at every off-axis angle."""
    for h in (560.0, 900.0):
        for radial in (0.0, 60.0, 150.0, 240.0):
            a = plane_apparent_diameter(TRUE_D, h, radial)
            # the fruit appears pushed outward, which is what the solver is given
            seen = radial * h / (h - TRUE_D / 2)
            assert solve_true_diameter(a, h, seen) == pytest.approx(TRUE_D, abs=5e-3)


def test_offaxis_fruit_appear_larger_than_nadir_fruit():
    """If this ever inverts, the sign of the off-axis term is wrong."""
    h = 560.0
    centre = plane_apparent_diameter(TRUE_D, h, 0.0)
    corner = plane_apparent_diameter(TRUE_D, h, 240.0)
    assert corner > centre + 0.5


# ------------------------------------------------------------------ markers --

def test_mat_baselines_match_the_printed_sheets():
    assert get_mat("full").baseline == pytest.approx(410.0)
    assert get_mat("a3").baseline == pytest.approx(210.0)
    assert get_mat("a4").baseline == pytest.approx(140.0)


# ----------------------------------------------------------------- pipeline --

@pytest.fixture(scope="module")
def synthetic():
    mat = get_mat("full")
    img, gt = render(mat, grid_of_spheres(mat, TRUE_D, gap=10.0), height_mm=HEIGHT)
    return mat, img, gt


def test_all_four_markers_detected(synthetic):
    mat, img, gt = synthetic
    res = measure_image(img, mat, SegmentParams(), equiv35mm=gt["equiv35mm"])
    assert res.markers_found == 4


def test_camera_height_recovered(synthetic):
    mat, img, gt = synthetic
    res = measure_image(img, mat, SegmentParams(), equiv35mm=gt["equiv35mm"])
    assert res.camera_height_mm == pytest.approx(HEIGHT, rel=0.02)
    assert res.reprojection_error_px is not None
    assert res.reprojection_error_px < 2.0


def test_diameter_recovered_within_tolerance(synthetic):
    """The headline claim: mean diameter within +/-0.3 mm of truth."""
    mat, img, gt = synthetic
    fruit = get_fruit("longan")
    params = SegmentParams(metric=fruit.metric, min_mm=fruit.min_mm, max_mm=fruit.max_mm)
    res = measure_image(img, mat, params, equiv35mm=gt["equiv35mm"])

    assert res.height_corrected, "height correction did not run"
    assert res.measured >= 40, f"only {res.measured} fruit measured of 64"

    bias = res.mean - TRUE_D
    assert abs(bias) < 0.3, f"mean {res.mean} mm vs truth {TRUE_D} mm (bias {bias:+.2f})"


def test_correction_actually_improves_the_result(synthetic):
    """Compare the corrected result against the raw, uncorrected measurement."""
    mat, img, gt = synthetic
    res = measure_image(img, mat, SegmentParams(), equiv35mm=gt["equiv35mm"])

    # re-run segmentation alone to get what the pipeline saw before compensation
    k = _k(img.shape[1], img.shape[0], gt["equiv35mm"])
    fix = detect(img, mat, k)
    rect, ppm = rectify(img, mat, fix, 8.0)
    raw = np.array(
        [d.size_mm for d in segment(rect, mat, ppm, SegmentParams()) if not d.occluded]
    )

    raw_bias = abs(raw.mean() - TRUE_D)
    corrected_bias = abs(res.mean - TRUE_D)
    assert raw_bias > 0.5, f"uncorrected bias only {raw_bias:.2f} mm — nothing to fix?"
    assert corrected_bias < 0.3
    assert corrected_bias < raw_bias / 2


def test_scale_is_reported_in_mm_per_px(synthetic):
    mat, img, gt = synthetic
    res = measure_image(img, mat, SegmentParams(), equiv35mm=gt["equiv35mm"])
    assert res.scale_mm_per_px == pytest.approx(0.125, abs=1e-6)   # 1 / 8 px per mm


def test_missing_focal_length_degrades_loudly(synthetic):
    """No EXIF must not fail silently — the farmer has to be told."""
    mat, img, _ = synthetic
    res = measure_image(img, mat, SegmentParams(), equiv35mm=None)
    assert res.intrinsics_source == "assumed"
    # warnings are (code, params) so the API layer can localise them
    assert "WARN_NO_EXIF_FOCAL" in [code for code, _ in res.warnings]


def test_intrinsics_from_exif_scales_with_sensor():
    k = intrinsics_from_exif(4032, 3024, 26.0)
    assert k.fx == pytest.approx(26.0 / 36.0 * 4032)
    assert k.cx == pytest.approx(2016)
    assert k.source == "exif"


# ------------------------------------------------------- empty / no fruit --

def test_bare_sheet_reports_zero_not_grid_lines():
    """A mat with no fruit on it must count zero.

    The printed 1 cm grid used to be picked up as ~13 pieces of fruit, because
    Otsu always splits a histogram into two classes even when only one is there.
    """
    mat = get_mat("full")
    img, _ = render(mat, [], height_mm=620.0)
    res = measure_image(img, mat, SegmentParams(), equiv35mm=26.0)
    assert res.markers_found == 4, "the sheet itself must still be found"
    assert res.counted == 0, f"counted {res.counted} fruit on a bare sheet"
    assert res.measured == 0
    assert res.mean == 0.0


def test_tilted_capture_stays_accurate():
    """Perspective correction is the point — a square-on photo is not required."""
    mat = get_mat("full")
    spheres = [Sphere(150 + 50 * (i % 5), 150 + 50 * (i // 5), TRUE_D) for i in range(25)]
    for offset in (0.0, 200.0, 450.0):     # up to ~36 deg off nadir
        img, _ = render(mat, spheres, height_mm=620.0, offset_mm=(offset, 0.0))
        res = measure_image(img, mat, SegmentParams(), equiv35mm=26.0)
        assert res.markers_found == 4
        assert abs(res.mean - TRUE_D) < 0.3, f"offset {offset} mm -> mean {res.mean}"
