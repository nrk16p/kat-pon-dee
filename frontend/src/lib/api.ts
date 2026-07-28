import type {
  FruitProfile,
  MatVariant,
  MeasurementResult,
  FruitMeasurement,
} from '@/domain/types'
import { gradeOf, isPlausible, mean, stdev, tallyGrades } from '@/domain/grade'
import i18n from '@/i18n'
import { getApiUrl } from './endpoint'
import { useProfile } from '@/domain/profile'


export class ApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

/**
 * POST /api/measure — multipart: image + fruitId + matId + baselineMm.
 *
 * The server is expected to return raw geometry (positions, diameters,
 * occlusion, camera height). Grading happens on the client so a farmer can
 * switch to a buyer's scheme and re-grade a past capture without re-uploading.
 */
export async function measure(
  image: Blob,
  fruit: FruitProfile,
  mat: MatVariant,
  signal?: AbortSignal,
): Promise<MeasurementResult> {
  // read every call: the tunnel URL can change between captures
  const base = getApiUrl()
  if (!base) return mockMeasure(fruit, mat)

  const fd = new FormData()
  fd.append('image', image, 'capture.jpg')
  fd.append('fruitId', fruit.id)
  fd.append('matId', mat.id)
  fd.append('baselineMm', String(mat.baseline))
  // the server localises its errors and warnings to this
  fd.append('locale', i18n.language?.startsWith('en') ? 'en' : 'th')

  // Attribute the capture to a grower. Sent only because they consented — the
  // registration screen will not complete without an explicit PDPA opt-in.
  const p = useProfile.getState()
  if (p.consent) {
    fd.append('growerName', p.name)
    fd.append('growerPhone', p.phone)
    fd.append('province', p.province)
    if (p.orchard) fd.append('orchard', p.orchard)
    fd.append('consentAt', String(p.consentAt ?? ''))
  }

  const res = await fetch(`${base}/api/measure`, { method: 'POST', body: fd, signal })
  if (!res.ok) {
    // the common failure is "markers not in frame" — surfacing the server's own
    // sentence tells the farmer what to change; a bare 422 tells them nothing
    let detail = `measure failed (${res.status})`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      /* non-JSON error body — keep the status line */
    }
    throw new ApiError(detail, res.status)
  }
  const raw = (await res.json()) as MeasurementResult
  return applyGrades(raw, fruit)
}

/** Re-derive grades from raw diameters — lets a scheme change re-grade history. */
export function applyGrades(
  result: MeasurementResult,
  fruit: FruitProfile,
): MeasurementResult {
  const fruits = result.fruits.map((f) => ({
    ...f,
    grade: f.occluded ? null : (gradeOf(fruit, f.d)?.id ?? null),
  }))
  return { ...result, fruits, tally: tallyGrades(fruit, fruits) }
}

/* ------------------------------------------------------------------ mock -- */

/** Deterministic stand-in so the whole flow is testable before the CV service
 *  exists. Replaced the moment VITE_API_URL is set. */
function mockMeasure(fruit: FruitProfile, mat: MatVariant): Promise<MeasurementResult> {
  const t0 = performance.now()
  let seed = 20260728

  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }
  const gauss = () => {
    const u = Math.max(rnd(), 1e-9)
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd())
  }

  const typical = fruit.size.typical
  const capacity = Math.floor(
    (mat.area ** 2 * 0.45) / (Math.PI * (typical / 2) ** 2),
  )
  const n = Math.max(6, Math.round(capacity * 0.92))

  const fruits: FruitMeasurement[] = []
  for (let i = 0; i < n; i++) {
    const d = +(typical + gauss() * typical * 0.045).toFixed(1)
    if (!isPlausible(fruit, d)) continue
    const occluded = rnd() < 0.24
    fruits.push({
      i,
      x: +(mat.mat / 2 + (rnd() - 0.5) * mat.area * 0.82).toFixed(1),
      y: +(mat.mat / 2 + (rnd() - 0.5) * mat.area * 0.82).toFixed(1),
      d,
      confidence: +(0.82 + rnd() * 0.17).toFixed(2),
      occluded,
      grade: null,
    })
  }

  const measurable = fruits.filter((f) => !f.occluded).map((f) => f.d)
  const result: MeasurementResult = {
    fruitId: fruit.id,
    matId: mat.id,
    counted: fruits.length,
    measured: measurable.length,
    meanDiameter: +mean(measurable).toFixed(2),
    minDiameter: measurable.length ? Math.min(...measurable) : 0,
    maxDiameter: measurable.length ? Math.max(...measurable) : 0,
    stdDiameter: +stdev(measurable).toFixed(2),
    scale: +(mat.baseline / 1550).toFixed(5),
    cameraHeight: 520,
    heightCorrected: true,
    markersFound: 4,
    processingMs: Math.round(performance.now() - t0) + 900,
    fruits,
    tally: [],
  }

  return new Promise((resolve) =>
    setTimeout(() => resolve(applyGrades(result, fruit)), 900),
  )
}

export function isMock(): boolean {
  return !getApiUrl()
}
