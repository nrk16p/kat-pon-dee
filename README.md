# AI คัดผลดี · kat-pon-dee

**AI Smart Fruit Grading Platform** — measure and grade fruit from a phone photo
taken on a printed calibration sheet.

Point a phone at fruit laid on a printed mat. Four ArUco markers give the camera
absolute scale, so every fruit is counted, measured in millimetres, colour-checked
and graded. Thai-first, offline-capable, built for growers.

```
frontend/   React 19 + Vite + Tailwind v4 PWA   → Vercel
backend/    FastAPI + OpenCV                     → laptop + Cloudflare tunnel
tools/      contract check (blocking in CI)
```

See **[DEPLOY.md](DEPLOY.md)** to get it running.

---

## What it does

`ArUco detection → camera pose → perspective correction → scale calibration →
colour calibration → segmentation → measurement → height compensation → report`

- **Count** every fruit on the sheet
- **Measure** diameter in mm (round fruit) or major axis (elongated fruit)
- **Colour & skin** in CIE L\*a\*b\*, corrected against a printed 24-patch strip
- **Grade** against thresholds that live in the client, editable per buyer

Currently: **ลำไย** (longan) and **มะม่วง** (mango).

---

## The problem this exists to solve

A homography maps the **mat plane**. Fruit sit *on* the mat, so a sphere's equator
is one radius closer to the lens than the surface the scale was calibrated
against, and it projects larger. The error is **systematic** — averaging more fruit
does not remove it:

| Camera height | True 28.4 mm reads | Bias |
|---|---|---|
| 400 mm | 29.47 mm | **+1.07** |
| 1000 mm | 28.81 mm | **+0.41** |

Removing it needs the camera height, which a homography cannot give you — hence
`solvePnP` and camera intrinsics, and a correction applied **per fruit** against
its own off-axis angle. Details and the closed form in
[`backend/app/vision/optics.py`](backend/app/vision/optics.py).

**Measured against exact ground truth** (64 spheres, full measurement area):

| Camera height | Recovered | Mean (truth 28.4) | Bias |
|---|---|---|---|
| 560 mm | 560.0 | 28.41 | **+0.01** |
| 900 mm | 900.0 | 28.60 | +0.20 |

---

## Capacity, measured

500 mm sheet, 350 × 350 mm measurement area, longan at 28.4 mm:

| Spacing | Fruit | Counted | **Measured** |
|---|---|---|---|
| 36 mm | 81 | 100% | **100%** |
| 32 mm | 100 | 100% | 72% |
| 30 mm | 121 | 100% | 2% |
| 22 mm | 196 | **−45%** | 0% |

**~81 fruit** is the practical ceiling for full measurement; counting stays exact
to ~169. Fruit that touch are counted but **not** measured — a clipped outline
under-reads, and grading on it costs the farmer money.

---

## Status

Everything above is verified **against synthetic captures with exact ground
truth** — 39 tests, including 15 orchard scenarios (tilt, shadow, dim light,
LINE compression, blur, leaves in frame, fingers over markers).

**Not yet validated against real fruit.** Segmentation is a classical watershed
baseline: fine for proving the geometry, *not* good enough to ship a count on.
Real longan touch, overlap and share a colour. The next gate is a printed sheet,
real fruit and a pair of digital calipers.

> The bar these tests hold to is not "always succeeds" — some captures genuinely
> cannot be measured. It is **never report a confidently wrong number**, and when
> it fails, say what to change.

Grade thresholds are **provisional** and marked as such in the app. Confirm them
against มกอช./TAS or a buyer's contract before anyone sells on them.
