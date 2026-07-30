import Dexie, { type Table } from 'dexie'
import type { Capture } from '@/domain/types'

/** Local history of measurements.
 *
 *  NOT an upload queue. The photo is sent during measurement, so by the time a
 *  record lands here the server already has it — an earlier version marked these
 *  "waiting to send" and showed a sync button that sent nothing.
 *
 *  The copy kept here is what makes history and the detection overlay work
 *  without re-fetching, and it is what survives if the server loses the original. */
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
