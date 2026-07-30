import { useEffect, useRef } from 'react'
import { ruleById } from '@/domain/grade'
import { projector, ZONE_LABEL, type Zone } from '@/domain/zones'
import type { FruitProfile } from '@/domain/types'
import type { Track } from '@/lib/live/tracker'
import type { Motion } from '@/lib/live/stillness'

/**
 * The lanes, drawn onto the live camera.
 *
 * Three rules this follows, in order of how much they matter:
 *
 *  1. The zones are projected through the homography, so they sit on the
 *     PRINTED SHEET rather than floating in the middle of the screen. Tilt the
 *     phone and the lanes tilt with the paper. MatGuide draws a fixed frame in
 *     screen space, which tells a farmer nothing about where the sheet is.
 *  2. Zone colours stay neutral. Grades already own green/blue/amber, and a
 *     lane tinted the same green as grade AA is a lane that reads as a result.
 *     Only the work zone is left untinted, so the eye lands where the fruit is.
 *  3. Zones react. A grid that just sits there is decoration; these change with
 *     what the farmer is doing, which is the only reason to draw them live.
 */

const INK = '#0B0F0D'
const HAZE = 'rgba(11,15,13,0.42)'
const LANE_LINE = 'rgba(255,255,255,0.55)'
const BORDERLINE = '#F59E0B'
const OCCLUDED = '#9CA3AF'

export interface ZoneOverlayProps {
  zones: Zone[]
  /** 3x3 row-major, mat mm -> pixels of the frame the server measured */
  homography: number[] | null
  tracks: Track[]
  fruit: FruitProfile
  /** natural size of the video frame the homography was solved against */
  width: number
  height: number
  motion: Motion
  /** fruit read as one blob — the farmer has to spread them, we cannot */
  mergedCount?: number
  /** true while a frame is in flight */
  busy?: boolean
  className?: string
}

export default function ZoneOverlay({
  zones,
  homography,
  tracks,
  fruit,
  width,
  height,
  motion,
  mergedCount = 0,
  busy = false,
  className,
}: ZoneOverlayProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !width || !height) return
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)

    // No homography yet means the sheet has not been located. Drawing guessed
    // lanes would be worse than drawing none: the farmer would place fruit
    // against a boundary that is not where the app thinks it is.
    if (!homography || homography.length !== 9) return

    const project = projector(homography)
    const base = Math.max(width, height)
    const line = Math.max(1.5, base * 0.0022)
    const font = Math.max(11, base * 0.017)

    const quad = (z: Zone): [number, number][] => [
      project(z.x0, z.y0),
      project(z.x1, z.y0),
      project(z.x1, z.y1),
      project(z.x0, z.y1),
    ]
    const path = (pts: [number, number][]) => {
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
      ctx.closePath()
    }
    const centre = (pts: [number, number][]): [number, number] => [
      pts.reduce((a, p) => a + p[0], 0) / pts.length,
      pts.reduce((a, p) => a + p[1], 0) / pts.length,
    ]

    /* -------------------------------------------------- staging + exit -- */

    for (const z of zones) {
      if (z.key === 'work') continue
      const pts = quad(z)

      path(pts)
      ctx.fillStyle = HAZE
      ctx.fill()

      ctx.strokeStyle = LANE_LINE
      ctx.lineWidth = line
      ctx.setLineDash(z.key === 'exit_right' ? [] : [line * 4, line * 3])
      path(pts)
      ctx.stroke()
      ctx.setLineDash([])

      const [cx, cy] = centre(pts)
      ctx.save()
      ctx.font = `600 ${font}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      if (z.key === 'exit_right') {
        // one glyph, unmistakable: this is the direction fruit leave
        ctx.font = `700 ${font * 1.5}px system-ui, sans-serif`
        ctx.fillText('▶', cx, cy - font * 1.2)
        ctx.font = `600 ${font}px system-ui, sans-serif`
      }
      const label = ZONE_LABEL[z.key].th
      // the left lane is narrow; stack it vertically rather than clipping it
      if (z.key === 'entry_left') {
        const chars = [...label]
        chars.forEach((ch, i) =>
          ctx.fillText(ch, cx, cy + (i - (chars.length - 1) / 2) * font * 1.15),
        )
      } else {
        ctx.fillText(label, cx, cy)
      }
      ctx.restore()
    }

    /* ------------------------------------------------------- work zone -- */

    const work = zones.find((z) => z.key === 'work')
    if (work) {
      const pts = quad(work)
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = line * 1.3
      path(pts)
      ctx.stroke()
    }

    /* ----------------------------------------------------------- fruit -- */

    // While a hand is over the sheet the last reading describes a scene that no
    // longer exists. Fade it rather than hide it: a jumping overlay reads as a
    // bug, a dimmed one reads as "hold still".
    ctx.globalAlpha = motion === 'moving' ? 0.35 : busy ? 0.7 : 1

    for (const t of tracks) {
      const [cx, cy] = project(t.x, t.y)
      const [ex, ey] = project(t.x + t.d / 2, t.y)
      const r = Math.hypot(ex - cx, ey - cy)
      if (!Number.isFinite(r) || r <= 0) continue

      const rule = ruleById(fruit, t.grade)
      const colour = t.occluded
        ? OCCLUDED
        : t.borderline
          ? BORDERLINE
          : (rule?.color ?? '#22C55E')

      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = colour
      ctx.lineWidth = line * 1.6
      // dashes mean "counted, not graded" — occluded and borderline both
      ctx.setLineDash(t.occluded || t.borderline ? [line * 3, line * 2.5] : [])
      ctx.stroke()
      ctx.setLineDash([])

      if (t.occluded) continue

      const label = t.borderline ? `${t.d.toFixed(1)}?` : t.d.toFixed(1)
      ctx.font = `600 ${font}px "JetBrains Mono", monospace`
      const w = ctx.measureText(label).width
      const pad = font * 0.34
      const bh = font * 1.4
      const by = cy + r + font * 0.2

      ctx.fillStyle = colour
      ctx.beginPath()
      ctx.roundRect(cx - w / 2 - pad, by, w + pad * 2, bh, bh / 2)
      ctx.fill()

      ctx.fillStyle = t.borderline ? INK : '#fff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, cx, by + bh / 2)
    }

    ctx.globalAlpha = 1

    /* -------------------------------------------------------- touching -- */

    if (mergedCount > 0 && work) {
      const [cx, cy] = centre(quad(work))
      const text = `⚠ ลำไยติดกัน ${mergedCount} จุด — เกลี่ยให้ห่างกัน`
      ctx.font = `700 ${font * 1.05}px system-ui, sans-serif`
      const w = ctx.measureText(text).width
      const pad = font * 0.6
      const bh = font * 2
      ctx.fillStyle = 'rgba(245,158,11,0.95)'
      ctx.beginPath()
      ctx.roundRect(cx - w / 2 - pad, cy - bh / 2, w + pad * 2, bh, bh / 4)
      ctx.fill()
      ctx.fillStyle = INK
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, cx, cy)
    }
  }, [zones, homography, tracks, fruit, width, height, motion, mergedCount, busy])

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  )
}
