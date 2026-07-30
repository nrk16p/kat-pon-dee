/**
 * Is the scene holding still?
 *
 * The single cheapest trick in the counting mode. One 64x64 frame difference
 * does three jobs at once:
 *
 *   - keeps a hand out of the results. While someone is spreading fruit their
 *     arm fills a third of the frame; nothing is committed until they let go,
 *     so the segmentation never has to tell skin from longan.
 *   - keeps motion blur out of the measurement. A moving fruit measures wrong,
 *     and a wrong measurement at 30 fps is still wrong.
 *   - keeps the server idle. Frames only go up when the scene has actually
 *     changed and then settled, which is a few per basket rather than hundreds.
 *
 * Runs on the main thread at ~1 ms a frame. It does not need OpenCV, which is
 * why the PoC needs no WASM build at all.
 */

/** Side of the downsampled greyscale thumbnail compared between frames. */
const GRID = 64

/** Mean absolute difference, 0..255, below which the scene counts as still.
 *  Camera sensor noise alone runs around 1 on a phone in daylight. */
export const STILL_THRESHOLD = 2.0

/** How long it has to stay still before the frame is worth measuring. */
export const STILL_MS = 300

/** Above this the scene has genuinely changed — fruit added or swept away —
 *  rather than just drifting. Used to avoid re-measuring an unchanged sheet. */
export const CHANGED_THRESHOLD = 6.0

export type Motion = 'moving' | 'settling' | 'still'

export interface StillnessState {
  motion: Motion
  /** mean absolute difference against the previous frame */
  diff: number
  /** how long the scene has been below the still threshold, ms */
  quietMs: number
  /** true once the scene changed and then settled again — the moment worth
   *  spending a request on */
  settledAfterChange: boolean
}

export class StillnessDetector {
  private canvas: OffscreenCanvas | HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  private prev: Uint8ClampedArray | null = null
  private quietSince = 0
  private sawChange = false
  private consumed = false

  constructor() {
    this.canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(GRID, GRID)
        : Object.assign(document.createElement('canvas'), { width: GRID, height: GRID })
    // willReadFrequently: without it Safari keeps the buffer on the GPU and
    // every getImageData stalls the pipeline
    this.ctx = this.canvas.getContext('2d', {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D
  }

  /** Feed one preview frame. Cheap enough to call on every rAF tick. */
  push(source: CanvasImageSource, now: number): StillnessState {
    this.ctx.drawImage(source, 0, 0, GRID, GRID)
    const { data } = this.ctx.getImageData(0, 0, GRID, GRID)

    // luminance only; a colour difference would trip on auto-white-balance
    const grey = new Uint8ClampedArray(GRID * GRID)
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      grey[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
    }

    if (!this.prev) {
      this.prev = grey
      this.quietSince = now
      return { motion: 'settling', diff: 0, quietMs: 0, settledAfterChange: false }
    }

    let sum = 0
    for (let p = 0; p < grey.length; p++) sum += Math.abs(grey[p] - this.prev[p])
    const diff = sum / grey.length
    this.prev = grey

    if (diff > CHANGED_THRESHOLD) {
      // something real happened: fruit placed, swept, or the phone knocked
      this.sawChange = true
      this.consumed = false
    }

    if (diff > STILL_THRESHOLD) {
      this.quietSince = now
      return { motion: 'moving', diff, quietMs: 0, settledAfterChange: false }
    }

    const quietMs = now - this.quietSince
    if (quietMs < STILL_MS) {
      return { motion: 'settling', diff, quietMs, settledAfterChange: false }
    }

    // fires once per change, not once per frame — otherwise a sheet nobody is
    // touching would be re-measured several times a second
    const settled = this.sawChange && !this.consumed
    if (settled) this.consumed = true
    return { motion: 'still', diff, quietMs, settledAfterChange: settled }
  }

  /** Force the next settled frame to be treated as worth measuring — used when
   *  a session opens, so the first sheet is read without waiting for a change. */
  arm(): void {
    this.sawChange = true
    this.consumed = false
  }

  reset(): void {
    this.prev = null
    this.sawChange = false
    this.consumed = false
    this.quietSince = 0
  }
}
