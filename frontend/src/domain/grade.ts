import type {
  FruitProfile,
  GradeRule,
  GradeTally,
  FruitMeasurement,
} from './types'

/** Resolve a diameter to a grade. Rules are first-match on a descending sort,
 *  so the scheme's own ordering can't silently break the result. */
export function gradeOf(fruit: FruitProfile, diameterMm: number): GradeRule | null {
  if (!Number.isFinite(diameterMm)) return null
  const rules = [...fruit.grading.rules].sort((a, b) => b.minDiameter - a.minDiameter)
  return rules.find((r) => diameterMm >= r.minDiameter) ?? null
}

export function ruleById(fruit: FruitProfile, id: string | null): GradeRule | null {
  if (!id) return null
  return fruit.grading.rules.find((r) => r.id === id) ?? null
}

/**
 * Grade only what was actually measured.
 *
 * An occluded fruit's outline is clipped by its neighbour, so its diameter
 * under-reads — grading it would systematically push fruit into lower bands and
 * cost the farmer money. Occluded fruit stay in the count and out of the tally.
 */
export function tallyGrades(
  fruit: FruitProfile,
  fruits: FruitMeasurement[],
): GradeTally[] {
  const measurable = fruits.filter((f) => !f.occluded && f.grade)
  const counts = new Map<string, number>()
  for (const f of measurable) {
    counts.set(f.grade!, (counts.get(f.grade!) ?? 0) + 1)
  }
  const total = measurable.length || 1
  return fruit.grading.rules.map((r) => {
    const count = counts.get(r.id) ?? 0
    return { gradeId: r.id, count, share: count / total }
  })
}

/** Reject detections outside the crop's plausible size window before they reach
 *  the mean — one 90 mm "longan" moves the average more than ten real fruit. */
export function isPlausible(fruit: FruitProfile, diameterMm: number): boolean {
  return diameterMm >= fruit.size.min && diameterMm <= fruit.size.max
}

/**
 * How far a fruit sits from the nearest grade boundary, in mm.
 *
 * Live counting measures to about ±0.3 mm. Grade bands are 3 mm apart, so
 * almost every fruit is decided well clear of that — but the few sitting on a
 * boundary are exactly the ones a buyer will re-measure, and a confident wrong
 * answer there costs more than an honest "not sure".
 */
export function distanceToBoundary(fruit: FruitProfile, diameterMm: number): number {
  const edges = fruit.grading.rules.map((r) => r.minDiameter)
  return Math.min(...edges.map((e) => Math.abs(diameterMm - e)))
}

/** Within one live measurement's error of a grade boundary — show it, do not
 *  guess it. Same rule as occlusion: counted, but not graded. */
export function isBorderline(
  fruit: FruitProfile,
  diameterMm: number,
  toleranceMm = 0.3,
): boolean {
  return distanceToBoundary(fruit, diameterMm) < toleranceMm
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}
