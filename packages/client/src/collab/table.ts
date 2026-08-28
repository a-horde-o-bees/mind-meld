import * as Y from 'yjs'
import { byOrder, keyBetween, keysBetween } from '../lib/fractional'
import type { CellValue, Column, ColumnType, Row } from '../lib/types'
import { makeId } from './docs'

/**
 * Table document: ordered columns, rows keyed by id, and the view settings
 * (grouping, collapse state, search) that turn the table into a tree.
 *
 * View settings are shared rather than per-viewer on purpose — the grouping is
 * how the team has decided to organise this data, so everyone should see the
 * same tree when they open it.
 */

export function columnsArray(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>('columns')
}

export function rowsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('rows')
}

export function viewMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('view')
}

export function listColumns(doc: Y.Doc): Column[] {
  return columnsArray(doc)
    .toArray()
    .map((entry) => {
      const options = entry.get('options')
      const column: Column = {
        id: (entry.get('id') as string) ?? '',
        name: (entry.get('name') as string) ?? '',
        type: ((entry.get('type') as ColumnType) ?? 'text'),
      }
      if (options instanceof Y.Array) column.options = options.toArray() as string[]
      const width = entry.get('width')
      if (typeof width === 'number') column.width = width
      return column
    })
    .filter((column) => column.id !== '')
}

export function listRows(doc: Y.Doc): Row[] {
  const rows: Row[] = []
  for (const entry of rowsMap(doc).values()) {
    const id = entry.get('id')
    const order = entry.get('order')
    if (typeof id !== 'string' || typeof order !== 'string') continue
    const cells = entry.get('cells')
    rows.push({
      id,
      order,
      cells: cells instanceof Y.Map ? (Object.fromEntries(cells.entries()) as Record<string, CellValue>) : {},
    })
  }
  return rows.sort(byOrder)
}

/* ------------------------------------------------------------- columns --- */

export function addColumn(doc: Y.Doc, name: string, type: ColumnType = 'text'): Column {
  const id = makeId()
  doc.transact(() => {
    const entry = new Y.Map<unknown>()
    entry.set('id', id)
    entry.set('name', name)
    entry.set('type', type)
    if (type === 'select') entry.set('options', new Y.Array<string>())
    columnsArray(doc).push([entry])
  })
  return { id, name, type }
}

function columnEntry(doc: Y.Doc, id: string): Y.Map<unknown> | undefined {
  return columnsArray(doc)
    .toArray()
    .find((entry) => entry.get('id') === id)
}

export function updateColumn(doc: Y.Doc, id: string, patch: Partial<Omit<Column, 'id' | 'options'>>): void {
  const entry = columnEntry(doc, id)
  if (!entry) return
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) entry.set(key, value)
    }
    // Switching to a choice column needs somewhere to keep the choices.
    if (patch.type === 'select' && !(entry.get('options') instanceof Y.Array)) {
      const options = new Y.Array<string>()
      options.push(collectDistinct(doc, id))
      entry.set('options', options)
    }
  })
}

function collectDistinct(doc: Y.Doc, columnId: string): string[] {
  const seen = new Set<string>()
  for (const row of listRows(doc)) {
    const value = row.cells[columnId]
    if (typeof value === 'string' && value.trim() !== '') seen.add(value.trim())
  }
  return [...seen].slice(0, 50)
}

export function deleteColumn(doc: Y.Doc, id: string): void {
  doc.transact(() => {
    const index = columnsArray(doc)
      .toArray()
      .findIndex((entry) => entry.get('id') === id)
    if (index >= 0) columnsArray(doc).delete(index, 1)

    for (const entry of rowsMap(doc).values()) {
      const cells = entry.get('cells')
      if (cells instanceof Y.Map) cells.delete(id)
    }

    // Grouping by a column that no longer exists would leave a dead level.
    setGroupBy(
      doc,
      groupBy(doc).filter((columnId) => columnId !== id),
    )
  })
}

export function moveColumn(doc: Y.Doc, id: string, targetIndex: number): void {
  const array = columnsArray(doc)
  const entries = array.toArray()
  const from = entries.findIndex((entry) => entry.get('id') === id)
  if (from === -1) return
  const to = Math.max(0, Math.min(targetIndex, entries.length - 1))
  if (from === to) return

  doc.transact(() => {
    const source = entries[from]!
    const clone = new Y.Map<unknown>()
    for (const [key, value] of source.entries()) {
      clone.set(key, value instanceof Y.Array ? cloneStrings(value) : value)
    }
    array.delete(from, 1)
    array.insert(to, [clone])
  })
}

function cloneStrings(array: Y.Array<unknown>): Y.Array<string> {
  const copy = new Y.Array<string>()
  copy.push(array.toArray() as string[])
  return copy
}

export function addOption(doc: Y.Doc, columnId: string, option: string): void {
  const value = columnEntry(doc, columnId)?.get('options')
  const trimmed = option.trim()
  if (!(value instanceof Y.Array) || trimmed === '') return
  if ((value.toArray() as string[]).includes(trimmed)) return
  value.push([trimmed])
}

/* ---------------------------------------------------------------- rows --- */

export function addRow(doc: Y.Doc, cells: Record<string, CellValue> = {}, atIndex?: number): Row {
  const existing = listRows(doc)
  const index = atIndex ?? existing.length
  const before = index > 0 ? existing[index - 1]?.order ?? null : null
  const after = index < existing.length ? existing[index]?.order ?? null : null
  const id = makeId()
  const order = keyBetween(before, after)

  doc.transact(() => {
    const entry = new Y.Map<unknown>()
    entry.set('id', id)
    entry.set('order', order)
    const cellMap = new Y.Map<CellValue>()
    for (const [key, value] of Object.entries(cells)) cellMap.set(key, value)
    entry.set('cells', cellMap)
    rowsMap(doc).set(id, entry)
  })

  return { id, order, cells }
}

export function setCell(doc: Y.Doc, rowId: string, columnId: string, value: CellValue): void {
  const cells = rowsMap(doc).get(rowId)?.get('cells')
  if (cells instanceof Y.Map) cells.set(columnId, value)
}

export function deleteRow(doc: Y.Doc, rowId: string): void {
  rowsMap(doc).delete(rowId)
}

export function moveRow(doc: Y.Doc, rowId: string, targetIndex: number): void {
  const others = listRows(doc).filter((row) => row.id !== rowId)
  const index = Math.max(0, Math.min(targetIndex, others.length))
  const before = index > 0 ? others[index - 1]!.order : null
  const after = index < others.length ? others[index]!.order : null
  const entry = rowsMap(doc).get(rowId)
  if (entry) entry.set('order', keyBetween(before, after))
}

/** Replace the whole table, used by CSV import. */
export function replaceContents(doc: Y.Doc, columns: readonly Column[], rows: readonly Row[]): void {
  doc.transact(() => {
    const columnList = columnsArray(doc)
    columnList.delete(0, columnList.length)
    rowsMap(doc).clear()
    setGroupBy(doc, [])

    for (const column of columns) {
      const entry = new Y.Map<unknown>()
      entry.set('id', column.id)
      entry.set('name', column.name)
      entry.set('type', column.type)
      if (column.options) {
        const options = new Y.Array<string>()
        options.push(column.options)
        entry.set('options', options)
      }
      columnList.push([entry])
    }

    for (const row of rows) {
      const entry = new Y.Map<unknown>()
      entry.set('id', row.id)
      entry.set('order', row.order)
      const cells = new Y.Map<CellValue>()
      for (const [key, value] of Object.entries(row.cells)) cells.set(key, value)
      entry.set('cells', cells)
      rowsMap(doc).set(row.id, entry)
    }
  })
}

/** Append rows to an existing table, matching columns by name. */
export function appendRows(doc: Y.Doc, columns: readonly Column[], rows: readonly Row[]): void {
  const existingColumns = listColumns(doc)
  const byName = new Map(existingColumns.map((column) => [column.name.toLowerCase(), column]))

  doc.transact(() => {
    const mapping = new Map<string, string>()
    for (const incoming of columns) {
      const match = byName.get(incoming.name.toLowerCase())
      mapping.set(incoming.id, match ? match.id : addColumn(doc, incoming.name, incoming.type).id)
    }

    const last = listRows(doc).at(-1)?.order ?? null
    const orders = keysBetween(last, null, rows.length)
    rows.forEach((row, index) => {
      const cells: Record<string, CellValue> = {}
      for (const [incomingId, value] of Object.entries(row.cells)) {
        const target = mapping.get(incomingId)
        if (target) cells[target] = value
      }
      const entry = new Y.Map<unknown>()
      const id = makeId()
      entry.set('id', id)
      entry.set('order', orders[index]!)
      const cellMap = new Y.Map<CellValue>()
      for (const [key, value] of Object.entries(cells)) cellMap.set(key, value)
      entry.set('cells', cellMap)
      rowsMap(doc).set(id, entry)
    })
  })
}

/* ---------------------------------------------------------------- view --- */

export function groupBy(doc: Y.Doc): string[] {
  const value = viewMap(doc).get('groupBy')
  return value instanceof Y.Array ? (value.toArray() as string[]) : []
}

export function setGroupBy(doc: Y.Doc, columnIds: readonly string[]): void {
  const view = viewMap(doc)
  const array = new Y.Array<string>()
  array.push([...columnIds])
  view.set('groupBy', array)
}

export function collapsedPaths(doc: Y.Doc): string[] {
  const value = viewMap(doc).get('collapsed')
  return value instanceof Y.Array ? (value.toArray() as string[]) : []
}

export function setCollapsed(doc: Y.Doc, paths: readonly string[]): void {
  const array = new Y.Array<string>()
  array.push([...paths])
  viewMap(doc).set('collapsed', array)
}

export function toggleCollapsed(doc: Y.Doc, path: string): void {
  const current = new Set(collapsedPaths(doc))
  if (current.has(path)) current.delete(path)
  else current.add(path)
  setCollapsed(doc, [...current])
}

/** Seed a brand-new table so it is usable the moment it opens. */
export function seedTable(doc: Y.Doc): void {
  if (columnsArray(doc).length > 0 || rowsMap(doc).size > 0) return
  doc.transact(() => {
    const name = addColumn(doc, 'Name', 'text')
    const category = addColumn(doc, 'Category', 'select')
    const status = addColumn(doc, 'Status', 'select')
    addColumn(doc, 'Amount', 'number')
    for (const option of ['Planning', 'In progress', 'Done']) addOption(doc, status.id, option)
    addRow(doc, { [name.id]: '', [category.id]: '', [status.id]: 'Planning' })
    setGroupBy(doc, [category.id])
  })
}
