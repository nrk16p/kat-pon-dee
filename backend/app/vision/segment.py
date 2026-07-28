"""Fruit segmentation on the rectified sheet.

STATUS: classical baseline (colour threshold -> distance transform -> watershed).

This is the honest weak point of the pipeline. Longan in a bunch touch and
overlap, share a colour, and sit on a light background; watershed splits some of
those contacts and merges others. It is good enough to validate the *geometry*
(scale, pose, height correction) against calipers, which is the gate that
matters first. It is not good enough to ship a count on.

The real answer is instance segmentation (YOLO-seg / RT-DETR) fine-tuned on a few
hundred annotated sheets. `segment()` is the seam: swap the body, keep the
Detection contract, and nothing downstream changes.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

from .color import ColorStats, measure_color
from .mats import MatVariant


@dataclass
class Detection:
    x_mm: float          # centre in mat millimetres
    y_mm: float
    size_mm: float       # diameter, or major axis for elongated fruit
    confidence: float    # 0..1, from shape regularity
    occluded: bool       # outline clipped by a neighbour -> size under-reads
    color: ColorStats | None = None


@dataclass
class SegmentParams:
    metric: str = "diameter"        # "diameter" | "length"
    min_mm: float = 15.0
    max_mm: float = 60.0
    # a blob this far from convex is a merge or a partial view, not one fruit
    min_solidity: float = 0.93
    min_circularity: float = 0.78   # only meaningful for round fruit
    # Fraction of a fruit's outline that runs against a neighbour. Solidity and
    # circularity barely move as fruit overlap (0.995 -> 0.996), but this climbs
    # 0% -> 30%, so it is the only reliable "part of this outline is hidden" signal.
    max_shared_boundary: float = 0.15
    # below this the blob is debris, a shadow or printed furniture -- counting it
    # as an (occluded) fruit inflates the count the farmer is shown
    min_confidence: float = 0.45
    # a blob this much bigger than the sheet's median is two fruit stuck together
    merge_ratio: float = 1.30
    # Acceptable skin hue in degrees (CIE L*a*b* hue angle). Longan skin sits at
    # ~70 deg; the leaves and stem that come attached to a bunch land at 118-133,
    # so a window rejects them outright instead of counting foliage as fruit.
    # None disables the filter for crops whose skin colour is not distinctive.
    hue_range: tuple[float, float] | None = None


# An empty sheet still has *some* saturation: JPEG noise, the grey grid, warm
# light. Below this there is simply nothing coloured on the mat.
EMPTY_SHEET_SATURATION = 25

# Otsu is only trustworthy when the histogram is genuinely bimodal.
MIN_OTSU_SATURATION = 25


def _fruit_mask(bgr: np.ndarray) -> np.ndarray:
    """Separate fruit from the (near-white, low-saturation) printed sheet."""
    blur = cv2.GaussianBlur(bgr, (5, 5), 0)
    hsv = cv2.cvtColor(blur, cv2.COLOR_BGR2HSV)
    s, v = hsv[:, :, 1], hsv[:, :, 2]

    # Nothing coloured on the sheet at all -> no fruit. Without this guard the
    # printed 1 cm grid gets reported as a dozen pieces of fruit on a bare mat.
    if float(np.percentile(s, 99.5)) < EMPTY_SHEET_SATURATION:
        return np.zeros(s.shape, np.uint8)

    # sheet: low saturation AND bright. Anything else is a candidate.
    sheet = ((s < 60) & (v > 150)).astype(np.uint8)
    mask = 1 - sheet

    # Otsu adapts the threshold under warm orchard light where the sheet is not
    # neutral -- but it ALWAYS splits into two classes, even when only one is
    # present, so it is only trusted when it lands somewhere plausible.
    thr, sat_mask = cv2.threshold(s, 0, 1, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if thr >= MIN_OTSU_SATURATION:
        mask = mask | sat_mask
    mask = (mask > 0).astype(np.uint8) * 255

    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=2)
    return mask


def _watershed(mask: np.ndarray, min_radius_px: float) -> np.ndarray:
    """Split touching blobs. Returns an int32 label image (0 = background).

    Seeds come from LOCAL maxima of the distance transform, not from a global
    threshold. A global `0.45 * dist.max()` collapses two overlapping fruit into
    one seed as soon as they overlap ~10%, and the merged blob then measures ~36 mm
    instead of two 28 mm fruit. Local maxima keep one seed per fruit past 55%
    overlap, which is what a real bunch looks like.
    """
    dist = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    # Smooth first: a raw distance transform has noisy plateaus, and every stray
    # local max becomes a phantom fruit (64 real fruit counted as 70).
    dist = cv2.GaussianBlur(dist, (0, 0), sigmaX=max(1.0, min_radius_px * 0.18))

    win = max(3, int(min_radius_px * 0.9) | 1)
    k_peak = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (win, win))
    peaks = (dist >= cv2.dilate(dist, k_peak) - 1e-3) & (dist > min_radius_px * 0.55)

    # Coalesce peaks that are closer together than one fruit: they belong to the
    # same fruit, and separate seeds would split it in two.
    merge = max(3, int(min_radius_px * 0.7) | 1)
    sure_fg = cv2.dilate(
        (peaks * 255).astype(np.uint8),
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (merge, merge)),
    )

    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    sure_bg = cv2.dilate(mask, k, iterations=3)
    unknown = cv2.subtract(sure_bg, sure_fg)

    n, markers = cv2.connectedComponents(sure_fg)
    markers = markers + 1
    markers[unknown == 255] = 0
    rgb = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
    markers = cv2.watershed(rgb, markers)
    markers[markers <= 1] = 0        # background + boundary
    return markers


def segment(
    crop_bgr: np.ndarray,
    mat: MatVariant,
    px_per_mm: float,
    p: SegmentParams,
    lab: np.ndarray | None = None,
    stats: dict | None = None,
) -> list[Detection]:
    """Detect fruit in an ALREADY-CROPPED measurement area.

    The caller crops to the measurement area first so the whole 500 mm sheet is
    never held in float — that alone was 380 MB and enough to OOM a small
    instance. Coordinates are offset back to mat millimetres on the way out.
    """
    crop = crop_bgr
    lab_crop = lab
    if crop.size == 0:
        return []

    mask = _fruit_mask(crop)
    if stats is not None:
        stats["coverage"] = float((mask > 0).mean())
    if not mask.any():
        return []
    min_radius_px = p.min_mm * px_per_mm / 2.0
    min_px_area = math.pi * min_radius_px**2 * 0.5
    labels = _watershed(mask, min_radius_px)

    h, w = mask.shape
    out: list[Detection] = []
    ring = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    binary = (mask > 0).astype(np.uint8)
    split = labels > 1
    for label in range(2, labels.max() + 1):
        blob = (labels == label).astype(np.uint8)
        # watershed marks its dividing line -1 and we drop it, which shaves a
        # 1 px ring off every fruit (~0.25 mm at 8 px/mm). Give it back, clipped
        # to the original mask so nothing grows past the real edge.
        blob = cv2.dilate(blob, ring, iterations=1) & binary
        area = float(blob.sum())
        if area < min_px_area:
            continue

        cnts, _ = cv2.findContours(blob, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue
        c = max(cnts, key=cv2.contourArea)
        a = float(cv2.contourArea(c))
        if a <= 0:
            continue

        hull = cv2.convexHull(c)
        hull_a = float(cv2.contourArea(hull)) or a
        solidity = a / hull_a
        perim = float(cv2.arcLength(c, True)) or 1.0
        circularity = 4.0 * math.pi * a / (perim * perim)

        (cx, cy), _ = cv2.minEnclosingCircle(c)

        if p.metric == "length":
            # elongated fruit: report the major axis, never a "diameter"
            (_, _), (rw, rh), _ = cv2.minAreaRect(c)
            size_px = max(rw, rh)
        else:
            # equivalent-area diameter is far steadier than a min-enclosing
            # circle, which one stray boundary pixel can inflate
            size_px = 2.0 * math.sqrt(a / math.pi)

        size_mm = size_px / px_per_mm
        if not (p.min_mm <= size_mm <= p.max_mm):
            continue

        # how much of this outline is pressed against another fruit
        grown = cv2.dilate(blob, ring, iterations=2)
        others = (split & (labels != label)).astype(np.uint8)
        rim = int(cv2.dilate(blob, ring, iterations=1).sum() - blob.sum())
        shared = int((grown & others).sum()) / max(rim, 1)

        touches_edge = (
            c[:, 0, 0].min() <= 1
            or c[:, 0, 1].min() <= 1
            or c[:, 0, 0].max() >= w - 2
            or c[:, 0, 1].max() >= h - 2
        )
        occluded = (
            touches_edge
            or shared > p.max_shared_boundary
            or solidity < p.min_solidity
            or (p.metric == "diameter" and circularity < p.min_circularity)
        )

        shape_score = solidity if p.metric == "length" else min(solidity, circularity)
        if shape_score < p.min_confidence:
            continue

        col = measure_color(lab_crop, blob) if lab_crop is not None else None
        if col is not None and p.hue_range is not None:
            lo_h, hi_h = p.hue_range
            # only trust the hue of something actually coloured; a near-grey blob
            # has an unstable hue angle
            if col.chroma > 6.0 and not (lo_h <= col.hue <= hi_h):
                continue
        out.append(
            Detection(
                x_mm=mat.area_lo + cx / px_per_mm,
                y_mm=mat.area_lo + cy / px_per_mm,
                size_mm=size_mm,
                confidence=round(float(np.clip(shape_score, 0.0, 1.0)), 3),
                occluded=bool(occluded),
                color=col,
            )
        )

    _flag_merges(out, p)
    out.sort(key=lambda d: (d.y_mm, d.x_mm))
    return out


def _flag_merges(dets: list[Detection], p: SegmentParams) -> None:
    """Catch blobs the splitter failed on.

    Two fruit merged into one can stay convex and round enough to pass every
    shape gate, and then get reported as a single oversized fruit — which grades
    AA and drags the mean up. Nothing in a single blob reveals this, but the rest
    of the sheet does: real fruit on one mat are similar in size, so anything far
    above the median is a merge. Flagged, never silently measured.
    """
    clean = [d for d in dets if not d.occluded]
    if len(clean) < 5:
        return          # too few to establish what "normal" is here
    median = float(np.median([d.size_mm for d in clean]))
    for d in dets:
        if not d.occluded and d.size_mm > median * p.merge_ratio:
            d.occluded = True
            d.confidence = round(min(d.confidence, 0.4), 3)
