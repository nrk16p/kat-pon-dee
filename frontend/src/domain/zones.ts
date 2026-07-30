import type { MatVariant, MatVariantId } from './types'

/**
 * Lanes on the printed sheet for hand-fed counting.
 *
 * MUST stay in sync with backend/app/zones.py. The server sends the real zones
 * with every session and those win — these local numbers exist so the overlay
 * can be drawn before the first response comes back, and so the mode can be
 * greyed out for sheets it cannot run on without a round trip.
 */

/** Room to stage or sweep a fruit: a longan is ~28 mm. */
export const LANE_MM = 60

/** Below this the work zone holds a couple of fruit and the mode is theatre. */
export const MIN_WORK_MM = 150

export type ZoneKey = 'entry_top' | 'entry_left' | 'work' | 'exit_right'

export interface Zone {
  key: ZoneKey
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Only the 500 mm sheet has room: A3 leaves 50 mm of work zone, A4 leaves none. */
export function supportsCounting(mat: MatVariant): boolean {
  return mat.area - 2 * LANE_MM >= MIN_WORK_MM
}

export function zonesFor(mat: MatVariant): Zone[] {
  const lo = (mat.mat - mat.area) / 2
  const hi = lo + mat.area
  const x0 = lo + LANE_MM
  const x1 = hi - LANE_MM
  const y0 = lo + LANE_MM
  // The exit lane runs the full height on purpose: sweeping right is one
  // motion, and stopping the lane short of the top edge would strand fruit
  // that were staged there.
  return [
    { key: 'entry_top', x0: lo, y0: lo, x1, y1: y0 },
    { key: 'entry_left', x0: lo, y0, x1: x0, y1: hi },
    { key: 'work', x0, y0, x1, y1: hi },
    { key: 'exit_right', x0: x1, y0: lo, x1: hi, y1: hi },
  ]
}

export function locate(zones: Zone[], x: number, y: number): ZoneKey | null {
  // work first: it is the hot path, every measured fruit is in it
  const order: ZoneKey[] = ['work', 'exit_right', 'entry_left', 'entry_top']
  for (const key of order) {
    const z = zones.find((zz) => zz.key === key)
    if (z && x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1) return key
  }
  return null
}

/** mat millimetres -> pixels, through the 3x3 row-major homography the server
 *  solved for this frame. */
export type Project = (x: number, y: number) => [number, number]

export function projector(H: number[], scale = 1): Project {
  return (x, y) => {
    const w = H[6] * x + H[7] * y + H[8]
    return [
      ((H[0] * x + H[1] * y + H[2]) / w) * scale,
      ((H[3] * x + H[4] * y + H[5]) / w) * scale,
    ]
  }
}

export const ZONE_LABEL: Record<ZoneKey, { th: string; en: string }> = {
  entry_top: { th: 'วางลำไยตรงนี้', en: 'place fruit here' },
  entry_left: { th: 'วางตรงนี้', en: 'place here' },
  work: { th: 'พื้นที่วัด', en: 'measuring area' },
  exit_right: { th: 'ปัดออกทางนี้', en: 'sweep out here' },
}

export const COUNTING_MATS: MatVariantId[] = ['full']
