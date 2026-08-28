/**
 * Splitting a document snapshot across Durable Object storage keys.
 *
 * A single stored value is size-capped, and a busy table can exceed it, so
 * snapshots are chunked. Kept apart from the room so the boundary arithmetic
 * can be tested without a Durable Object.
 */

/** Comfortably under the per-value limit, leaving room for key overhead. */
export const CHUNK_BYTES = 48 * 1024

export const SNAPSHOT_COUNT_KEY = 'snapshot:chunks'

export function snapshotKey(index: number): string {
  return `snapshot:${index}`
}

/** Split an update into storage-sized pieces. An empty update yields no chunks. */
export function splitSnapshot(update: Uint8Array, chunkBytes = CHUNK_BYTES): Uint8Array[] {
  if (chunkBytes <= 0) throw new Error('chunk size must be positive')
  const chunks: Uint8Array[] = []
  for (let offset = 0; offset < update.byteLength; offset += chunkBytes) {
    chunks.push(update.slice(offset, offset + chunkBytes))
  }
  return chunks
}

/** Reassemble chunks in order. */
export function joinSnapshot(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

/** Keys holding chunks left behind by a previous, longer snapshot. */
export function staleKeys(previousCount: number, currentCount: number): string[] {
  if (previousCount <= currentCount) return []
  return Array.from({ length: previousCount - currentCount }, (_, index) =>
    snapshotKey(currentCount + index),
  )
}
