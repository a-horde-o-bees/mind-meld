import { describe, expect, it } from 'vitest'
import { buildHash, parseHash } from './router'

describe('parseHash', () => {
  it('reads an item route', () => {
    expect(parseHash('#/note/abc123')).toEqual({ type: 'note', id: 'abc123', taskId: null })
  })

  it('reads an open task', () => {
    expect(parseHash('#/tasks/list1?task=t9')).toEqual({ type: 'tasks', id: 'list1', taskId: 't9' })
  })

  it('treats the root and unknown types as no route', () => {
    const empty = { type: null, id: null, taskId: null }
    expect(parseHash('')).toEqual(empty)
    expect(parseHash('#/')).toEqual(empty)
    expect(parseHash('#/wat/abc')).toEqual(empty)
    expect(parseHash('#/note')).toEqual(empty)
  })

  it('decodes escaped ids', () => {
    expect(parseHash('#/table/a%2Fb').id).toBe('a/b')
  })
})

describe('buildHash', () => {
  it('round-trips through parseHash', () => {
    const route = { type: 'tasks', id: 'list 1', taskId: 't9' } as const
    expect(parseHash(buildHash(route))).toEqual(route)
  })

  it('falls back to the root when incomplete', () => {
    expect(buildHash({})).toBe('#/')
    expect(buildHash({ type: 'note' })).toBe('#/')
  })
})
