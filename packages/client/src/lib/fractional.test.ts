import { describe, expect, it } from 'vitest'
import { byOrder, FIRST_KEY, keyBetween, keysBetween, OrderKeyError, orderForIndex } from './fractional'

describe('keyBetween', () => {
  it('produces a key between two keys', () => {
    const a = keyBetween(null, null)
    const b = keyBetween(a, null)
    const middle = keyBetween(a, b)
    expect(a < middle).toBe(true)
    expect(middle < b).toBe(true)
  })

  it('prepends and appends', () => {
    const first = keyBetween(null, null)
    expect(keyBetween(null, first) < first).toBe(true)
    expect(keyBetween(first, null) > first).toBe(true)
  })

  it('always finds room, however many times it is subdivided', () => {
    let low = keyBetween(null, null)
    let high = keyBetween(low, null)
    for (let i = 0; i < 200; i += 1) {
      const middle = keyBetween(low, high)
      expect(low < middle && middle < high).toBe(true)
      // Alternate which side we squeeze so both directions are exercised.
      if (i % 2 === 0) low = middle
      else high = middle
    }
  })

  it('stays ordered across a long run of appends', () => {
    const keys: string[] = []
    let last: string | null = null
    for (let i = 0; i < 500; i += 1) {
      last = keyBetween(last, null)
      keys.push(last)
    }
    expect([...keys].sort()).toEqual(keys)
  })

  it('stays ordered across a long run of prepends', () => {
    const keys: string[] = []
    let first: string | null = null
    for (let i = 0; i < 500; i += 1) {
      first = keyBetween(null, first)
      keys.unshift(first)
    }
    expect([...keys].sort()).toEqual(keys)
  })

  it('never generates a key ending in the zero digit', () => {
    // A trailing zero would leave no room to insert before that key.
    let low: string | null = null
    for (let i = 0; i < 100; i += 1) {
      const key: string = keyBetween(low, null)
      expect(key.endsWith('0')).toBe(false)
      low = key
    }
  })

  it('rejects keys given in the wrong order', () => {
    const a = keyBetween(null, null)
    const b = keyBetween(a, null)
    expect(() => keyBetween(b, a)).toThrow(OrderKeyError)
    expect(() => keyBetween(a, a)).toThrow(OrderKeyError)
  })

  it('rejects malformed keys', () => {
    expect(() => keyBetween('', null)).toThrow(OrderKeyError)
    expect(() => keyBetween('not a key!', null)).toThrow(OrderKeyError)
  })
})

describe('concurrent moves', () => {
  it('keeps both items when two people move different items at once', () => {
    // Starting list: a b c d, as three peers would see it.
    const a = keyBetween(null, null)
    const b = keyBetween(a, null)
    const c = keyBetween(b, null)
    const d = keyBetween(c, null)

    // Peer one drags `d` to the front; peer two drags `a` to the end. Each
    // rewrites only its own item's key, computed against the list it saw.
    const movedD = keyBetween(null, a)
    const movedA = keyBetween(d, null)

    const merged = [
      { id: 'a', order: movedA },
      { id: 'b', order: b },
      { id: 'c', order: c },
      { id: 'd', order: movedD },
    ].sort(byOrder)

    // Nothing is lost or duplicated, and both intents survive.
    expect(merged.map((item) => item.id)).toEqual(['d', 'b', 'c', 'a'])
  })

  it('tolerates two items landing on the same key', () => {
    const key = keyBetween(null, null)
    const merged = [
      { id: 'z', order: key },
      { id: 'a', order: key },
    ].sort(byOrder)
    // Ties break by id, so every peer agrees on the same order.
    expect(merged.map((item) => item.id)).toEqual(['a', 'z'])
  })
})

describe('keysBetween', () => {
  it('returns n ordered keys inside the bounds', () => {
    const low = keyBetween(null, null)
    const high = keyBetween(low, null)
    const keys = keysBetween(low, high, 5)
    expect(keys).toHaveLength(5)
    expect([...keys].sort()).toEqual(keys)
    expect(keys.every((key) => key > low && key < high)).toBe(true)
  })

  it('returns nothing for a non-positive count', () => {
    expect(keysBetween(null, null, 0)).toEqual([])
  })
})

describe('orderForIndex', () => {
  const ordered = ['1', '2', '3']

  it('places at the front, middle and end', () => {
    expect(orderForIndex(ordered, 0) < '1').toBe(true)
    const middle = orderForIndex(ordered, 1)
    expect(middle > '1' && middle < '2').toBe(true)
    expect(orderForIndex(ordered, 3) > '3').toBe(true)
  })
})

describe('FIRST_KEY', () => {
  it('leaves room on both sides', () => {
    expect(keyBetween(null, FIRST_KEY) < FIRST_KEY).toBe(true)
    expect(keyBetween(FIRST_KEY, null) > FIRST_KEY).toBe(true)
  })
})
