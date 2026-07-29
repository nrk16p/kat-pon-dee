import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useT } from './ui'
import { ruleById } from '@/domain/grade'
import type { FruitProfile, MeasurementResult } from '@/domain/types'

/**
 * The farmer's own photo with every detection drawn on it.
 *
 * This is the trust surface of the whole app. A number on its own ("28.4 mm")
 * is something you either believe or you don't; a circle around each fruit with
 * its size on it is something you can check against what is in front of you.
 * It is also the fastest way to spot the failure that matters — fruit that were
 * missed, or two touching fruit read as one.
 *
 * Positions come back in mat millimetres, so they are projected through the
 * homography the server solved. Drawing on the original photo rather than a
 * rectified one keeps it recognisable as the picture they just took.
 */
export default function DetectionOverlay({
  image,
  result,
  fruit,
}: {
  image: Blob
  result: MeasurementResult
  fruit: FruitProfile
}) {
  const { t, tx } = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    let dead = false
    const objectUrl = URL.createObjectURL(image)
    const img = new Image()

    img.onload = () => {
      if (dead) return
      const H = result.homography
      const canvas = canvasRef.current
      if (!canvas || !H || H.length !== 9) {
        setBusy(false)
        return
      }

      // cap the working size: a 12 MP canvas is pointless on a phone screen and
      // slow enough to feel broken
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      /** mat millimetres -> canvas pixels */
      const project = (x: number, y: number): [number, number] => {
        const w = H[6] * x + H[7] * y + H[8]
        return [
          ((H[0] * x + H[1] * y + H[2]) / w) * scale,
          ((H[3] * x + H[4] * y + H[5]) / w) * scale,
        ]
      }

      const base = Math.max(canvas.width, canvas.height)
      const line = Math.max(1.6, base * 0.0022)
      const font = Math.max(11, base * 0.016)

      // dim everything outside the measurement area so the eye goes to the fruit
      const area = [
        project(75, 75),
        project(425, 75),
        project(425, 425),
        project(75, 425),
      ]
      ctx.save()
      ctx.fillStyle = 'rgba(11,15,13,0.34)'
      ctx.beginPath()
      ctx.rect(0, 0, canvas.width, canvas.height)
      ctx.moveTo(area[0][0], area[0][1])
      for (let i = area.length - 1; i >= 0; i--) ctx.lineTo(area[i][0], area[i][1])
      ctx.closePath()
      ctx.fill('evenodd')
      ctx.restore()

      for (const f of result.fruits) {
        const [cx, cy] = project(f.x, f.y)
        const [ex, ey] = project(f.x + f.d / 2, f.y)
        const r = Math.hypot(ex - cx, ey - cy)
        if (!Number.isFinite(r) || r <= 0) continue

        const rule = ruleById(fruit, f.grade)
        // occluded fruit are counted but never measured, so they must not look
        // like a confident reading
        const colour = f.occluded ? '#9CA3AF' : (rule?.color ?? '#22C55E')

        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = colour
        ctx.lineWidth = line
        ctx.setLineDash(f.occluded ? [line * 3, line * 2.5] : [])
        ctx.stroke()
        ctx.setLineDash([])

        if (f.occluded) continue

        const label = f.d.toFixed(1)
        ctx.font = `600 ${font}px "JetBrains Mono", monospace`
        const w = ctx.measureText(label).width
        const pad = font * 0.34
        const bh = font * 1.42
        const by = cy + r + font * 0.25

        ctx.fillStyle = colour
        ctx.beginPath()
        ctx.roundRect(cx - w / 2 - pad, by, w + pad * 2, bh, bh / 2)
        ctx.fill()

        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, cx, by + bh / 2)
      }

      setUrl(canvas.toDataURL('image/jpeg', 0.88))
      setBusy(false)
    }

    img.onerror = () => !dead && setBusy(false)
    img.src = objectUrl

    return () => {
      dead = true
      URL.revokeObjectURL(objectUrl)
    }
  }, [image, result, fruit])

  const occluded = result.counted - result.measured

  return (
    <div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="card overflow-hidden">
        {busy ? (
          <div className="grid aspect-[4/3] place-items-center bg-panel text-muted">
            <Loader2 size={26} className="animate-spin" />
          </div>
        ) : url ? (
          <img src={url} alt={t('result.overlayAlt')} className="block w-full" />
        ) : (
          <div className="grid aspect-[4/3] place-items-center bg-panel px-6 text-center text-[13px] text-muted">
            {t('result.overlayUnavailable')}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[12px] text-muted">
        {fruit.grading.rules.map((r) => (
          <span key={r.id} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: r.color }}
            />
            {tx(r.label)}
          </span>
        ))}
        {occluded > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-muted" />
            {t('result.occluded')} ({occluded})
          </span>
        )}
      </div>
    </div>
  )
}
