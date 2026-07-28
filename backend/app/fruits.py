"""Server-side fruit parameters.

Only what the vision stage needs: the metric to report and a plausible size
window used to reject nonsense detections. Grade thresholds deliberately live in
the client, next to the buyer who sets them.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class FruitParams:
    id: str
    metric: str          # "diameter" (round) | "length" (elongated)
    min_mm: float
    max_mm: float
    typical_mm: float
    # skin hue window, degrees; None when the crop has no distinctive colour
    hue_range: tuple[float, float] | None = None


FRUITS: dict[str, FruitParams] = {
    # near-spherical: silhouette is a circle from any angle
    # brown/tan skin at ~70 deg; the window keeps green leaves and stem out
    "longan": FruitParams("longan", "diameter", 15.0, 40.0, 28.4, (25.0, 105.0)),
    # elongated: a single "diameter" is meaningless, so the major axis is
    # reported and the UI labels it as length
    # mango skin runs green through yellow to red — no useful window, and its
    # size alone already separates it from foliage
    "mango": FruitParams("mango", "length", 60.0, 200.0, 118.0, None),
}

DEFAULT = FRUITS["longan"]


def get_fruit(fruit_id: str) -> FruitParams:
    return FRUITS.get(fruit_id, DEFAULT)
