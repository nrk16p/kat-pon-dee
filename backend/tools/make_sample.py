#!/usr/bin/env python3
"""Build the bundled demo capture shipped with the app.

Diameters are drawn from N(28.4, 1.1) so the grade split is a real distribution
across AA/A/B rather than one flat band — a demo that only ever shows AA teaches
the farmer nothing about what the tool does.
"""
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.vision.mats import get_mat            # noqa: E402
from tools.synthetic import Sphere, render     # noqa: E402


def main(out: str) -> None:
    mat = get_mat("full")
    rng = np.random.default_rng(20260728)

    step = 40.0
    lo, hi = mat.area_lo + 22, mat.area_hi - 22
    spheres, ds = [], []
    y = lo
    while y <= hi:
        x = lo
        while x <= hi:
            d = float(np.clip(rng.normal(28.4, 1.1), 24.5, 32.0))
            spheres.append(Sphere(x + rng.uniform(-3, 3), y + rng.uniform(-3, 3), d))
            ds.append(d)
            x += step
        y += step

    # skin_noise gives the surface-uniformity metric something real to read
    img, gt = render(mat, spheres, height_mm=620.0, offset_mm=(14.0, -9.0),
                     skin_noise=7.0)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(out, img, [cv2.IMWRITE_JPEG_QUALITY, 92])

    a = np.array(ds)
    bands = {"AA": (a >= 28).sum(), "A": ((a >= 25) & (a < 28)).sum(),
             "B": ((a >= 22) & (a < 25)).sum()}
    print(f"{out}  {img.shape[1]}x{img.shape[0]}  {Path(out).stat().st_size // 1024} KB")
    print(f"  {len(ds)} fruit  mean {a.mean():.2f} mm  range {a.min():.1f}-{a.max():.1f}")
    print(f"  true grades: {bands}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "../frontend/public/samples/longan-sample.jpg")
