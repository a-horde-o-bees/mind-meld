import type { CellValue, Column } from './types'

/**
 * The search language used by the table view and the sidebar.
 *
 *   overdue                  free text, matches any cell
 *   "needs review"           quoted phrase
 *   owner:ana                restrict to a column
 *   cost:>100  due:<=2026-01-01   comparisons on numbers and dates
 *   done:true                booleans
 *   -draft                   negation
 *
 * Terms combine with AND. A `column:` prefix that names no column is treated as
 * ordinary text rather than an error, so a half-typed query still does
 * something useful instead of showing nothing.
 */

export type Operator = ':' | '=' | '!=' | '>' | '>=' | '<' | '<='

export interface Term {
  /** Column id, or null for a term that may match any cell. */
  columnId: string | null
  operator: Operator
  value: string
  negated: boolean
}

export interface Query {
  terms: Term[]
  /** True when the query asks for nothing, so everything matches. */
  isEmpty: boolean
}

export const EMPTY_QUERY: Query = { terms: [], isEmpty: true }

// A token runs until whitespace, except inside quotes — so `owner:"ana lee"`
// stays one token rather than splitting at the space.
const TOKEN_PATTERN = /(?:"[^"]*"|[^\s"])+/g

/** Split on whitespace, keeping quoted phrases together and dropping the quotes. */
export function tokenize(input: string): string[] {
  return [...input.matchAll(TOKEN_PATTERN)]
    .map((match) => match[0].replace(/"/g, ''))
    .filter((token) => token !== '')
}

function findColumn(columns: readonly Column[], name: string): Column | undefined {
  const wanted = name.trim().toLowerCase()
  return columns.find(
    (column) => column.id.toLowerCase() === wanted || column.name.toLowerCase() === wanted,
  )
}

function splitOperator(rest: string): { operator: Operator; value: string } {
  for (const operator of ['>=', '<=', '!=', '>', '<', '='] as const) {
    if (rest.startsWith(operator)) {
      return { operator, value: rest.slice(operator.length) }
    }
  }
  return { operator: ':', value: rest }
}

export function parseQuery(input: string, columns: readonly Column[] = []): Query {
  const terms: Term[] = []

  for (const rawToken of tokenize(input)) {
    let token = rawToken
    let negated = false
    if (token.startsWith('-') && token.length > 1) {
      negated = true
      token = token.slice(1)
    }

    const match = COLUMN_TERM.exec(token)
    if (match) {
      const column = findColumn(columns, match[1]!)
      if (column) {
        // `cost:>100` carries its operator after the colon; `cost>100` carries
        // it in place of one.
        const { operator, value } =
          match[2] === ':'
            ? splitOperator(match[3]!)
            : { operator: match[2] as Operator, value: match[3]! }
        terms.push({ columnId: column.id, operator, value: value.trim(), negated })
        continue
      }
    }

    terms.push({ columnId: null, operator: ':', value: token, negated })
  }

  return { terms, isEmpty: terms.length === 0 }
}

const COLUMN_TERM = /^([^:<>=!]+)(>=|<=|!=|:|=|>|<)(.*)$/

export function cellToText(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

function asNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asDate(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function asBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase()
  if (['true', 'yes', 'y', '1', 'done'].includes(normalized)) return true
  if (['false', 'no', 'n', '0'].includes(normalized)) return false
  return null
}

/** Compare a cell against one term, ignoring negation. */
function matchesValue(cell: CellValue, term: Term, column: Column | undefined): boolean {
  const text = cellToText(cell)

  if (column?.type === 'bool' || typeof cell === 'boolean') {
    const wanted = asBoolean(term.value)
    const actual = typeof cell === 'boolean' ? cell : asBoolean(text)
    if (wanted === null) return false
    if (term.operator === '!=') return actual !== wanted
    return actual === wanted
  }

  // Ordering operators need a comparable pair; fall back to text when the
  // values are not numbers or dates so the query still behaves sensibly.
  if (term.operator !== ':' && term.operator !== '=' && term.operator !== '!=') {
    const pair = comparablePair(cell, term.value, column)
    if (pair === null) return false
    const [actual, wanted] = pair
    switch (term.operator) {
      case '>':
        return actual > wanted
      case '>=':
        return actual >= wanted
      case '<':
        return actual < wanted
      case '<=':
        return actual <= wanted
    }
  }

  const haystack = text.toLowerCase()
  const needle = term.value.toLowerCase()
  if (term.operator === '=') return haystack === needle
  if (term.operator === '!=') return haystack !== needle
  return needle === '' || haystack.includes(needle)
}

function comparablePair(cell: CellValue, value: string, column: Column | undefined): [number, number] | null {
  if (column?.type === 'date' || (typeof cell === 'string' && asDate(cell) !== null && asNumber(cell) === null)) {
    const actual = asDate(cellToText(cell))
    const wanted = asDate(value)
    return actual !== null && wanted !== null ? [actual, wanted] : null
  }
  const actual = typeof cell === 'number' ? cell : asNumber(cellToText(cell))
  const wanted = asNumber(value)
  return actual !== null && wanted !== null ? [actual, wanted] : null
}

/** Does a record of cells satisfy every term? */
export function matchesQuery(
  query: Query,
  cells: Record<string, CellValue>,
  columns: readonly Column[],
): boolean {
  if (query.isEmpty) return true

  return query.terms.every((term) => {
    let matched: boolean
    if (term.columnId) {
      const column = columns.find((candidate) => candidate.id === term.columnId)
      matched = matchesValue(cells[term.columnId] ?? null, term, column)
    } else {
      matched = columns.some((column) => matchesValue(cells[column.id] ?? null, term, column))
    }
    return term.negated ? !matched : matched
  })
}

/** Convenience wrapper for searching plain text records like the sidebar list. */
export function matchesText(query: Query, text: string): boolean {
  if (query.isEmpty) return true
  const haystack = text.toLowerCase()
  return query.terms.every((term) => {
    const matched = haystack.includes(term.value.toLowerCase())
    return term.negated ? !matched : matched
  })
}
