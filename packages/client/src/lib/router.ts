import { useCallback, useEffect, useState } from 'react'
import type { ItemType } from './types'

/**
 * Hash routing. A hash keeps deep links working from a static host with no
 * server rewrites, which matters for the installed PWA and the Play Store TWA
 * as much as for the browser.
 *
 *   #/               the space overview
 *   #/note/<id>      an item, by type
 *   #/tasks/<id>?task=<taskId>   a task list with its detail panel open
 */

export interface Route {
  type: ItemType | null
  id: string | null
  taskId: string | null
}

const TYPES: ItemType[] = ['note', 'tasks', 'table']

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '')
  const [path = '', search = ''] = raw.split('?')
  const [type, id] = path.split('/')
  const params = new URLSearchParams(search)

  if (!type || !TYPES.includes(type as ItemType) || !id) {
    return { type: null, id: null, taskId: null }
  }
  return {
    type: type as ItemType,
    id: decodeURIComponent(id),
    taskId: params.get('task'),
  }
}

export function buildHash(route: Partial<Route>): string {
  if (!route.type || !route.id) return '#/'
  const base = `#/${route.type}/${encodeURIComponent(route.id)}`
  return route.taskId ? `${base}?task=${encodeURIComponent(route.taskId)}` : base
}

export function useRoute(): [Route, (next: Partial<Route>) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash))

  useEffect(() => {
    const update = () => setRoute(parseHash(location.hash))
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  const navigate = useCallback((next: Partial<Route>) => {
    const hash = buildHash(next)
    if (location.hash === hash) return
    location.hash = hash
  }, [])

  return [route, navigate]
}
