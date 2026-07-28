# AI คัดผลดี — Measurement Service

FastAPI + OpenCV. Takes a phone photo of fruit on a printed calibration sheet and
returns **raw geometry**: how many fruit, where each one is, and how big it is in
millimetres.

It does **not** grade. Grade thresholds live in the client, next to the buyer who
sets them — so a farmer can re-grade a stored capture against a different
contract without re-uploading, and changing a threshold is not a deploy.

---

## Run

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

```bash
.venv/bin/python -m pytest tests/ -q      # 13 tests, no fixtures needed
```

`GET /api/health` · `POST /api/measure`

```bash
curl -X POST http://localhost:8000/api/measure \
  -F "image=@photo.jpg" -F "fruitId=longan" -F "matId=full" -F "baselineMm=410.0"
```

---

## The correction this service exists for

A homography maps the **mat plane**. Fruit sit *on* the mat, so a sphere's
equator is one radius closer to the lens than the surface the scale was
calibrated against, and it projects larger. The error is **systematic** — averaging
more fruit does not remove it:

| Camera height | True 28.4 mm reads | Bias |
|---|---|---|
| 400 mm | 29.47 mm | **+1.07** |
| 600 mm | 29.10 mm | **+0.70** |
| 1000 mm | 28.81 mm | **+0.41** |

Even at a metre that is past a ±0.3 mm target. Removing it needs the camera
height `H`, which **a homography cannot give you** — hence `solvePnP` and camera
intrinsics. For a sphere of radius `r` at horizontal distance `R` from the nadir
point:

```
d     = sqrt(R² + (H−r)²)                       camera → sphere centre
θ     = asin(r / d)                             angular radius
α     = atan(R / (H−r))                         off-axis angle
a_rad = H·(tan(α+θ) − tan(α−θ)) / 2             radial semi-axis on the plane
b_tan = H·d·tan(θ) / (H−r)                      tangential semi-axis
equiv = 2·sqrt(a_rad · b_tan)                   what the pipeline measures
```

Inverted by bisection in `optics.py`. At `R = 0` it collapses to the nadir case.

**Off-axis matters.** On a 350 mm area shot from 560 mm, corner fruit sit ~25°
off the optical axis, where a nadir-only correction is visibly wrong. The
correction is applied **per fruit**, against that fruit's own angle.

### Measured accuracy (synthetic, exact ground truth)

64 spheres of 28.4 mm across the full measurement area:

| Camera height | Recovered H | Mean | Bias | σ |
|---|---|---|---|---|
| 560 mm | 560.0 | 28.41 | **+0.01** | 0.07 |
| 700 mm | 700.0 | 28.44 | +0.04 | 0.10 |
| 900 mm | 900.0 | 28.60 | +0.20 | 0.12 |
| 1200 mm | 1200.0 | 28.65 | +0.25 | 0.06 |

Camera height recovers exactly at every distance; reprojection error 0.13 px.

**Below ~535 mm a 500 mm sheet no longer fits a 3024 px frame** and the corner
markers fall outside it. That is a real constraint on how close a farmer can hold
the phone, not a bug.

---

## Pipeline

```
Camera image → ArUco detection → camera pose (solvePnP) → perspective correction
→ scale calibration → segmentation → contour measurement → height compensation
→ report
```

| Module | |
|---|---|
| `vision/mats.py` | Sheet geometry. **Mirrors `gen_mat.py` and `mats.ts`** — if these drift, every measurement is silently wrong. |
| `vision/markers.py` | ArUco (subpixel corners), homography, `solvePnP` pose |
| `vision/optics.py` | Intrinsics + the height correction |
| `vision/segment.py` | Fruit segmentation — **the weak point, see below** |
| `vision/pipeline.py` | Orchestration |
| `tools/synthetic.py` | Physically-exact scene renderer |

---

## Known limits — read before trusting a number

**Segmentation is a classical baseline.** Colour threshold → distance transform →
watershed. It is good enough to validate the *geometry* against calipers, which
is the gate that matters first. It is **not good enough to ship a count on**:
longan in a real bunch touch and overlap, share a colour, and watershed splits
some contacts and merges others. The synthetic tests use well-separated fruit
precisely so segmentation is not what is being measured.

The fix is instance segmentation (YOLO-seg / RT-DETR) on a few hundred annotated
sheets. `segment()` is the seam — swap the body, keep the `Detection` contract.

**Intrinsics come from EXIF.** `FocalLengthIn35mmFilm`, principal point assumed
centred, no distortion model. With no EXIF it falls back to an assumed 26 mm
equivalent and **says so in `warnings`**. A per-phone-model calibration would be
better; wide/ultra-wide lenses with real distortion will need one.

**Occluded fruit are counted, never measured.** A clipped outline under-reads, and
grading on it pushes fruit into lower bands and costs the farmer money. They
appear in `counted`, are excluded from `measured`, the mean, and the grade tally.

**`processingMs` is ~1 s on a laptop** with the watershed baseline. A segmentation
model on a CPU instance will be slower — expect 3–6 s and measure it before
promising anything.

---

## Contract notes

- The client sends `baselineMm`; the server **rejects a mismatch** rather than
  measuring against geometry that is not on the table.
- Images under 1600 px on the long side are rejected — marker corner accuracy
  degrades and it propagates into every diameter.
- Captures are retained under `CAPTURE_DIR` by default. That is the training set
  for the model that has to replace the baseline; `RETAIN_CAPTURES=0` disables it.
