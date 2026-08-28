import { describe, expect, it } from 'vitest'
import { dueState, initials, relativeTime, todayIso } from './format'

describe('initials', () => {
  it('uses first and last name', () => {
    expect(initials('Ana Lee')).toBe('AL')
    expect(initials('Ana Maria Lee')).toBe('AL')
  })

  it('falls back for single words and empty names', () => {
    expect(initials('ana')).toBe('AN')
    expect(initials('   ')).toBe('?')
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-08-21T12:00:00Z')

  it('describes the recent past and future', () => {
    expect(relativeTime(now - 1000, now)).toBe('just now')
    expect(relativeTime(now - 5 * 60_000, now)).toMatch(/5 minutes ago/)
    expect(relativeTime(now + 2 * 60 * 60_000, now)).toMatch(/in 2 hours/)
  })

  it('returns nothing for a missing timestamp', () => {
    expect(relativeTime(0, now)).toBe('')
  })
})

describe('dueState', () => {
  const now = new Date('2026-08-21T09:00:00')

  it('classifies dates relative to today', () => {
    expect(dueState(null, now)).toBe('none')
    expect(dueState('2026-08-20', now)).toBe('overdue')
    expect(dueState('2026-08-21', now)).toBe('today')
    expect(dueState('2026-08-23', now)).toBe('soon')
    expect(dueState('2026-09-30', now)).toBe('later')
  })

  it('ignores unparseable values', () => {
    expect(dueState('whenever', now)).toBe('none')
  })
})

describe('todayIso', () => {
  it('formats the local date, zero padded', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
