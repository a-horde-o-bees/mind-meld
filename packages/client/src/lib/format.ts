/** Small presentation helpers shared across views. */

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts.at(-1)![0]}`.toUpperCase()
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

export function relativeTime(timestamp: number, now = Date.now()): string {
  if (!timestamp) return ''
  const delta = timestamp - now
  const magnitude = Math.abs(delta)
  if (magnitude < 45_000) return 'just now'
  for (const [unit, size] of UNITS) {
    if (magnitude >= size) return RELATIVE.format(Math.round(delta / size), unit)
  }
  return 'just now'
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const DATE_FORMAT_WITH_YEAR = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** Format a yyyy-mm-dd date, dropping the year when it is the current one. */
export function formatDate(value: string | null, now = new Date()): string {
  if (!value) return ''
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.getFullYear() === now.getFullYear()
    ? DATE_FORMAT.format(parsed)
    : DATE_FORMAT_WITH_YEAR.format(parsed)
}

export type DueState = 'none' | 'overdue' | 'today' | 'soon' | 'later'

export function dueState(value: string | null, now = new Date()): DueState {
  if (!value) return 'none'
  const due = new Date(`${value}T00:00:00`)
  if (Number.isNaN(due.getTime())) return 'none'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  return days <= 3 ? 'soon' : 'later'
}

export function todayIso(now = new Date()): string {
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
