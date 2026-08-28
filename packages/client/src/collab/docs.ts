import { clearDocument, IndexeddbPersistence } from 'y-indexeddb'
import YProvider from 'y-partyserver/provider'
import * as Y from 'yjs'
import type { ItemType } from '../lib/types'

/**
 * Document manager.
 *
 * Every note, task list and table is its own Y.Doc in its own room, opened
 * lazily. Handles are reference counted so two views of the same document share
 * one socket, and a document that nobody is looking at is dropped.
 *
 * Each document is also mirrored into IndexedDB, so the space is readable and
 * editable offline and re-syncs on reconnect. That local copy is what makes the
 * installed app usable on a phone with no signal.
 */

/** The Durable Object class name, which is also the URL segment. */
const PARTY = 'doc-room'

export const WORKSPACE_ROOM = 'workspace'

export function roomFor(type: ItemType, id: string): string {
  return `${type}_${id}`
}

export interface DocHandle {
  room: string
  doc: Y.Doc
  provider: YProvider
  persistence: IndexeddbPersistence
  /** Resolves once the local cache has been read; remote sync may still be in flight. */
  whenLocalReady: Promise<void>
  /**
   * Resolves once the server's state has arrived. Anything that decides based
   * on a document being empty must wait for this: the local cache is empty on
   * a device that has never opened the document, so acting on `whenLocalReady`
   * would treat an existing document as new.
   */
  whenSynced: Promise<void>
}

interface Entry {
  handle: DocHandle
  refs: number
  /** Set when refs hit zero, so a quick remount reuses the live socket. */
  reaper: ReturnType<typeof setTimeout> | null
}

const entries = new Map<string, Entry>()

/** Grace period before a document with no viewers is torn down. */
const REAP_DELAY_MS = 30_000

export function acquireDoc(room: string): DocHandle {
  const existing = entries.get(room)
  if (existing) {
    if (existing.reaper) {
      clearTimeout(existing.reaper)
      existing.reaper = null
    }
    existing.refs += 1
    return existing.handle
  }

  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(`mind-meld:${room}`, doc)
  const provider = new YProvider(location.host, room, doc, {
    party: PARTY,
    // The session cookie authorises the upgrade; the Worker rejects it
    // otherwise, so there is nothing to send in the URL.
    connect: true,
  })

  const handle: DocHandle = {
    room,
    doc,
    provider,
    persistence,
    whenLocalReady: new Promise<void>((resolve) => {
      persistence.once('synced', () => resolve())
    }),
    whenSynced: new Promise<void>((resolve) => {
      if (provider.synced) {
        resolve()
        return
      }
      provider.once('synced', () => resolve())
    }),
  }

  entries.set(room, { handle, refs: 1, reaper: null })
  return handle
}

export function releaseDoc(room: string): void {
  const entry = entries.get(room)
  if (!entry) return
  entry.refs -= 1
  if (entry.refs > 0) return

  entry.reaper = setTimeout(() => {
    const current = entries.get(room)
    if (!current || current.refs > 0) return
    entries.delete(room)
    current.handle.provider.destroy()
    void current.handle.persistence.destroy()
    current.handle.doc.destroy()
  }, REAP_DELAY_MS)
}

/** Forget a document entirely, including its offline copy. Used after deletion. */
export async function forgetDoc(room: string): Promise<void> {
  const entry = entries.get(room)
  if (entry) {
    entries.delete(room)
    if (entry.reaper) clearTimeout(entry.reaper)
    entry.handle.provider.destroy()
    await entry.handle.persistence.destroy()
    entry.handle.doc.destroy()
  }
  await clearDocument(`mind-meld:${room}`)
}

export type ConnectionStatus = 'connecting' | 'connected' | 'offline'

export function statusOf(handle: DocHandle): ConnectionStatus {
  if (handle.provider.wsconnected) return 'connected'
  return handle.provider.wsconnecting ? 'connecting' : 'offline'
}

/** Short, URL-safe, collision-resistant id for items, rows, tasks and columns. */
export function makeId(): string {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 12)
}
