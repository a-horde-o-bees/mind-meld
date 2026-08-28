/**
 * Fractional indexing: order keys that sort lexicographically and always have
 * room for another key between any two.
 *
 * This is what makes manual reordering safe under concurrency. Moving an item
 * rewrites one string field on one item, so two people dragging different rows
 * at the same time merge cleanly. Reordering by splicing a `Y.Array` instead
 * means delete-then-insert, which is exactly the shape that duplicates or drops
 * a row when two moves interleave.
 *
 * Keys are fractions in base 62 with an implied leading "0.", using an alphabet
 * whose order matches ASCII so plain string comparison is the sort.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const BASE = DIGITS.length

export class OrderKeyError extends Error {}

/** The key used for the first item in an empty list. */
export const FIRST_KEY = midpoint('', null)

function digitAt(key: string, index: number): number {
  const char = key[index]
  return char === undefined ? 0 : DIGITS.indexOf(char)
}

/**
 * A key strictly between `a` and `b`.
 *
 * `a === ''` means "before everything", `b === null` means "after everything".
 */
function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) {
    throw new OrderKeyError(`order keys out of sequence: ${JSON.stringify(a)} >= ${JSON.stringify(b)}`)
  }

  if (b !== null) {
    // Keep any shared prefix and only work on the part that differs.
    let shared = 0
    while (shared < b.length && (a[shared] ?? '0') === b[shared]) shared += 1
    if (shared > 0) {
      return b.slice(0, shared) + midpoint(a.slice(shared), b.slice(shared))
    }
  }

  const low = a === '' ? 0 : digitAt(a, 0)
  const high = b !== null ? digitAt(b, 0) : BASE

  if (high - low > 1) {
    return DIGITS[Math.round((low + high) / 2)]!
  }
  if (b !== null && b.length > 1) {
    // The digits are adjacent but `b` has more precision to spare.
    return b.slice(0, 1)
  }
  // Adjacent digits with nowhere to go but deeper.
  return DIGITS[low]! + midpoint(a.slice(1), null)
}

function validate(key: string, label: string): void {
  if (key === '') {
    throw new OrderKeyError(`${label} order key is empty`)
  }
  for (const char of key) {
    if (!DIGITS.includes(char)) {
      throw new OrderKeyError(`${label} order key has an invalid character: ${JSON.stringify(char)}`)
    }
  }
}

/**
 * Produce a key ordered strictly between `before` and `after`.
 *
 * Pass `null` for either end: `keyBetween(null, first)` prepends,
 * `keyBetween(last, null)` appends, `keyBetween(null, null)` starts a list.
 */
export function keyBetween(before: string | null, after: string | null): string {
  if (before !== null) validate(before, 'before')
  if (after !== null) validate(after, 'after')
  if (before !== null && after !== null && before >= after) {
    throw new OrderKeyError(`cannot place a key between ${before} and ${after}`)
  }
  return midpoint(before ?? '', after)
}

/** `n` keys in order, all strictly between `before` and `after`. */
export function keysBetween(before: string | null, after: string | null, n: number): string[] {
  if (n <= 0) return []
  if (n === 1) return [keyBetween(before, after)]
  // Bisect so the keys stay short rather than chaining off one end.
  const middle = Math.floor(n / 2)
  const pivot = keyBetween(before, after)
  return [
    ...keysBetween(before, pivot, middle),
    pivot,
    ...keysBetween(pivot, after, n - middle - 1),
  ]
}

/** Sort helper for records carrying an `order` key, ties broken by id. */
export function byOrder<T extends { id: string; order: string }>(a: T, b: T): number {
  if (a.order === b.order) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  return a.order < b.order ? -1 : 1
}

/**
 * The order key for an item moved to `index` within `ordered` (excluding the
 * item itself). Returns null when the move is a no-op.
 */
export function orderForIndex(ordered: readonly string[], index: number): string {
  const before = index > 0 ? ordered[index - 1] ?? null : null
  const after = index < ordered.length ? ordered[index] ?? null : null
  return keyBetween(before, after)
}
