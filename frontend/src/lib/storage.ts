/**
 * How much room the captures are taking, and keeping them from being deleted.
 *
 * THE PROBLEM THIS SOLVES: iOS Safari evicts IndexedDB for a site after ~7 days
 * of no visits, and Android Chrome evicts under storage pressure. A farmer's
 * measurement history would silently disappear over a quiet week.
 *
 * `navigator.storage.persist()` opts out of that eviction. Browsers grant it
 * readily once a PWA is installed to the home screen, which is the other reason
 * to nudge installation.
 */

export interface StorageInfo {
  usedBytes: number
  quotaBytes: number
  /** true once the browser has agreed not to evict this data */
  persisted: boolean
  supported: boolean
}

export async function getStorageInfo(): Promise<StorageInfo> {
  if (!navigator.storage?.estimate) {
    return { usedBytes: 0, quotaBytes: 0, persisted: false, supported: false }
  }
  const est = await navigator.storage.estimate()
  let persisted = false
  try {
    persisted = (await navigator.storage.persisted?.()) ?? false
  } catch {
    /* not supported — treat as not persisted */
  }
  return {
    usedBytes: est.usage ?? 0,
    quotaBytes: est.quota ?? 0,
    persisted,
    supported: true,
  }
}

/** Ask the browser to stop evicting our data. Safe to call repeatedly. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
