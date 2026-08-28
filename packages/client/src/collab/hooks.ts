import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type * as Y from 'yjs'
import { acquireDoc, releaseDoc, statusOf, type ConnectionStatus, type DocHandle } from './docs'

/** Open a document for as long as the component is mounted. */
export function useDoc(room: string | null): DocHandle | null {
  const [handle, setHandle] = useState<DocHandle | null>(null)

  useEffect(() => {
    if (!room) {
      setHandle(null)
      return
    }
    const opened = acquireDoc(room)
    setHandle(opened)
    return () => {
      releaseDoc(room)
    }
  }, [room])

  return handle && handle.room === room ? handle : null
}

/**
 * Derive a plain value from a Yjs type and re-render when it changes.
 *
 * `select` runs on every observed change, so it should be cheap and must return
 * a value comparable with `Object.is` or a freshly built object — React
 * re-renders on identity change, which is what we want for lists rebuilt from
 * the document.
 */
export function useYValue<T>(
  // Yjs event types make AbstractType invariant in its parameter, so a
  // Y.Map<Y.Map<unknown>> is not assignable to AbstractType<unknown>. The
  // observers here only need the subscription methods.
  target: Y.AbstractType<any> | null | undefined,
  select: () => T,
  /**
   * Values the selector reads besides the document itself — an item id, say.
   * The cached snapshot is only recomputed when the document changes or one of
   * these does, so a selector whose inputs changed without any edit (opening a
   * different item) must list them here or it will return the previous answer.
   */
  deps: readonly unknown[] = [],
  deep = true,
): T {
  const selectRef = useRef(select)
  selectRef.current = select

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!target) return () => {}
      const handler = () => onChange()
      if (deep) target.observeDeep(handler)
      else target.observe(handler)
      return () => {
        if (deep) target.unobserveDeep(handler)
        else target.unobserve(handler)
      }
    },
    [target, deep],
  )

  // Cache the snapshot so getSnapshot stays stable between real changes;
  // useSyncExternalStore loops forever if it returns a new object each call.
  const cache = useRef<{ value: T; dirty: boolean }>({ value: undefined as T, dirty: true })
  const version = useRef(0)

  const getSnapshot = useCallback(() => {
    if (cache.current.dirty) {
      cache.current = { value: selectRef.current(), dirty: false }
    }
    return cache.current.value
  }, [])

  const subscribeAndInvalidate = useCallback(
    (onChange: () => void) =>
      subscribe(() => {
        cache.current.dirty = true
        version.current += 1
        onChange()
      }),
    [subscribe],
  )

  // A changed target or dependency means the cached snapshot answers the wrong
  // question — recompute it on the next read.
  useMemo(() => {
    cache.current.dirty = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ...deps])

  return useSyncExternalStore(subscribeAndInvalidate, getSnapshot, getSnapshot)
}

/** Live connection state for a document, for the status dot in the header. */
export function useConnectionStatus(handle: DocHandle | null): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    handle ? statusOf(handle) : 'connecting',
  )

  useEffect(() => {
    if (!handle) return
    const update = () => setStatus(statusOf(handle))
    update()
    handle.provider.on('status', update)
    handle.provider.on('connection-close', update)
    handle.provider.on('connection-error', update)
    return () => {
      handle.provider.off('status', update)
      handle.provider.off('connection-close', update)
      handle.provider.off('connection-error', update)
    }
  }, [handle])

  return status
}

/** Debounce a rapidly changing value, for search boxes. */
export function useDebounced<T>(value: T, delay = 150): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
