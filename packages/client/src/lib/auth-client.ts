import { createAuthClient } from 'better-auth/react'

/**
 * Auth client. Same-origin, so the session cookie set by the Worker is sent
 * automatically — including on the websocket upgrade, which is what authorises
 * document sync.
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
})

export const { useSession, signIn, signUp, signOut } = authClient

export async function signInWithGoogle(callbackURL = '/'): Promise<void> {
  await signIn.social({ provider: 'google', callbackURL })
}

/**
 * End every session for this account, everywhere.
 *
 * Long-lived sessions are the point of staying signed in, and this is the
 * counterweight: the Worker also re-checks open sockets, so a revoked session
 * stops syncing rather than lingering until it happens to reconnect.
 */
export async function signOutEverywhere(): Promise<void> {
  await authClient.revokeSessions()
  await signOut()
}
