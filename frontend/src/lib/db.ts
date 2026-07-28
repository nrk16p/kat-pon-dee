import Dexie, { type Table } from 'dexie'
import type { Capture } from '@/domain/types'

/** Captures live in IndexedDB first and sync when there is signal. In an orchard
 *  that is the normal case, not the edge case, so nothing is lost on a failed
 *  upload — the blob stays until the server confirms. */
class AppDb extends Dexie {
  captures!: Table<Capture, number>

  constructor() {
    super('ai-kat-pon-dee')
    this.version(1).stores({
      captures: '++id, uuid, createdAt, fruitId, status',
    })
  }
}

export const db = new AppDb()

export async function addCapture(c: Omit<Capture, 'id'>): Promise<number> {
  return db.captures.add(c as Capture)
}

export async function setStatus(
  id: number,
  status: Capture['status'],
  patch: Partial<Capture> = {},
): Promise<void> {
  await db.captures.update(id, { status, ...patch })
}

export function recentCaptures(limit = 100) {
  return db.captures.orderBy('createdAt').reverse().limit(limit).toArray()
}

export function pendingCaptures() {
  return db.captures.where('status').anyOf('queued', 'failed').toArray()
}

export async function deleteCapture(id: number): Promise<void> {
  await db.captures.delete(id)
}

/** Free space by dropping the full-size blob of synced captures while keeping
 *  the numbers and the thumbnail. */
export async function pruneSynced(keepBytes = 200 * 1024 * 1024): Promise<number> {
  const done = await db.captures.where('status').equals('done').toArray()
  const sorted = done.sort((a, b) => b.createdAt - a.createdAt)
  let used = 0
  let pruned = 0
  for (const c of sorted) {
    used += c.blob?.size ?? 0
    if (used > keepBytes && c.id && c.blob?.size) {
      await db.captures.update(c.id, { blob: new Blob([]) })
      pruned++
    }
  }
  return pruned
}
