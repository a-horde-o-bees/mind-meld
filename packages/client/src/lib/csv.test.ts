import { describe, expect, it } from 'vitest'
import { exportCsv, importCsv, inferColumnType, parseCsv, serializeCsv } from './csv'
import type { Column, Row } from './types'

let counter = 0
const makeId = () => `id${(counter += 1)}`

describe('parseCsv', () => {
  it('parses plain rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles quoted fields with commas, quotes and newlines', () => {
    expect(parseCsv('name,note\n"Smith, Ana","said ""hi""\nagain"')).toEqual([
      ['name', 'note'],
      ['Smith, Ana', 'said "hi"\nagain'],
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('does not invent a row for a trailing newline', () => {
    expect(parseCsv('a\n')).toEqual([['a']])
  })

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']])
  })

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('serializeCsv', () => {
  it('quotes only what needs quoting', () => {
    expect(serializeCsv([['plain', 'has,comma', 'has"quote', 'has\nnewline']])).toBe(
      'plain,"has,comma","has""quote","has\nnewline"',
    )
  })

  it('round-trips through the parser', () => {
    const grid = [
      ['name', 'note'],
      ['Smith, Ana', 'said "hi"\nagain'],
      ['', 'plain'],
    ]
    expect(parseCsv(serializeCsv(grid))).toEqual(grid)
  })
})

describe('inferColumnType', () => {
  it('detects numbers, booleans and dates', () => {
    expect(inferColumnType(['1', '2.5', '-3'])).toBe('number')
    expect(inferColumnType(['true', 'no', 'YES'])).toBe('bool')
    expect(inferColumnType(['2026-01-01', '2026-12-31'])).toBe('date')
  })

  it('treats a small set of repeated values as choices', () => {
    expect(inferColumnType(['North', 'South', 'North', 'South', 'North', 'South'])).toBe('select')
  })

  it('falls back to text', () => {
    expect(inferColumnType(['Roof survey', 'Boiler service', 'Gutter clean', 'Fence repair'])).toBe('text')
    expect(inferColumnType([])).toBe('text')
    expect(inferColumnType(['', '  '])).toBe('text')
  })

  it('ignores blanks when deciding', () => {
    expect(inferColumnType(['1', '', '2'])).toBe('number')
  })
})

describe('importCsv', () => {
  it('builds typed columns and ordered rows', () => {
    const { columns, rows } = importCsv('Name,Cost,Done\nRoof,120,true\nBoiler,80,false', makeId)
    expect(columns.map((column) => [column.name, column.type])).toEqual([
      ['Name', 'text'],
      ['Cost', 'number'],
      ['Done', 'bool'],
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]!.cells[columns[1]!.id]).toBe(120)
    expect(rows[0]!.cells[columns[2]!.id]).toBe(true)
    expect(rows[0]!.order < rows[1]!.order).toBe(true)
  })

  it('collects options for select columns', () => {
    const { columns } = importCsv('Region\nNorth\nSouth\nNorth\nSouth\nNorth\nSouth', makeId)
    expect(columns[0]!.type).toBe('select')
    expect(columns[0]!.options).toEqual(['North', 'South'])
  })

  it('names blank and duplicate headers so no column is unreachable', () => {
    const { columns } = importCsv('Name,,Name\na,b,c', makeId)
    const names = columns.map((column) => column.name)
    expect(new Set(names).size).toBe(3)
    expect(names[1]).toBe('Column 2')
  })

  it('skips entirely blank lines', () => {
    const { rows } = importCsv('Name\na\n\nb\n', makeId)
    expect(rows).toHaveLength(2)
  })

  it('returns nothing for empty input', () => {
    expect(importCsv('   ', makeId)).toEqual({ columns: [], rows: [] })
  })
})

describe('exportCsv', () => {
  it('writes headers and cells, and survives a round trip', () => {
    const columns: Column[] = [
      { id: 'c1', name: 'Name', type: 'text' },
      { id: 'c2', name: 'Cost', type: 'number' },
    ]
    const rows: Row[] = [
      { id: 'r1', order: '1', cells: { c1: 'Roof, north', c2: 120 } },
      { id: 'r2', order: '2', cells: { c1: 'Boiler', c2: null } },
    ]

    const csv = exportCsv(columns, rows)
    expect(csv.split('\n')[0]).toBe('Name,Cost')

    const reimported = importCsv(csv, makeId)
    expect(reimported.columns.map((column) => column.name)).toEqual(['Name', 'Cost'])
    expect(reimported.rows[0]!.cells[reimported.columns[0]!.id]).toBe('Roof, north')
    expect(reimported.rows[1]!.cells[reimported.columns[1]!.id]).toBe(null)
  })
})
