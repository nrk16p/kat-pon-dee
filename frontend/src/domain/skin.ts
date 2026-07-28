import type { FruitMeasurement, MeasurementResult } from './types'

/**
 * Skin and colour read-out.
 *
 * Deliberately RELATIVE, not absolute. Saying "this fruit is too dark to sell"
 * would need ground truth linking L* to a grading standard, and no such data
 * exists yet. What is defensible is comparing fruit photographed together, on
 * one sheet, under one light: those comparisons hold regardless of what the
 * absolute numbers mean.
 */

export type SkinFlag = 'darker' | 'lighter' | 'mottled' | null

export interface SkinSummary {
  /** median lightness of the measured fruit */
  medianL: number
  /** median surface uniformity — higher means more spotting */
  medianUniformity: number
  darker: number
  lighter: number
  mottled: number
  /** false when the printed strip could not be read; values are then raw */
  calibrated: boolean
}

const L_DEVIATION = 6 // L* units away from the batch median to call out
const MOTTLE_RATIO = 1.8 // times the batch median uniformity

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function skinFlag(
  f: FruitMeasurement,
  medianL: number,
  medianUniformity: number,
): SkinFlag {
  if (!f.color || f.occluded) return null
  if (f.color.uniformity > medianUniformity * MOTTLE_RATIO) return 'mottled'
  if (f.color.L < medianL - L_DEVIATION) return 'darker'
  if (f.color.L > medianL + L_DEVIATION) return 'lighter'
  return null
}

export function summariseSkin(result: MeasurementResult): SkinSummary | null {
  const lit = result.fruits.filter((f) => f.color && !f.occluded)
  if (lit.length < 3) return null // too few to define a batch norm

  const medianL = median(lit.map((f) => f.color!.L))
  const medianUniformity = median(lit.map((f) => f.color!.uniformity))

  let darker = 0
  let lighter = 0
  let mottled = 0
  for (const f of lit) {
    const flag = skinFlag(f, medianL, medianUniformity)
    if (flag === 'darker') darker++
    else if (flag === 'lighter') lighter++
    else if (flag === 'mottled') mottled++
  }

  return {
    medianL: +medianL.toFixed(1),
    medianUniformity: +medianUniformity.toFixed(2),
    darker,
    lighter,
    mottled,
    calibrated: result.colorCalibrated ?? false,
  }
}

/** Approximate sRGB swatch for a L*a*b* reading, for showing the actual colour. */
export function labToCss(L: number, a: number, b: number): string {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const f = (t: number) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29))
  const [X, Y, Z] = [0.9505 * f(fx), 1.0 * f(fy), 1.089 * f(fz)]
  const lin = [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.204 * Y + 1.057 * Z,
  ]
  const ch = lin.map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055
    return Math.round(Math.min(1, Math.max(0, c)) * 255)
  })
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`
}
