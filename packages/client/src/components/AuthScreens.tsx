import { useEffect, useState } from 'react'
import { authClient, signIn, signInWithGoogle, signUp } from '../lib/auth-client'
import { fetchServerConfig } from '../lib/server-config'

type Mode = 'sign-in' | 'sign-up' | 'forgot'

/**
 * Sign in, sign up, and password reset.
 *
 * Google and email/password sit side by side; both end in the same session
 * cookie, which is also what authorises the document sockets.
 */
export function AuthScreens() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // False until /api/config says otherwise, so a worker without Google
  // credentials never shows a button that would dead-end.
  const [googleAvailable, setGoogleAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchServerConfig().then((config) => {
      if (!cancelled) setGoogleAvailable(config.providers.google)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      if (mode === 'sign-up') {
        const { error: signUpError } = await signUp.email({ email, password, name: name || email })
        if (signUpError) throw new Error(signUpError.message ?? 'Could not create that account')
        setNotice('Check your email to confirm your address, then sign in.')
        setMode('sign-in')
      } else if (mode === 'sign-in') {
        const { error: signInError } = await signIn.email({ email, password })
        if (signInError) throw new Error(signInError.message ?? 'Those details did not work')
      } else {
        const { error: resetError } = await authClient.requestPasswordReset({
          email,
          redirectTo: '/',
        })
        if (resetError) throw new Error(resetError.message ?? 'Could not send a reset link')
        setNotice('If that address has an account, a reset link is on its way.')
        setMode('sign-in')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth">
      <div className="auth__panel">
        <h1 className="auth__brand">
          <span aria-hidden="true">⬡</span> Mind Meld
        </h1>
        <p className="auth__tagline">Shared notes, task lists and tables that update as you type.</p>

        {googleAvailable && (
          <>
            <button
              type="button"
              className="button button--google"
              disabled={busy}
              onClick={() => {
                setError(null)
                void signInWithGoogle().catch((caught: unknown) =>
                  setError(caught instanceof Error ? caught.message : 'Google sign-in failed'),
                )
              }}
            >
              <GoogleLogo /> Continue with Google
            </button>

            <div className="auth__divider">
              <span>or</span>
            </div>
          </>
        )}

        <form className="auth__form" onSubmit={submit}>
          {mode === 'sign-up' && (
            <label>
              Name
              <input
                value={name}
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Ana Lee"
              />
            </label>
          )}

          <label>
            Email
            <input
              required
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>

          {mode !== 'forgot' && (
            <label>
              Password
              <input
                required
                type="password"
                value={password}
                minLength={8}
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'sign-up' ? 'At least 8 characters' : ''}
              />
            </label>
          )}

          {error && <p className="auth__error">{error}</p>}
          {notice && <p className="auth__notice">{notice}</p>}

          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Working…' : SUBMIT_LABELS[mode]}
          </button>
        </form>

        <div className="auth__links">
          {mode !== 'sign-in' && (
            <button type="button" onClick={() => { setMode('sign-in'); setError(null) }}>
              Back to sign in
            </button>
          )}
          {mode === 'sign-in' && (
            <>
              <button type="button" onClick={() => { setMode('sign-up'); setError(null) }}>
                Create an account
              </button>
              <button type="button" onClick={() => { setMode('forgot'); setError(null) }}>
                Forgot password
              </button>
            </>
          )}
        </div>

        <p className="auth__footnote">
          Staying signed in is the default — sessions last 60 days and refresh as you use the space. You can
          end them all from the account menu.
        </p>
      </div>
    </main>
  )
}

/** Google's four-colour "G", per their sign-in branding guidelines. */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

const SUBMIT_LABELS: Record<Mode, string> = {
  'sign-in': 'Sign in',
  'sign-up': 'Create account',
  forgot: 'Send reset link',
}
