import type { FruitProfile, MatVariant, MeasurementResult } from '@/domain/types'
import type { Zone } from '@/domain/zones'
import { zonesFor } from '@/domain/zones'
import { applyGrades, ApiError } from '../api'
import { authHeaders, getApiUrl } from '../endpoint'
import { useProfile } from '@/domain/profile'
import i18n from '@/i18n'
import type { Track } from './tracker'

/**
 * The counting-session API.
 *
 * One session is one basket. The device runs the tracker and decides what left
 * the sheet; the server holds the durable tally and refuses the same tracker id
 * twice, so a retry over a flaky tunnel cannot inflate a number the farmer is
 * going to sell against.
 */

export interface SessionInfo {
  sessionId: string
  startedAt: string
  closedAt: string
  fruitId: string
  matId: string
  zones: Zone[]
  counted: number
  tally: Record<string, number>
  meanDiameter: number
  minDiameter: number
  maxDiameter: number
}

function locale(): string {
  return i18n.language?.startsWith('en') ? 'en' : 'th'
}

async function readError(res: Response, fallback: string): Promise<ApiError> {
  let detail = `${fallback} (${res.status})`
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') detail = body.detail
  } catch {
    /* non-JSON error body — keep the status line */
  }
  return new ApiError(detail, res.status)
}

function base(): string {
  const b = getApiUrl()
  if (!b) throw new ApiError('no-server')
  return b
}

async function postJson<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(`${base()}${path}?locale=${locale()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await readError(res, fallback)
  return (await res.json()) as T
}

export async function openSession(
  fruit: FruitProfile,
  mat: MatVariant,
  note = '',
): Promise<SessionInfo> {
  const growerId = useProfile.getState().growerId
  return postJson<SessionInfo>(
    '/api/session',
    { fruitId: fruit.id, matId: mat.id, growerId, note },
    'could not start session',
  )
}

/**
 * One settled frame.
 *
 * Returns every fruit in mat millimetres plus the homography, which is all the
 * tracker and the overlay need. Coarser than a still capture by design — the
 * server says so in `warnings` on every frame.
 */
export async function sendFrame(
  sessionId: string,
  image: Blob,
  fruit: FruitProfile,
  signal?: AbortSignal,
): Promise<MeasurementResult> {
  const fd = new FormData()
  fd.append('image', image, 'frame.jpg')
  fd.append('locale', locale())

  const res = await fetch(`${base()}/api/session/${sessionId}/frame`, {
    method: 'POST',
    headers: authHeaders(),
    body: fd,
    signal,
  })
  if (!res.ok) throw await readError(res, 'frame failed')
  return applyGrades((await res.json()) as MeasurementResult, fruit)
}

export async function commitCounts(
  sessionId: string,
  tracks: Track[],
): Promise<SessionInfo> {
  return postJson<SessionInfo>(
    `/api/session/${sessionId}/count`,
    {
      fruits: tracks.map((t) => ({
        tid: t.tid,
        d: t.d,
        // Borderline fruit are counted but deliberately not graded: within one
        // live measurement's error of a boundary, a confident answer is worse
        // than an honest "check this one".
        grade: t.borderline ? '?' : (t.grade ?? '?'),
        x: t.x,
        y: t.y,
        borderline: t.borderline,
      })),
    },
    'could not record count',
  )
}

export async function undoCounts(
  sessionId: string,
  tids: number[],
): Promise<SessionInfo> {
  return postJson<SessionInfo>(
    `/api/session/${sessionId}/uncount`,
    { tids },
    'could not undo',
  )
}

export async function closeSession(sessionId: string): Promise<SessionInfo> {
  return postJson<SessionInfo>(`/api/session/${sessionId}/close`, {}, 'could not close')
}

/** Zones the server sent, or the local mirror when running without a server.
 *  The server's copy wins so the boundary the app draws and the boundary the
 *  count is recorded against can never drift apart. */
export function zonesOf(info: SessionInfo | null, mat: MatVariant): Zone[] {
  return info?.zones?.length ? info.zones : zonesFor(mat)
}
