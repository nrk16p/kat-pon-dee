/**
 * Where the measurement service lives.
 *
 * The backend runs on a laptop behind a Cloudflare quick tunnel, and a quick
 * tunnel gets a NEW hostname every time it restarts. `VITE_API_URL` is baked in
 * at build time, so relying on it alone would mean a Vercel redeploy every time
 * the laptop reboots. The saved value wins, so a new tunnel is a paste into
 * Settings rather than a deploy.
 *
 * Order: saved value -> build-time default -> demo mode.
 */
const KEY = 'kpd-api-url'

export const BUILD_DEFAULT: string = import.meta.env.VITE_API_URL ?? ''

export function normaliseUrl(raw: string): string {
  const t = raw.trim().replace(/\/+$/, '')
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

export function getApiUrl(): string {
  try {
    return localStorage.getItem(KEY) || BUILD_DEFAULT
  } catch {
    return BUILD_DEFAULT
  }
}

export function setApiUrl(raw: string): string {
  const url = normaliseUrl(raw)
  try {
    if (url) localStorage.setItem(KEY, url)
    else localStorage.removeItem(KEY)
  } catch {
    /* private browsing — the build default still applies */
  }
  return url
}

export function isOverridden(): boolean {
  try {
    return !!localStorage.getItem(KEY)
  } catch {
    return false
  }
}

/* ----------------------------------------------------------------- token -- */

/**
 * Shared secret for the write endpoints.
 *
 * A Cloudflare tunnel puts the laptop on the public internet. Without this,
 * anyone who ends up with the URL can upload, fill the disk, and pollute the
 * training set — and the training set is the one thing in this project that
 * cannot be regenerated out of season.
 */
const TOKEN_KEY = 'kpd-api-token'
const BUILD_TOKEN: string = import.meta.env.VITE_API_TOKEN ?? ''

export function getApiToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || BUILD_TOKEN
  } catch {
    return BUILD_TOKEN
  }
}

export function setApiToken(raw: string): string {
  const t = raw.trim()
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private browsing — the build default still applies */
  }
  return t
}

/** Auth headers, or nothing when the server is running open (localhost dev). */
export function authHeaders(): Record<string, string> {
  const t = getApiToken()
  return t ? { 'X-API-Token': t } : {}
}

export interface HealthReport {
  ok: boolean
  detail: string
  mats?: Record<string, { mat: number; baseline: number }>
}

/** Check the service is reachable AND that its mats match ours. */
export async function checkHealth(url: string): Promise<HealthReport> {
  if (!url) return { ok: false, detail: 'no-url' }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12000)
    const res = await fetch(`${url}/api/health`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
    const body = await res.json()
    return { ok: true, detail: body.opencv ? `OpenCV ${body.opencv}` : 'ok', mats: body.mats }
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof DOMException && e.name === 'AbortError' ? 'timeout' : 'unreachable',
    }
  }
}
