import type { MatVariant, MatVariantId } from './types'

/**
 * MUST stay in sync with tools/gen_mat.py in the measurement project.
 * The printed sheet declares its own baseline in the header — the app must use
 * the baseline of the sheet in use, never assume 410 mm.
 */
export const MATS: Record<MatVariantId, MatVariant> = {
  full: {
    id: 'full',
    label: { th: 'แผ่นมาตรฐาน 500 มม.', en: 'Production 500 mm' },
    sheet: '500 × 500 mm',
    mat: 500,
    marker: 50,
    baseline: 410.0,
    area: 350,
  },
  a3: {
    id: 'a3',
    label: { th: 'แผ่นทดลอง A3', en: 'A3 prototype' },
    sheet: 'A3 · 297 × 420 mm',
    mat: 280,
    marker: 36,
    baseline: 210.0,
    area: 170,
  },
  a4: {
    id: 'a4',
    label: { th: 'แผ่นทดลอง A4', en: 'A4 prototype' },
    sheet: 'A4 · 210 × 297 mm',
    mat: 190,
    marker: 22,
    baseline: 140.0,
    area: 110,
  },
}

export const MAT_LIST = Object.values(MATS)

/** Roughly how many fruit of a given diameter fit the measurement area.
 *  0.45 is a realistic random-packing fraction for loose round fruit. */
export function matCapacity(mat: MatVariant, diameterMm: number): number {
  const fruitArea = Math.PI * (diameterMm / 2) ** 2
  return Math.floor((mat.area ** 2 * 0.45) / fruitArea)
}
