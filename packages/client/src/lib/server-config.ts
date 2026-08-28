/**
 * What optional features the deployed worker actually has configured, so the
 * UI only offers what the server will accept (`/api/config` on the worker is
 * the source). Every failure mode collapses to "not configured": a dead
 * sign-in button is worse than a missing one, and email/password never
 * depends on this call.
 */

export type ServerConfig = {
  providers: { google: boolean }
}

const NONE: ServerConfig = { providers: { google: false } }

export async function fetchServerConfig(
  fetchImpl: (url: string) => Promise<Response> = fetch,
): Promise<ServerConfig> {
  try {
    const response = await fetchImpl('/api/config')
    if (!response.ok) return NONE
    const body: unknown = await response.json()
    const providers = (body as { providers?: { google?: unknown } } | null)?.providers
    return { providers: { google: providers?.google === true } }
  } catch {
    return NONE
  }
}
