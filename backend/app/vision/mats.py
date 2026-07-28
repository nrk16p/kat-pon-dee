"""Printed-sheet geometry.

MUST stay in sync with tools/gen_mat.py in the "AI Longan Measure" project and
with src/domain/mats.ts in the frontend. These numbers are the contract with the
physical sheet: if they drift, every measurement is silently wrong.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class MatVariant:
    id: str
    mat: float        # sheet side, mm
    marker: float     # ArUco side incl. border, mm
    inset: float      # marker outer corner inset from sheet edge, mm
    area: float       # measurement area side, mm

    @property
    def centers(self) -> dict[int, tuple[float, float]]:
        """marker id -> (x, y) centre in mat millimetres."""
        lo = self.inset + self.marker / 2
        hi = self.mat - lo
        return {0: (lo, lo), 1: (hi, lo), 2: (hi, hi), 3: (lo, hi)}

    @property
    def baseline(self) -> float:
        """Centre-to-centre spacing of adjacent markers, mm — the scale reference."""
        c = self.centers
        return c[1][0] - c[0][0]

    @property
    def area_lo(self) -> float:
        return (self.mat - self.area) / 2

    @property
    def area_hi(self) -> float:
        return self.area_lo + self.area

    @property
    def quiet(self) -> float:
        return round(self.marker * 0.12, 2)

    @property
    def clear(self) -> float:
        """Margin the printed furniture keeps away from the marker quiet zones."""
        return self.inset + self.marker + self.quiet + 2 * (self.mat / 500.0)

    def colorchecker_patches_mm(self) -> list[tuple[float, float, float, float]]:
        """The 24 ColorChecker patches as (x, y, w, h) in mat millimetres.

        Mirrors the layout emitted by gen_mat.py. Sampling these gives a known
        reference under the same light as the fruit, which is the only way to
        make a colour reading mean anything across different phones and skies.
        """
        k = self.mat / 500.0
        cols, rows, gap = 12, 2, 0.6 * k
        span = self.mat - 2 * self.clear
        cw = (span - (cols - 1) * gap) / cols
        ch = cw * 1.18
        strip_w = cols * cw + (cols - 1) * gap
        strip_h = rows * ch + gap
        sx0 = (self.mat - strip_w) / 2
        band_lo = self.mat - self.inset - self.marker
        sy0 = band_lo + (self.marker - strip_h) / 2 + 1.0 * k
        return [
            (sx0 + (i % cols) * (cw + gap), sy0 + (i // cols) * (ch + gap), cw, ch)
            for i in range(cols * rows)
        ]

    def marker_corners_mm(self, mid: int) -> list[tuple[float, float]]:
        """Marker corners in mat mm, in OpenCV's ArUco order:
        top-left, top-right, bottom-right, bottom-left."""
        cx, cy = self.centers[mid]
        h = self.marker / 2
        return [(cx - h, cy - h), (cx + h, cy - h), (cx + h, cy + h), (cx - h, cy + h)]


MATS: dict[str, MatVariant] = {
    "full": MatVariant("full", 500.0, 50.0, 20.0, 350.0),
    "a3": MatVariant("a3", 280.0, 36.0, 17.0, 170.0),
    "a4": MatVariant("a4", 190.0, 22.0, 14.0, 110.0),
}


def get_mat(mat_id: str) -> MatVariant:
    if mat_id not in MATS:
        raise KeyError(f"unknown mat variant: {mat_id}")
    return MATS[mat_id]
