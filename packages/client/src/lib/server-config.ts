/**
 * Whether the origin this copy of the app was served from still runs Mind
 * Meld, and what optional features it has configured (`/api/config` on the
 * worker is the source).
 *
 * The app is a PWA served offline-first, so a copy cached on a device keeps
 * rendering after its Worker is deleted or renamed — a ghost that looks alive
 * until sign-in fails. The probe tells three situations apart:
 *
 * - `ok`: the server answered and identified itself as Mind Meld.
 * - `offline`: the request failed, our origin answered 5xx, or the answer was
 *   redirected or came from another origin — something between the device and
 *   the origin intercepted the request, so it says nothing about the origin.
 *   All keep the app working from local data; a sick origin is not a dead one.
 * - `defunct`: some server answered, and it is not Mind Meld — Cloudflare's
 *   "worker not found" page, or whatever now lives at this name.
 */

export type ServerConfig = {
  providers: { google: boolean }
}

export type ServerProbe =
  | { status: 'ok'; config: ServerConfig }
  | { status: 'offline' }
  | { status: 'defunct' }

export const APP_IDENTITY = 'mind-meld'

export async function probeServer(
  fetchImpl: (url: string) => Promise<Response> = fetch,
): Promise<ServerProbe> {
  let response: Response
  try {
    response = await fetchImpl('/api/config')
  } catch {
    return { status: 'offline' }
  }
  if (response.status >= 500) return { status: 'offline' }

  // A captive portal or intercepting proxy answers with a redirect to its own
  // page; Cloudflare's "worker not found" page does not redirect. `location`
  // is guarded so the probe also runs outside a browser.
  if (response.redirected) return { status: 'offline' }
  const here = typeof location === 'undefined' ? null : location.origin
  if (response.url && here && new URL(response.url).origin !== here) {
    return { status: 'offline' }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { status: 'defunct' }
  }
  const record = body as { app?: unknown; providers?: { google?: unknown } } | null
  if (record?.app !== APP_IDENTITY) return { status: 'defunct' }

  return { status: 'ok', config: { providers: { google: record.providers?.google === true } } }
}
