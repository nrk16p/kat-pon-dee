import liff from '@line/liff'

/**
 * LINE integration.
 *
 * The app must work in BOTH places: inside the LINE client (opened from the rich
 * menu) and in a plain browser (installed as a PWA). So nothing here is
 * load-bearing — every function degrades to "not available" and the manual
 * registration form remains the fallback.
 *
 * Why bother: typing a Thai name and a phone number on a phone keyboard while
 * standing in an orchard is the worst part of this app. Inside LINE we already
 * know who the person is, so registration becomes one tap.
 */

const LIFF_ID: string = import.meta.env.VITE_LIFF_ID ?? ''

export interface LineProfile {
  userId: string
  displayName: string
  pictureUrl?: string
}

let ready: Promise<boolean> | null = null

/** Idempotent init. Resolves false when LIFF is unavailable or misconfigured. */
export function initLiff(): Promise<boolean> {
  if (!LIFF_ID) return Promise.resolve(false)
  if (ready) return ready
  ready = liff
    .init({ liffId: LIFF_ID })
    .then(() => true)
    .catch(() => false)
  return ready
}

/** Running inside the LINE app (rich menu, chat link) rather than a browser. */
export function isInLineApp(): boolean {
  try {
    return liff.isInClient()
  } catch {
    return false
  }
}

export function isLineLoggedIn(): boolean {
  try {
    return liff.isLoggedIn()
  } catch {
    return false
  }
}

export function liffConfigured(): boolean {
  return !!LIFF_ID
}

/** Start the LINE Login redirect. Only meaningful in an external browser —
 *  inside the LINE client the user is already authenticated. */
export function lineLogin(): void {
  try {
    if (!liff.isLoggedIn()) liff.login()
  } catch {
    /* LIFF unavailable — the manual form still works */
  }
}

export function lineLogout(): void {
  try {
    if (liff.isLoggedIn()) liff.logout()
  } catch {
    /* ignore */
  }
}

export async function getLineProfile(): Promise<LineProfile | null> {
  try {
    if (!(await initLiff()) || !liff.isLoggedIn()) return null
    const p = await liff.getProfile()
    return {
      userId: p.userId,
      displayName: p.displayName,
      pictureUrl: p.pictureUrl,
    }
  } catch {
    return null
  }
}

/**
 * Send a result into a LINE chat the user picks.
 *
 * Returns false when the picker is unavailable — it needs to be enabled on the
 * LIFF app, and older LINE versions do not support it at all. Callers should
 * fall back to a plain share/download rather than assume this worked.
 */
export async function shareToLine(messages: string[]): Promise<boolean> {
  try {
    if (!(await initLiff())) return false
    if (!liff.isApiAvailable('shareTargetPicker')) return false
    const res = await liff.shareTargetPicker(
      messages.map((text) => ({ type: 'text', text })),
    )
    // res is undefined when the user closes the picker without choosing
    return !!res
  } catch {
    return false
  }
}

/** Close the LIFF window — only does anything inside the LINE client. */
export function closeLiff(): void {
  try {
    if (liff.isInClient()) liff.closeWindow()
  } catch {
    /* ignore */
  }
}
