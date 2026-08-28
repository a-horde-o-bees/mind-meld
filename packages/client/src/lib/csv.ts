import { keysBetween } from './fractional'
import { cellToText } from './query'
import type { CellValue, Column, ColumnType, Row } from './types'

/** RFC 4180 CSV, enough for round-tripping a table through a spreadsheet. */

export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let index = 0

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  while (index < input.length) {
    const char = input[index]!

    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }

    if (char === '"' && field === '') {
      quoted = true
      index += 1
      continue
    }
    if (char === ',') {
      endField()
      index += 1
      continue
    }
    if (char === '\r') {
      index += 1
      continue
    }
    if (char === '\n') {
      endRow()
      index += 1
      continue
    }
    field += char
    index += 1
  }

  // A trailing newline should not produce a phantom final row.
  if (field !== '' || row.length > 0) endRow()
  return rows
}

export function serializeCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(escapeField).join(',')).join('\n')
}

function escapeField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/

/** Guess a column type from its values, defaulting to text. */
export function inferColumnType(values: readonly string[]): ColumnType {
  const filled = values.map((value) => value.trim()).filter((value) => value !== '')
  if (filled.length === 0) return 'text'

  if (filled.every((value) => ['true', 'false', 'yes', 'no'].includes(value.toLowerCase()))) {
    return 'bool'
  }
  if (filled.every((value) => value !== '' && Number.isFinite(Number(value)))) {
    return 'number'
  }
  if (filled.every((value) => ISO_DATE.test(value))) {
    return 'date'
  }
  // A small set of *repeated* values reads better as a choice than as free
  // text. Needs enough rows to tell repetition from coincidence — two distinct
  // values in two rows is just two values.
  const distinct = new Set(filled.map((value) => value.toLowerCase()))
  if (filled.length >= 4 && distinct.size <= filled.length / 2 && distinct.size <= 12) {
    return 'select'
  }
  return 'text'
}

export function parseCellValue(raw: string, type: ColumnType): CellValue {
  const value = raw.trim()
  if (value === '') return null
  switch (type) {
    case 'number': {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : value
    }
    case 'bool':
      return ['true', 'yes', 'y', '1'].includes(value.toLowerCase())
    default:
      return raw
  }
}

export interface ImportedTable {
  columns: Column[]
  rows: Row[]
}

/**
 * Turn pasted CSV into columns and rows. The first line is treated as headers;
 * blank or duplicate headers get generated names so no column is unreachable.
 */
export function importCsv(input: string, makeId: () => string): ImportedTable {
  const grid = parseCsv(input).filter((row) => row.some((cell) => cell.trim() !== ''))
  if (grid.length === 0) return { columns: [], rows: [] }

  const headers = grid[0]!
  const body = grid.slice(1)
  const used = new Set<string>()

  const columns: Column[] = headers.map((header, index) => {
    let name = header.trim() || `Column ${index + 1}`
    while (used.has(name.toLowerCase())) name = `${name} ${index + 1}`
    used.add(name.toLowerCase())

    const values = body.map((row) => row[index] ?? '')
    const type = inferColumnType(values)
    const column: Column = { id: makeId(), name, type }
    if (type === 'select') {
      column.options = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    }
    return column
  })

  const orders = keysBetween(null, null, body.length)
  const rows: Row[] = body.map((line, rowIndex) => {
    const cells: Record<string, CellValue> = {}
    columns.forEach((column, columnIndex) => {
      cells[column.id] = parseCellValue(line[columnIndex] ?? '', column.type)
    })
    return { id: makeId(), order: orders[rowIndex]!, cells }
  })

  return { columns, rows }
}

export function exportCsv(columns: readonly Column[], rows: readonly Row[]): string {
  const header = columns.map((column) => column.name)
  const body = rows.map((row) => columns.map((column) => cellToText(row.cells[column.id] ?? null)))
  return serializeCsv([header, ...body])
}
