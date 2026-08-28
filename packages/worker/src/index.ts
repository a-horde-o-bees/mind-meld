import { routePartykitRequest } from 'partyserver'
import { getAuth, getSessionUser, googleConfigured } from './auth'
import { listVar, type Env } from './env'
import { USER_HEADERS } from './room'
import { isValidRoom } from './routing'

export { DocRoom } from './room'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/.well-known/assetlinks.json') {
      return assetLinks(env)
    }

    if (url.pathname.startsWith('/api/auth/')) {
      return getAuth(env).handler(request)
    }

    // Which optional sign-in methods are live, so the client only renders
    // buttons the server will honour. Public by design: it holds booleans,
    // never credentials.
    if (url.pathname === '/api/config') {
      return json({ providers: { google: googleConfigured(env) } })
    }

    if (url.pathname === '/api/me') {
      const user = await getSessionUser(env, request)
      return user ? json({ user }) : json({ user: null }, 401)
    }

    if (url.pathname.startsWith('/api/rooms/')) {
      return handleRoomRequest(request, env, url)
    }

    // Yjs sync sockets: /parties/doc-room/<room>
    const synced = await routePartykitRequest(request, env, {
      onBeforeConnect: async (req, lobby) => {
        if (!isValidRoom(lobby.name)) {
          return new Response('unknown room', { status: 404 })
        }
        const user = await getSessionUser(env, req)
        if (!user) {
          return new Response('sign in required', { status: 401 })
        }
        // Hand the resolved identity to the room. The room never trusts the
        // client for this, and never has to re-derive it on every message.
        const headers = new Headers(req.headers)
        headers.set(USER_HEADERS.id, user.id)
        headers.set(USER_HEADERS.name, user.name)
        headers.set(USER_HEADERS.email, user.email)
        if (user.image) headers.set(USER_HEADERS.image, user.image)
        return new Request(req.url, {
          method: req.method,
          headers,
          body: req.body,
        })
      },
    })
    if (synced) return synced

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>

/** `DELETE /api/rooms/<room>` discards a document's stored state. */
async function handleRoomRequest(request: Request, env: Env, url: URL): Promise<Response> {
  const name = decodeURIComponent(url.pathname.slice('/api/rooms/'.length))
  if (!isValidRoom(name) || name === 'workspace') {
    return json({ error: 'unknown room' }, 404)
  }
  if (request.method !== 'DELETE') {
    return json({ error: 'method not allowed' }, 405)
  }
  const user = await getSessionUser(env, request)
  if (!user) return json({ error: 'sign in required' }, 401)

  const stub = env.DocRoom.get(env.DocRoom.idFromName(name))
  await stub.fetch(new Request('https://room.internal/', { method: 'DELETE' }))
  return json({ ok: true })
}

/**
 * Digital Asset Links, which is how an Android TWA proves it owns this origin
 * and earns a chrome-less window. Empty configuration disables the route rather
 * than publishing a file that claims nothing.
 */
function assetLinks(env: Env): Response {
  const fingerprints = listVar(env.ANDROID_FINGERPRINTS).map((f) => f.toUpperCase())
  if (!env.ANDROID_PACKAGE || fingerprints.length === 0) {
    return json({ error: 'no android app configured' }, 404)
  }
  return json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: env.ANDROID_PACKAGE,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ])
}
