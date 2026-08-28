import { describe, expect, it } from 'vitest'
import { matchesQuery, matchesText, parseQuery, tokenize } from './query'
import type { Column, Row } from './types'

const columns: Column[] = [
  { id: 'c_name', name: 'Name', type: 'text' },
  { id: 'c_owner', name: 'Owner', type: 'text' },
  { id: 'c_cost', name: 'Cost', type: 'number' },
  { id: 'c_due', name: 'Due', type: 'date' },
  { id: 'c_done', name: 'Done', type: 'bool' },
  { id: 'c_region', name: 'Region', type: 'select', options: ['North', 'South'] },
]

const rows: Row[] = [
  {
    id: 'r1',
    order: '1',
    cells: { c_name: 'Roof survey', c_owner: 'Ana', c_cost: 120, c_due: '2026-01-15', c_done: false, c_region: 'North' },
  },
  {
    id: 'r2',
    order: '2',
    cells: { c_name: 'Boiler service', c_owner: 'Ben', c_cost: 80, c_due: '2026-03-02', c_done: true, c_region: 'South' },
  },
  {
    id: 'r3',
    order: '3',
    cells: { c_name: 'Gutter clean', c_owner: 'Ana', c_cost: null, c_due: null, c_done: false, c_region: '' },
  },
]

const find = (input: string) =>
  rows.filter((row) => matchesQuery(parseQuery(input, columns), row.cells, columns)).map((row) => row.id)

describe('tokenize', () => {
  it('keeps quoted phrases together', () => {
    expect(tokenize('one "two three" four')).toEqual(['one', 'two three', 'four'])
  })

  it('ignores extra whitespace', () => {
    expect(tokenize('  a   b  ')).toEqual(['a', 'b'])
  })
})

describe('free text terms', () => {
  it('matches any cell, case-insensitively', () => {
    expect(find('roof')).toEqual(['r1'])
    expect(find('ANA')).toEqual(['r1', 'r3'])
  })

  it('ANDs multiple terms', () => {
    expect(find('ana gutter')).toEqual(['r3'])
  })

  it('matches everything when empty', () => {
    expect(find('')).toEqual(['r1', 'r2', 'r3'])
  })
})

describe('column terms', () => {
  it('restricts to one column by name or id', () => {
    expect(find('owner:ana')).toEqual(['r1', 'r3'])
    expect(find('c_owner:ben')).toEqual(['r2'])
  })

  it('is exact with =', () => {
    expect(find('owner:an')).toEqual(['r1', 'r3'])
    expect(find('owner=an')).toEqual([])
    expect(find('owner=ana')).toEqual(['r1', 'r3'])
  })

  it('supports != as a per-column exclusion', () => {
    expect(find('owner!=ana')).toEqual(['r2'])
  })

  it('treats an unknown column prefix as plain text', () => {
    // `nope:` names no column, so the whole token is searched as text.
    expect(find('nope:ana')).toEqual([])
    // Two bare words still AND together as ordinary text.
    expect(find('roof survey')).toEqual(['r1'])
  })

  it('handles quoted values after a column', () => {
    expect(find('name:"roof survey"')).toEqual(['r1'])
  })
})

describe('comparisons', () => {
  it('compares numbers', () => {
    expect(find('cost:>100')).toEqual(['r1'])
    expect(find('cost:>=80')).toEqual(['r1', 'r2'])
    expect(find('cost:<100')).toEqual(['r2'])
  })

  it('compares dates', () => {
    expect(find('due:<2026-02-01')).toEqual(['r1'])
    expect(find('due:>=2026-03-02')).toEqual(['r2'])
  })

  it('excludes rows with no comparable value', () => {
    // r3 has no cost, so it satisfies neither > nor <.
    expect(find('cost:>0')).toEqual(['r1', 'r2'])
    expect(find('cost:<1000')).toEqual(['r1', 'r2'])
  })
})

describe('booleans', () => {
  it('matches true and false spellings', () => {
    expect(find('done:true')).toEqual(['r2'])
    expect(find('done:yes')).toEqual(['r2'])
    expect(find('done:false')).toEqual(['r1', 'r3'])
  })
})

describe('negation', () => {
  it('excludes free-text matches', () => {
    expect(find('-ana')).toEqual(['r2'])
  })

  it('excludes column matches', () => {
    expect(find('-owner:ana')).toEqual(['r2'])
  })

  it('combines with other terms', () => {
    expect(find('ana -gutter')).toEqual(['r1'])
  })

  it('treats a bare dash as text', () => {
    expect(parseQuery('-', columns).terms[0]).toMatchObject({ value: '-', negated: false })
  })
})

describe('matchesText', () => {
  it('searches plain strings for the sidebar', () => {
    const query = parseQuery('spec -old')
    expect(matchesText(query, 'Product spec')).toBe(true)
    expect(matchesText(query, 'Old spec')).toBe(false)
    expect(matchesText(parseQuery(''), 'anything')).toBe(true)
  })
})
