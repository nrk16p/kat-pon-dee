"""What happens when a real farmer takes the photo.

Each case is something that will happen in an orchard. The bar is not "always
succeeds" — some of these genuinely cannot be measured. The bar is:

    1. never report a confidently WRONG number
    2. when it fails, fail with a message that says what to change

A silent wrong answer is the only true failure here.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.fruits import get_fruit                          # noqa: E402
from app.messages import msg                              # noqa: E402
from app.vision.markers import MarkerError                # noqa: E402
from app.vision.mats import get_mat                       # noqa: E402
from app.vision.pipeline import measure_image             # noqa: E402
from app.vision.segment import SegmentParams              # noqa: E402
from tools import degrade                                 # noqa: E402
from tools.synthetic import Sphere, render                # noqa: E402

TRUE_D = 28.4
TOLERANCE = 0.5      # mm, allowed bias on a degraded capture


def orchard_scene(height_mm: float = 620.0, n: int = 25, **kw):
    """A well-laid-out sheet: fruit spread out, nothing touching."""
    mat = get_mat("full")
    step = 40.0
    lo = mat.area_lo + TRUE_D
    sph = [
        Sphere(lo + step * (i % 5), lo + step * (i // 5), TRUE_D) for i in range(n)
    ]
    img, _ = render(mat, sph, height_mm=height_mm, skin_noise=6.0, **kw)
    return mat, img


def run(mat, img, fruit_id: str = "longan"):
    """Exactly what the API does — including the crop's hue window and size
    limits. Testing with bare defaults would test a configuration that never
    actually runs in production."""
    f = get_fruit(fruit_id)
    params = SegmentParams(
        metric=f.metric, min_mm=f.min_mm, max_mm=f.max_mm, hue_range=f.hue_range
    )
    return measure_image(img, mat, params, equiv35mm=26.0)


def assert_trustworthy(res, label: str, expect_min: int = 15):
    """Either a believable answer, or no answer. Never a wrong one."""
    assert res.measured >= expect_min, f"{label}: only measured {res.measured}"
    bias = res.mean - TRUE_D
    assert abs(bias) < TOLERANCE, f"{label}: mean {res.mean} (bias {bias:+.2f} mm)"


# --------------------------------------------------- ควรทำงานได้ตามปกติ --

def test_ถ่ายเอียง_ไม่ตรงหัว():
    """ถือมือถือเอียง ~25 องศา — เกิดขึ้นแทบทุกครั้ง"""
    mat, img = orchard_scene(offset_mm=(260.0, -140.0))
    assert_trustworthy(run(mat, img), "tilted")


def test_แสงน้อย_ถ่ายในร่ม():
    mat, img = orchard_scene()
    assert_trustworthy(run(mat, degrade.exposure(img, 0.55)), "dim")


def test_แสงจ้า_กลางแดด():
    mat, img = orchard_scene()
    assert_trustworthy(run(mat, degrade.exposure(img, 1.45)), "bright")


def test_สมดุลแสงขาวเพี้ยน():
    """กล้องปรับ white balance ผิดใต้ตาข่ายพรางแสง"""
    mat, img = orchard_scene()
    assert_trustworthy(run(mat, degrade.white_balance_off(img)), "wb")


def test_ภาพถูกบีบอัดจากแอปแชท():
    """ส่งผ่าน LINE แล้วโดนบีบอัด"""
    mat, img = orchard_scene()
    assert_trustworthy(run(mat, degrade.jpeg(img, 45)), "jpeg45")


def test_ภาพเบลอเล็กน้อย():
    mat, img = orchard_scene()
    assert_trustworthy(run(mat, degrade.blur(img, 2.5)), "blur")


def test_เงาตัวเองทับแผ่น():
    """ชาวสวนยืนบังแสง เงาพาดแผ่นครึ่งหนึ่ง"""
    mat, img = orchard_scene()
    assert_trustworthy(run(mat, degrade.shadow(img)), "shadow")


def test_มีก้านและใบติดมาด้วย():
    """ใบสีเขียวต้องไม่ถูกนับเป็นผลไม้"""
    mat, img = orchard_scene()
    res = run(mat, degrade.leaves(img, n=6))
    assert res.counted <= 25, f"leaves counted as fruit: {res.counted} (25 real)"
    assert_trustworthy(res, "leaves")


def test_ถ่ายไกล_กล้องสูง_1_2_เมตร():
    mat, img = orchard_scene(height_mm=1200.0)
    assert_trustworthy(run(mat, img), "far")


# ------------------------------------- ควรล้มเหลว แต่ต้องบอกสาเหตุชัดเจน --

def test_นิ้วบังมาร์กเกอร์_ต้องบอกว่าหามาร์กเกอร์ไม่ครบ():
    mat, img = orchard_scene()
    with pytest.raises(MarkerError) as e:
        run(mat, degrade.cover_marker(img, corner=0))
    assert e.value.code in ("MARKERS_INCOMPLETE", "NO_MARKERS")
    assert "มาร์กเกอร์" in msg(e.value.code, "th", **e.value.params)


def test_ภาพเล็กเกินไป_ต้องไม่เดา():
    """ย่อขนาดจนมุมมาร์กเกอร์ไม่แม่น — ต้องปฏิเสธ ไม่ใช่เดา"""
    mat, img = orchard_scene()
    small = degrade.resize(img, 1200)
    try:
        res = run(mat, small)
    except MarkerError:
        return                      # ปฏิเสธตั้งแต่หามาร์กเกอร์ ก็ถือว่าถูก
    # ถ้ายังอ่านได้ ค่าที่ได้ต้องยังเชื่อถือได้ ไม่ใช่ผิดแบบเงียบ ๆ
    assert abs(res.mean - TRUE_D) < TOLERANCE, (
        f"downscaled capture reported {res.mean} mm without complaint"
    )


def test_เบลอหนักมาก_ต้องเตือนว่าภาพไม่คม():
    """Blur shrinks every diameter. The number may be wrong — but it must never
    be presented as if it were trustworthy."""
    mat, img = orchard_scene()
    try:
        res = run(mat, degrade.blur(img, 9.0))
    except MarkerError:
        return
    if res.measured and abs(res.mean - TRUE_D) > 0.4:
        assert "WARN_BLURRY" in [c for c, _ in res.warnings], (
            f"reported {res.mean} mm from a blurred capture with no warning"
        )


def test_ภาพคมชัดต้องไม่ขึ้นเตือนเบลอ():
    """A warning that fires on good photos trains people to ignore it."""
    mat, img = orchard_scene()
    res = run(mat, img)
    assert "WARN_BLURRY" not in [c for c, _ in res.warnings]
    assert res.sharpness > 1.0


def test_ผลไม้ล้นออกนอกกรอบวัด():
    """วางเลยกรอบ — ผลที่คาบเส้นต้องถูกนับแต่ไม่วัด"""
    mat = get_mat("full")
    inside = [Sphere(250, 150 + 40 * i, TRUE_D) for i in range(4)]
    straddling = [Sphere(mat.area_lo, 150 + 40 * i, TRUE_D) for i in range(4)]
    img, _ = render(mat, inside + straddling, height_mm=620.0)
    res = measure_image(img, mat, SegmentParams(), equiv35mm=26.0)
    clipped = [f for f in res.fruits if f.occluded]
    assert len(clipped) >= 4, "fruit crossing the boundary were measured anyway"
    if res.measured:
        assert abs(res.mean - TRUE_D) < TOLERANCE


def test_กองรวมกันแน่น_ต้องแนะนำให้เกลี่ยออก():
    """เทลำไยกองรวมกัน — ต้องบอกให้เกลี่ย ไม่ใช่บอกว่าไม่พบผลไม้"""
    mat = get_mat("full")
    rng = np.random.default_rng(7)
    sph, step = [], 20.0
    lo, hi = mat.area_lo + TRUE_D * 0.8, mat.area_hi - TRUE_D * 0.8
    y = lo
    while y <= hi:
        x = lo
        while x <= hi:
            sph.append(Sphere(x + rng.uniform(-1, 1), y + rng.uniform(-1, 1), TRUE_D))
            x += step
        y += step
    img, _ = render(mat, sph, height_mm=620.0)
    res = measure_image(img, mat, SegmentParams(), equiv35mm=26.0)
    codes = [c for c, _ in res.warnings]
    assert "WARN_TOO_CROWDED" in codes, f"no crowding advice; warnings={codes}"
