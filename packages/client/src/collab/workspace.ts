import * as Y from 'yjs'
import { byOrder, keyBetween } from '../lib/fractional'
import type { ItemType, WorkspaceItem } from '../lib/types'
import { makeId } from './docs'

/**
 * The workspace index: one small document listing everything in the space.
 *
 * Item content lives in its own document, so this stays tiny and loads
 * instantly even when the space holds large tables nobody has opened.
 */

export const DEFAULT_ICONS: Record<ItemType, string> = {
  note: '📝',
  tasks: '✅',
  table: '🌳',
}

export const TYPE_LABELS: Record<ItemType, string> = {
  note: 'Note',
  tasks: 'Task list',
  table: 'Table',
}

export function itemsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('items')
}

function toItem(entry: Y.Map<unknown>): WorkspaceItem | null {
  const id = entry.get('id')
  const type = entry.get('type')
  if (typeof id !== 'string' || typeof type !== 'string') return null
  return {
    id,
    type: type as ItemType,
    title: (entry.get('title') as string) ?? 'Untitled',
    icon: (entry.get('icon') as string) ?? DEFAULT_ICONS[type as ItemType] ?? '📄',
    order: (entry.get('order') as string) ?? '',
    createdAt: (entry.get('createdAt') as number) ?? 0,
    createdBy: (entry.get('createdBy') as string) ?? '',
    updatedAt: (entry.get('updatedAt') as number) ?? 0,
  }
}

export function listItems(doc: Y.Doc): WorkspaceItem[] {
  const items: WorkspaceItem[] = []
  for (const entry of itemsMap(doc).values()) {
    const item = toItem(entry)
    // Skip half-written entries rather than rendering placeholders: a peer may
    // be mid-transaction, and the entry will arrive complete a moment later.
    if (item && item.order !== '') items.push(item)
  }
  return items.sort(byOrder)
}

export function getItem(doc: Y.Doc, id: string): WorkspaceItem | null {
  const entry = itemsMap(doc).get(id)
  return entry ? toItem(entry) : null
}

export function createItem(
  doc: Y.Doc,
  type: ItemType,
  title: string,
  authorId: string,
): WorkspaceItem {
  const items = listItems(doc)
  const last = items.at(-1)?.order ?? null
  const now = Date.now()
  const item: WorkspaceItem = {
    id: makeId(),
    type,
    title,
    icon: DEFAULT_ICONS[type],
    order: keyBetween(last, null),
    createdAt: now,
    createdBy: authorId,
    updatedAt: now,
  }

  doc.transact(() => {
    const entry = new Y.Map<unknown>()
    for (const [key, value] of Object.entries(item)) entry.set(key, value)
    itemsMap(doc).set(item.id, entry)
  })

  return item
}

export function updateItem(doc: Y.Doc, id: string, patch: Partial<WorkspaceItem>): void {
  const entry = itemsMap(doc).get(id)
  if (!entry) return
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) entry.set(key, value)
    }
    entry.set('updatedAt', Date.now())
  })
}

export function deleteItem(doc: Y.Doc, id: string): void {
  itemsMap(doc).delete(id)
}

/** Move an item to a position in the sidebar list. */
export function moveItem(doc: Y.Doc, id: string, targetIndex: number): void {
  const others = listItems(doc).filter((item) => item.id !== id)
  const index = Math.max(0, Math.min(targetIndex, others.length))
  const before = index > 0 ? others[index - 1]!.order : null
  const after = index < others.length ? others[index]!.order : null
  updateItem(doc, id, { order: keyBetween(before, after) })
}
