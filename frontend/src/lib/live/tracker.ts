import type { FruitMeasurement, FruitProfile } from '@/domain/types'
import { gradeOf, isBorderline } from '@/domain/grade'
import { locate, type Zone, type ZoneKey } from '@/domain/zones'

/**
 * Which fruit is which, across handfuls.
 *
 * Fruit sit still on the sheet; the hand moves. That makes this far simpler
 * than general object tracking — no motion model, no velocity prediction, just
 * "is there a fruit near where that one was". A fruit hidden by an arm for two
 * seconds comes back at the same coordinates and keeps its id.
 *
 * Positions are in MAT MILLIMETRES, never image pixels. The phone gets nudged
 * between handfuls; a tracker keyed on pixels would hand every fruit a new id
 * after a bump and count the basket twice.
 */

/** Fruit do not move, so this is generous. It mostly absorbs the ~0.2 mm of
 *  centroid noise between frames. */
export const MATCH_MM = 10

/**
 * How long a counted fruit can still be taken back.
 *
 * Counting happens optimistically — see `expire` — so the tracker needs a way
 * to admit it was wrong. A fruit that reappears where a just-counted one was is
 * that same fruit: the detector dropped it for a frame, or a hand was resting
 * on the sheet. Reattaching to the old id and retracting the count is the only
 * thing that stops one missed detection from becoming a double count.
 */
export const RETRACT_MS = 8000

export type TrackState = 'new' | 'measured' | 'counted' | 'lost'

export interface Track {
  tid: number
  x: number
  y: number
  d: number
  grade: string | null
  borderline: boolean
  occluded: boolean
  zone: ZoneKey | null
  state: TrackState
  firstSeen: number
  lastSeen: number
  /** frames this fruit has been measured in — a fruit seen once in a blurry
   *  frame is weaker evidence than one seen in five */
  samples: number
  /** already handed to the caller, and so already sent to the server */
  reported: boolean
}

export interface TrackerUpdate {
  /** everything currently on the sheet, for drawing */
  visible: Track[]
  /** fruit that just left and were counted — send these to the server */
  counted: Track[]
  /** fruit counted earlier that turned out to still be there — undo these */
  retracted: Track[]
  /** fruit that vanished without ever being measured; never counted */
  dropped: Track[]
}

export interface TrackerOptions {
  zones: Zone[]
  fruit: FruitProfile
  matchMm?: number
  retractMs?: number
  borderlineMm?: number
}

export class Tracker {
  private tracks = new Map<number, Track>()
  private nextId = 1
  private opts: Required<TrackerOptions>

  constructor(opts: TrackerOptions) {
    this.opts = {
      matchMm: MATCH_MM,
      retractMs: RETRACT_MS,
      borderlineMm: 0.3,
      ...opts,
    }
  }

  get all(): Track[] {
    return [...this.tracks.values()]
  }

  /** Fruit currently believed to be on the sheet. */
  get live(): Track[] {
    return this.all.filter((t) => t.state === 'new' || t.state === 'measured')
  }

  /**
   * Fold one settled frame in.
   *
   * @param fruits detections in mat millimetres
   * @param now    monotonic ms
   */
  update(fruits: FruitMeasurement[], now: number): TrackerUpdate {
    const { zones, fruit, matchMm, retractMs, borderlineMm } = this.opts
    const claimed = new Set<number>()
    const retracted: Track[] = []

    for (const f of fruits) {
      const zone = locate(zones, f.x, f.y)
      // off the measurement area entirely: not a fruit we can reason about
      if (!zone) continue

      const match = this.nearest(f.x, f.y, claimed, matchMm, now, retractMs)
      const grade = f.occluded ? null : (gradeOf(fruit, f.d)?.id ?? null)
      const borderline = !f.occluded && isBorderline(fruit, f.d, borderlineMm)

      if (match) {
        claimed.add(match.tid)

        // It is still here, so counting it was wrong. Take it back before
        // anything else touches the tally.
        if (match.state === 'counted') {
          match.state = 'measured'
          if (match.reported) {
            match.reported = false
            retracted.push(match)
          }
        }

        match.x = f.x
        match.y = f.y
        match.lastSeen = now
        match.zone = zone
        match.occluded = f.occluded
        // Keep the largest reading rather than the latest. A fruit whose outline
        // is clipped in one frame reads small; the frame where it was fully
        // visible is the truthful one, and a fruit cannot grow on the sheet.
        if (!f.occluded && f.d > match.d) {
          match.d = f.d
          match.grade = grade
          match.borderline = borderline
        }
        match.samples += 1

        // Measuring only happens in the work zone. Staging lanes are for
        // hands, and a fruit half under someone's palm is not a measurement.
        if (match.state === 'new' && zone === 'work' && !f.occluded) {
          match.state = 'measured'
        }
        continue
      }

      const tid = this.nextId++
      // must count as seen this frame, or expire() retires it the instant it
      // is created
      claimed.add(tid)
      this.tracks.set(tid, {
        tid,
        x: f.x,
        y: f.y,
        d: f.d,
        grade,
        borderline,
        occluded: f.occluded,
        zone,
        state: zone === 'work' && !f.occluded ? 'measured' : 'new',
        firstSeen: now,
        lastSeen: now,
        samples: 1,
        reported: false,
      })
    }

    return this.expire(now, retractMs, claimed, retracted)
  }

  /**
   * Resolve fruit that were not in this frame.
   *
   * The key fact: `update` is only ever called with a SETTLED frame — nothing
   * in view was moving. A hand crossing the sheet does not produce a frame at
   * all. So a fruit missing from a settled frame is genuinely off the sheet,
   * not hidden under an arm, and it can be counted immediately instead of after
   * a wall-clock timeout. That is the difference between a counter that
   * responds to the sweep and one that catches up three seconds later.
   *
   * Honest limitation: the sweep itself happens entirely between two settled
   * frames, so the fruit is simply present, then absent. We never observe it
   * crossing the exit lane and there is no direction to verify. "Left the work
   * zone" is therefore inferred, not seen — picking a fruit back out by hand
   * counts it just the same. Two things make that safe rather than sloppy:
   * a fruit that reappears retracts its own count (see `update`), and undo is a
   * first-class control on screen rather than a buried setting.
   *
   * Fruit that vanish without ever being measured are never counted: they were
   * staged in a lane and picked back up, and there is nothing to count.
   */
  private expire(
    now: number,
    retractMs: number,
    seen: Set<number>,
    retracted: Track[],
  ): TrackerUpdate {
    const dropped: Track[] = []

    for (const t of this.tracks.values()) {
      if (seen.has(t.tid)) continue
      if (t.state === 'counted' || t.state === 'lost') continue

      if (t.state === 'measured') {
        t.state = 'counted'
      } else {
        t.state = 'lost'
        dropped.push(t)
      }
    }

    // Counted fruit stay in the map until they are past retracting, so a
    // reappearance can still find them. After that they are dead weight.
    for (const t of [...this.tracks.values()]) {
      if (t.state === 'lost' || (t.state === 'counted' && now - t.lastSeen > retractMs)) {
        this.tracks.delete(t.tid)
      }
    }

    const counted: Track[] = []
    for (const t of this.tracks.values()) {
      if (t.state === 'counted' && !t.reported) {
        t.reported = true
        counted.push(t)
      }
    }

    return { visible: this.live, counted, retracted, dropped }
  }

  private nearest(
    x: number,
    y: number,
    claimed: Set<number>,
    matchMm: number,
    now: number,
    retractMs: number,
  ): Track | null {
    let best: Track | null = null
    let bestD = matchMm
    for (const t of this.tracks.values()) {
      if (claimed.has(t.tid)) continue
      if (t.state === 'lost') continue
      // a recently counted fruit is still a candidate: if something is sitting
      // where it was, it never left
      if (t.state === 'counted' && now - t.lastSeen > retractMs) continue
      const dist = Math.hypot(t.x - x, t.y - y)
      if (dist < bestD) {
        bestD = dist
        best = t
      }
    }
    return best
  }

  /** Undo a count. The tracker will get it wrong — a fruit picked back out, two
   *  touching fruit read as one — and a tally with no way back is one the farmer
   *  stops believing. */
  uncount(tid: number): boolean {
    const t = this.tracks.get(tid)
    if (!t || t.state !== 'counted') return false
    this.tracks.delete(tid)
    return true
  }

  reset(): void {
    this.tracks.clear()
    this.nextId = 1
  }
}
