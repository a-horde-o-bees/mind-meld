import { useEffect, useState } from 'react'
import { browserCachedCopyDeps, clearCachedCopy } from '../lib/cached-copy'
import { probeServer, type ServerProbe } from '../lib/server-config'

export type OriginStatus = 'pending' | ServerProbe['status']

/**
 * Whether the origin still serves Mind Meld. Probed once at boot and again
 * whenever the browser reports coming back online, so a device that booted
 * offline learns the truth when it reconnects. `pending` never blocks anything.
 */
export function useOriginStatus(): OriginStatus {
  const [status, setStatus] = useState<OriginStatus>('pending')

  useEffect(() => {
    let cancelled = false
    let latest = 0
    const probe = () => {
      // Only the newest probe may set the status. A boot probe still in flight
      // when the browser reconnects would otherwise land after the reconnect
      // probe and overwrite what it found — putting the ghost app back.
      const token = ++latest
      void probeServer().then((result) => {
        if (!cancelled && token === latest) setStatus(result.status)
      })
    }
    probe()
    window.addEventListener('online', probe)
    return () => {
      cancelled = true
      window.removeEventListener('online', probe)
    }
  }, [])

  return status
}

/**
 * Full-screen notice for a copy of the app cached on this device whose origin
 * no longer serves Mind Meld. Replaces the app rather than sitting over it: a
 * ghost that still shows a sign-in form is the failure this exists to end.
 */
export function DefunctOrigin({ origin }: { origin: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clear = async () => {
    setBusy(true)
    setError(null)
    try {
      await clearCachedCopy(browserCachedCopyDeps())
    } catch (cause) {
      setBusy(false)
      setError(cause instanceof Error ? cause.message : 'Could not clear the cached copy')
    }
  }

  return (
    <div className="boot defunct" role="alert">
      <h1 className="defunct__title">This copy of Mind Meld is no longer served</h1>
      <p>
        You are seeing a copy cached on this device. The server at <code>{origin}</code> no
        longer runs Mind Meld, so nothing here can sign in or sync.
      </p>
      <p>
        Documents stored on this device are untouched. Clearing removes only the cached app; if
        Mind Meld has moved, open its new address in your browser.
      </p>
      <button type="button" className="button button--primary" onClick={clear} disabled={busy}>
        {busy ? 'Clearing…' : 'Clear the cached copy'}
      </button>
      {error && <p className="defunct__error">{error}</p>}
    </div>
  )
}
