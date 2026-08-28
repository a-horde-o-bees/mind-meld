import { useEffect, useState } from 'react'
import type { Person } from '../lib/types'
import type { DocHandle } from './docs'

/**
 * Presence, driven by Yjs awareness: who else has this document open, and where
 * their cursor is inside the rich-text editors.
 *
 * Identity comes from the signed-in account rather than a self-declared name,
 * so the avatars on a document match the people who can actually open it.
 */

export interface PresenceState {
  user: Person & { color: string }
}

/** Stable, readable colour per user id — same person, same colour everywhere. */
export function colorFor(id: string): string {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0
  }
  return `hsl(${hash % 360} 65% 45%)`
}

export function setLocalPresence(handle: DocHandle, person: Person): void {
  handle.provider.awareness.setLocalStateField('user', {
    ...person,
    color: colorFor(person.id),
  })
}

/** Everyone else currently in this document, one entry per person. */
export function usePresence(handle: DocHandle | null, self: Person | null): (Person & { color: string })[] {
  const [people, setPeople] = useState<(Person & { color: string })[]>([])

  useEffect(() => {
    if (!handle || !self) {
      setPeople([])
      return
    }

    const { awareness } = handle.provider
    setLocalPresence(handle, self)

    const update = () => {
      const seen = new Map<string, Person & { color: string }>()
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === awareness.clientID) continue
        const user = (state as Partial<PresenceState>)?.user
        // One entry per person: the same teammate in two tabs is one avatar.
        if (user?.id) seen.set(user.id, user)
      }
      setPeople([...seen.values()])
    }

    update()
    awareness.on('change', update)
    return () => {
      awareness.off('change', update)
    }
  }, [handle, self])

  return people
}
