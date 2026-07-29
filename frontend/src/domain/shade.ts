import type { FruitMeasurement, FruitProfile, I18nText, MeasurementResult } from './types'
import { labToCss } from './skin'

/**
 * Named skin shades.
 *
 * ⚠️ THE BANDS BELOW ARE PROVISIONAL, exactly like the grade thresholds.
 * They describe how light or dark the skin is, in calibrated L*, and nothing
 * more. Nobody has yet measured a set of real longan against a buyer's idea of
 * "good colour", so a shade name here is a *description*, not a verdict — the
 * app must never imply a dark fruit is a worse fruit until there is data saying
 * so.
 *
 * What IS trustworthy today is the comparison: fruit photographed together, on
 * one sheet, under one light, calibrated against the printed strip. Two fruit
 * landing in different bands really are different shades.
 */

export interface ShadeBand {
  id: string
  label: I18nText
  /** inclusive lower bound of L* */
  minL: number
  /** L* the swatch is drawn at. Stated rather than derived from minL: the
   *  darkest band starts at 0, and a swatch drawn near 0 is black, which is not
   *  what "very dark longan" looks like. */
  swatchL: number
  /** representative a*, b* for the swatch — the hue of real skin */
  a: number
  b: number
}

const LONGAN_SHADES: ShadeBand[] = [
  { id: 'pale', label: { th: 'ซีด', en: 'Pale' }, minL: 60, swatchL: 66, a: 6, b: 20 },
  { id: 'light', label: { th: 'น้ำตาลอ่อน', en: 'Light brown' }, minL: 52, swatchL: 56, a: 8, b: 23 },
  { id: 'normal', label: { th: 'น้ำตาล', en: 'Brown' }, minL: 44, swatchL: 48, a: 9, b: 24 },
  { id: 'dark', label: { th: 'น้ำตาลเข้ม', en: 'Dark brown' }, minL: 36, swatchL: 40, a: 10, b: 22 },
  { id: 'verydark', label: { th: 'คล้ำ', en: 'Very dark' }, minL: 0, swatchL: 30, a: 9, b: 17 },
]

const MANGO_SHADES: ShadeBand[] = [
  { id: 'green', label: { th: 'เขียว', en: 'Green' }, minL: 0, swatchL: 45, a: -18, b: 30 },
  { id: 'turning', label: { th: 'เริ่มเปลี่ยนสี', en: 'Turning' }, minL: 55, swatchL: 62, a: -4, b: 45 },
  { id: 'yellow', label: { th: 'เหลือง', en: 'Yellow' }, minL: 70, swatchL: 78, a: 6, b: 62 },
]

export function shadesFor(fruit: FruitProfile): ShadeBand[] {
  // mango turns green -> yellow, so lightness alone does not describe it; the
  // bands differ in hue as much as in L*
  const bands = fruit.id === 'mango' ? MANGO_SHADES : LONGAN_SHADES
  return [...bands].sort((x, y) => y.minL - x.minL)
}

export function shadeOf(fruit: FruitProfile, L: number): ShadeBand | null {
  if (!Number.isFinite(L)) return null
  return shadesFor(fruit).find((s) => L >= s.minL) ?? null
}

export function shadeSwatch(band: ShadeBand): string {
  return labToCss(band.swatchL, band.a, band.b)
}

export interface ShadeTally {
  band: ShadeBand
  count: number
  share: number
}

/** Distribution of shades across the fruit that were actually measured. */
export function tallyShades(
  result: MeasurementResult,
  fruit: FruitProfile,
): ShadeTally[] {
  const lit = result.fruits.filter((f) => f.color && !f.occluded)
  if (!lit.length) return []
  const counts = new Map<string, number>()
  for (const f of lit) {
    const s = shadeOf(fruit, f.color!.L)
    if (s) counts.set(s.id, (counts.get(s.id) ?? 0) + 1)
  }
  return shadesFor(fruit).map((band) => {
    const count = counts.get(band.id) ?? 0
    return { band, count, share: count / lit.length }
  })
}

/** The shade the batch as a whole reads as. */
export function dominantShade(
  result: MeasurementResult,
  fruit: FruitProfile,
): ShadeTally | null {
  const tally = tallyShades(result, fruit).filter((t) => t.count > 0)
  if (!tally.length) return null
  return tally.reduce((best, t) => (t.count > best.count ? t : best))
}

export function fruitShade(
  f: FruitMeasurement,
  fruit: FruitProfile,
): ShadeBand | null {
  if (!f.color || f.occluded) return null
  return shadeOf(fruit, f.color.L)
}
