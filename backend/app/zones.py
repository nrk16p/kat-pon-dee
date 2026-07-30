"""Zone layout for hand-fed counting: fruit enters from the left or the top,
leaves to the right, and is counted on the way out.

Defined here rather than in the frontend so both sides read the same numbers.
A client that draws the zones one place and a server that counts them another
would disagree silently at the boundary, which is exactly where counting errors
come from.

All coordinates are millimetres on the printed sheet, the same frame the
pipeline reports fruit centres in.
"""
from __future__ import annotations

from dataclasses import dataclass

from .vision.mats import MatVariant

# A lane has to hold a fruit with room to place and grab it. A longan is ~28 mm,
# so 60 mm is two rows of staging or one comfortable sweep.
LANE_MM = 60.0

# Below this the work zone holds a couple of fruit and the mode is theatre.
# 150 mm is a 4x4 grid at the 36 mm spacing where nothing touches.
MIN_WORK_MM = 150.0


class ZoneError(ValueError):
    """The sheet is too small to divide into zones."""

    def __init__(self, code: str, **params):
        super().__init__(code)
        self.code = code
        self.params = params


@dataclass(frozen=True)
class Zone:
    key: str
    x0: float
    y0: float
    x1: float
    y1: float

    def contains(self, x: float, y: float) -> bool:
        return self.x0 <= x < self.x1 and self.y0 <= y < self.y1


def zones_for(mat: MatVariant) -> dict[str, Zone]:
    """Split the measurement area into staging, work and exit lanes.

        lo        lo+60                  hi-60      hi
     lo  +-----------+----------------------+--------+
         |        entry_top                 |        |
     +60 +-----------+----------------------+ exit   |
         |           |                      | _right |
         | entry     |        work          |        |
         | _left     |                      |        |
     hi  +-----------+----------------------+--------+

    The exit lane runs the full height: sweeping right is one motion, and
    stopping it short of the top edge would drop fruit that were staged there.
    """
    lo, hi = mat.area_lo, mat.area_hi
    work = mat.area - 2 * LANE_MM
    if work < MIN_WORK_MM:
        raise ZoneError(
            "MAT_TOO_SMALL_FOR_ZONES",
            mat_id=mat.id,
            area=round(mat.area),
            work=round(work),
            min_work=round(MIN_WORK_MM),
        )

    x_work0, x_work1 = lo + LANE_MM, hi - LANE_MM
    y_work0 = lo + LANE_MM
    return {
        "entry_top": Zone("entry_top", lo, lo, x_work1, y_work0),
        "entry_left": Zone("entry_left", lo, y_work0, x_work0, hi),
        "work": Zone("work", x_work0, y_work0, x_work1, hi),
        "exit_right": Zone("exit_right", x_work1, lo, hi, hi),
    }


def supported_mats(mats: dict[str, MatVariant]) -> list[str]:
    """Which printed sheets can run the counting mode at all.

    Only the 500 mm production sheet fits: A3 leaves a 50 mm work zone and A4
    leaves none. Surfacing this as data lets the client grey out the others
    instead of letting someone pick one and hit a wall in the orchard.
    """
    out = []
    for key, mat in mats.items():
        try:
            zones_for(mat)
        except ZoneError:
            continue
        out.append(key)
    return out


def locate(zones: dict[str, Zone], x: float, y: float) -> str:
    """Which zone a point falls in, or "" when it is off the measurement area."""
    for key in ("work", "exit_right", "entry_left", "entry_top"):
        if zones[key].contains(x, y):
            return key
    return ""


__all__ = ["Zone", "ZoneError", "zones_for", "supported_mats", "locate",
           "LANE_MM", "MIN_WORK_MM"]
