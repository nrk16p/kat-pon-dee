#!/usr/bin/env python3
"""Assert the calibration-sheet geometry agrees everywhere it is written down.

The same numbers live in three places:

  1. the mat generator          (AI Longan Measure/tools/gen_mat.py)
  2. the backend                (backend/app/vision/mats.py)
  3. the frontend               (frontend/src/domain/mats.ts)

If they drift, nothing crashes — the app just measures against geometry that is
not on the table, and every diameter is quietly wrong. That is the worst class of
bug in this system, so it gets a blocking check instead of a comment.

Runs with the standard library only, so CI needs no dependencies.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# variant -> (mat_mm, marker_mm, inset_mm, area_mm)
EXPECTED = {
    "full": (500.0, 50.0, 20.0, 350.0),
    "a3": (280.0, 36.0, 17.0, 170.0),
    "a4": (190.0, 22.0, 14.0, 110.0),
}


def baseline(mat: float, marker: float, inset: float) -> float:
    lo = inset + marker / 2
    return round((mat - lo) - lo, 4)


def read_backend() -> dict[str, tuple[float, float, float, float]]:
    src = (ROOT / "backend/app/vision/mats.py").read_text()
    out = {}
    for m in re.finditer(
        r'"(\w+)":\s*MatVariant\(\s*"(\w+)",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)',
        src,
    ):
        out[m.group(1)] = tuple(float(m.group(i)) for i in (3, 4, 5, 6))
    return out


def read_frontend() -> dict[str, tuple[float, float, float]]:
    """Frontend stores mat/marker/baseline/area (no inset)."""
    src = (ROOT / "frontend/src/domain/mats.ts").read_text()
    out = {}
    for block in re.finditer(r"(\w+):\s*\{(.*?)\n  \},", src, re.S):
        key, body = block.group(1), block.group(2)
        if key not in EXPECTED:
            continue
        vals = {}
        for field in ("mat", "marker", "baseline", "area"):
            m = re.search(rf"\b{field}:\s*([\d.]+)", body)
            if m:
                vals[field] = float(m.group(1))
        if len(vals) == 4:
            out[key] = (vals["mat"], vals["marker"], vals["baseline"], vals["area"])
    return out


def main() -> int:
    problems: list[str] = []

    backend = read_backend()
    frontend = read_frontend()

    for key, (mat, marker, inset, area) in EXPECTED.items():
        want_baseline = baseline(mat, marker, inset)

        if key not in backend:
            problems.append(f"backend is missing mat '{key}'")
        elif backend[key] != (mat, marker, inset, area):
            problems.append(
                f"backend '{key}' = {backend[key]}, expected {(mat, marker, inset, area)}"
            )

        if key not in frontend:
            problems.append(f"frontend is missing mat '{key}'")
        else:
            fm, fmark, fbase, farea = frontend[key]
            if (fm, fmark, farea) != (mat, marker, area):
                problems.append(
                    f"frontend '{key}' geometry = {(fm, fmark, farea)}, "
                    f"expected {(mat, marker, area)}"
                )
            if abs(fbase - want_baseline) > 1e-6:
                problems.append(
                    f"frontend '{key}' baseline = {fbase}, expected {want_baseline}"
                )

        print(f"  {key:5s} mat={mat:6.1f} marker={marker:5.1f} "
              f"area={area:6.1f} baseline={want_baseline:7.3f}")

    if problems:
        print("\nCONTRACT BROKEN — the printed sheet and the code disagree:\n")
        for p in problems:
            print(f"  ✗ {p}")
        print(
            "\nFix all three of gen_mat.py, backend/app/vision/mats.py and "
            "frontend/src/domain/mats.ts together, then REPRINT the sheet."
        )
        return 1

    print("\nOK — sheet geometry agrees across backend and frontend.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
