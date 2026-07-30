import { describe, expect, it } from 'vitest'
import { RETRACT_MS, Tracker, type Track } from './tracker'
import { zonesFor } from '@/domain/zones'
import { MATS } from '@/domain/mats'
import { getFruit } from '@/domain/fruits'
import type { FruitMeasurement } from '@/domain/types'

/**
 * The tally is what a farmer sells against, so these tests are mostly about the
 * ways a count goes wrong: a fruit picked back out, the detector dropping one
 * for a frame, a fruit staged and never measured, the same fruit reported
 * twice.
 *
 * `update` is only ever fed SETTLED frames — nothing in view was moving — which
 * is what makes "absent from this frame" mean "off the sheet".
 */

const mat = MATS.full
const fruit = getFruit('longan')
const zones = zonesFor(mat)

// work zone on the 500 mm sheet is x 135..365, y 135..425
const WORK = { x: 250, y: 250 }
const ENTRY_LEFT = { x: 100, y: 250 }

function det(
  x: number,
  y: number,
  d = 29.0,
  extra: Partial<FruitMeasurement> = {},
): FruitMeasurement {
  return { i: 0, x, y, d, confidence: 0.95, occluded: false, grade: null, ...extra }
}

const make = () => new Tracker({ zones, fruit })

describe('identity', () => {
  it('keeps one id for a fruit that has not moved', () => {
    const tr = make()
    tr.update([det(WORK.x, WORK.y)], 0)
    const first = tr.live[0].tid
    tr.update([det(WORK.x + 0.3, WORK.y - 0.2)], 500)
    expect(tr.live).toHaveLength(1)
    expect(tr.live[0].tid).toBe(first)
  })

  it('treats a fruit further than the match radius as a different fruit', () => {
    const tr = make()
    tr.update([det(WORK.x, WORK.y)], 0)
    tr.update([det(WORK.x, WORK.y), det(WORK.x + 40, WORK.y)], 500)
    expect(tr.live).toHaveLength(2)
  })

  it('does not merge two neighbouring fruit into one id', () => {
    const tr = make()
    // 36 mm apart is the spacing where nothing touches
    tr.update([det(WORK.x, WORK.y), det(WORK.x + 36, WORK.y)], 0)
    const ids = tr.live.map((t) => t.tid).sort()
    tr.update([det(WORK.x, WORK.y), det(WORK.x + 36, WORK.y)], 400)
    expect(tr.live.map((t) => t.tid).sort()).toEqual(ids)
  })

  it('ignores detections outside the measurement area', () => {
    const tr = make()
    tr.update([det(20, 20)], 0) // on the marker band, not the sheet area
    expect(tr.live).toHaveLength(0)
  })
})

describe('counting', () => {
  it('counts as soon as a measured fruit is absent from a settled frame', () => {
    // no wall-clock wait: a settled frame with the fruit gone IS the evidence
    const tr = make()
    tr.update([det(WORK.x, WORK.y)], 0)
    const swept = tr.update([], 400)
    expect(swept.counted).toHaveLength(1)
    expect(swept.counted[0].d).toBeCloseTo(29.0)
  })

  it('never reports the same fruit twice', () => {
    const tr = make()
    tr.update([det(WORK.x, WORK.y)], 0)
    expect(tr.update([], 400).counted).toHaveLength(1)
    expect(tr.update([], 900).counted).toHaveLength(0)
    expect(tr.update([], RETRACT_MS + 2000).counted).toHaveLength(0)
  })

  it('does not count a fruit that was only ever staged', () => {
    // placed in the left lane, then picked straight back up -- never measured,
    // so there is nothing to count
    const tr = make()
    tr.update([det(ENTRY_LEFT.x, ENTRY_LEFT.y)], 0)
    const gone = tr.update([], 400)
    expect(gone.counted).toHaveLength(0)
    expect(gone.dropped).toHaveLength(1)
  })

  it('does not count an occluded fruit', () => {
    // a clipped outline under-reads; counting it would push fruit into a lower
    // band and cost the farmer money
    const tr = make()
    tr.update([det(WORK.x, WORK.y, 24.0, { occluded: true })], 0)
    expect(tr.update([], 400).counted).toHaveLength(0)
  })

  it('counts a fruit that was occluded at first and later seen clearly', () => {
    const tr = make()
    tr.update([det(WORK.x, WORK.y, 24.0, { occluded: true })], 0)
    tr.update([det(WORK.x, WORK.y, 29.0)], 400)
    const res = tr.update([], 800)
    expect(res.counted).toHaveLength(1)
    expect(res.counted[0].d).toBeCloseTo(29.0)
  })

  it('keeps the largest reading, because a clipped outline reads small', () => {
    const tr = make()
    tr.update([det(WORK.x, WORK.y, 29.0)], 0)
    tr.update([det(WORK.x, WORK.y, 26.5)], 400) // neighbour clipped it this frame
    expect(tr.update([], 800).counted[0].d).toBeCloseTo(29.0)
  })
})

describe('retraction', () => {
  it('takes back a count when the fruit turns out to still be there', () => {
    // the single failure that would otherwise double-count: segmentation drops
    // a fruit for one frame, so it is counted, then it comes back
    const tr = make()
    tr.update([det(WORK.x, WORK.y)], 0)
    const counted = tr.update([], 400)
    expect(counted.counted).toHaveLength(1)
    const tid = counted.counted[0].tid

    const back = tr.update([det(WORK.x, WORK.y)], 800)
    expect(back.retracted.map((r) => r.tid)).toEqual([tid])
    expect(back.counted).toHaveLength(0)
    expect(tr.live.map((t) => t.tid)).toEqual([tid])

    // and when it really does leave, it counts once more -- not a third time
    const gone = tr.update([], 1200)
    expect(gone.counted.map((c) => c.tid)).toEqual([tid])
  })

  it('stops retracting once the fruit is long gone', () => {
    const tr = make()
    tr.update([det(WORK.x, WORK.y)], 0)
    tr.update([], 400)

    // a different fruit placed in the same spot much later is a new fruit,
    // not the old one coming back
    const later = tr.update([det(WORK.x, WORK.y)], 400 + RETRACT_MS + 1000)
    expect(later.retracted).toHaveLength(0)
    expect(tr.live).toHaveLength(1)
  })
})

describe('grading', () => {
  const shown = (t: Track) => (t.borderline ? '?' : t.grade)

  it('flags a fruit sitting on a grade boundary rather than guessing', () => {
    const tr = make()
    const top = Math.max(...fruit.grading.rules.map((r) => r.minDiameter))
    tr.update([det(WORK.x, WORK.y, top + 0.1)], 0)
    const res = tr.update([], 400)
    expect(res.counted[0].borderline).toBe(true)
    expect(shown(res.counted[0])).toBe('?')
  })

  it('grades a fruit that is clear of every boundary', () => {
    const tr = make()
    const top = Math.max(...fruit.grading.rules.map((r) => r.minDiameter))
    tr.update([det(WORK.x, WORK.y, top + 3)], 0)
    const res = tr.update([], 400)
    expect(res.counted[0].borderline).toBe(false)
    expect(res.counted[0].grade).toBeTruthy()
  })
})

describe('undo', () => {
  it('removes a counted fruit and frees its place', () => {
    const tr = make()
    tr.update([det(WORK.x, WORK.y)], 0)
    const tid = tr.update([], 400).counted[0].tid

    expect(tr.uncount(tid)).toBe(true)
    expect(tr.uncount(tid)).toBe(false) // already gone

    // a fruit placed back in the same spot is a fresh fruit with a fresh id,
    // and must not retract a count that no longer exists
    const again = tr.update([det(WORK.x, WORK.y)], 800)
    expect(again.retracted).toHaveLength(0)
    expect(tr.live).toHaveLength(1)
    expect(tr.live[0].tid).not.toBe(tid)
  })
})

describe('a whole handful', () => {
  it('counts a sweep of twelve fruit exactly once each', () => {
    const tr = make()
    const handful = Array.from({ length: 12 }, (_, i) =>
      det(150 + (i % 4) * 40, 160 + Math.floor(i / 4) * 40, 27 + (i % 3)),
    )

    tr.update(handful, 0)
    tr.update(handful, 500)
    tr.update(handful, 1000)
    expect(tr.live).toHaveLength(12)

    // swept right between two settled frames -- the sweep itself is never seen
    const after = tr.update([], 1400)
    expect(after.counted).toHaveLength(12)
    expect(new Set(after.counted.map((c) => c.tid)).size).toBe(12)

    // the next handful starts clean
    const next = tr.update([det(WORK.x, WORK.y)], 2000)
    expect(next.counted).toHaveLength(0)
    expect(next.retracted).toHaveLength(0)
    expect(tr.live).toHaveLength(1)
  })

  it('counts a partial sweep without touching the fruit left behind', () => {
    const tr = make()
    const left = det(160, 200)
    const right = det(340, 200)
    tr.update([left, right], 0)

    const res = tr.update([left], 500) // only the right-hand one was swept
    expect(res.counted).toHaveLength(1)
    expect(res.counted[0].x).toBeCloseTo(340)
    expect(tr.live).toHaveLength(1)
    expect(tr.live[0].x).toBeCloseTo(160)
  })
})
