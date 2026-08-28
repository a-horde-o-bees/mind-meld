import type { Connection, ConnectionContext } from 'partyserver'
import * as Y from 'yjs'
import { YServer } from 'y-partyserver'
import { getAuth, type SessionUser } from './auth'
import type { Env } from './env'
import { joinSnapshot, snapshotKey, SNAPSHOT_COUNT_KEY, splitSnapshot, staleKeys } from './snapshot'

/** Headers the Worker attaches to an upgrade once it has resolved the session. */
export const USER_HEADERS = {
  id: 'x-tp-user-id',
  name: 'x-tp-user-name',
  email: 'x-tp-user-email',
  image: 'x-tp-user-image',
} as const

/** How often a live socket's session is re-checked against the database. */
const DEFAULT_REVOCATION_INTERVAL_MS = 5 * 60 * 1000

function revocationIntervalMs(env: Env): number {
  const configured = Number.parseInt(env.MIND_MELD_SESSION_RECHECK_MS ?? '', 10)
  // Anything under a second would spend more time checking than syncing.
  return Number.isFinite(configured) && configured >= 1000 ? configured : DEFAULT_REVOCATION_INTERVAL_MS
}

interface ConnState {
  user: SessionUser
  cookie: string
}

/**
 * One Durable Object per document.
 *
 * `YServer` owns the Yjs sync and awareness protocol, websocket hibernation and
 * the debounced save trigger; this subclass supplies storage, the authorisation
 * gate, and session revocation for sockets that are already open.
 */
export class DocRoom extends YServer<Env> {
  static override callbackOptions = {
    debounceWait: 2000,
    debounceMaxWait: 15000,
  }

  /** Rebuild the document after a cold start or after hibernation evicted it. */
  override async onLoad(): Promise<Y.Doc | void> {
    const stored = await this.readSnapshot()
    if (!stored) return
    const doc = new Y.Doc()
    Y.applyUpdate(doc, stored)
    return doc
  }

  /** Called debounced by YServer whenever the document changes. */
  override async onSave(): Promise<void> {
    await this.writeSnapshot(Y.encodeStateAsUpdate(this.document))
  }

  /** `DELETE` from the Worker discards this document and disconnects everyone. */
  override async onRequest(request: Request): Promise<Response> {
    if (request.method !== 'DELETE') {
      return new Response('method not allowed', { status: 405 })
    }
    for (const connection of this.getConnections()) {
      connection.close(4404, 'document deleted')
    }
    await this.ctx.storage.deleteAll()
    return new Response(null, { status: 204 })
  }

  override async onConnect(connection: Connection<ConnState>, ctx: ConnectionContext): Promise<void> {
    const user = readUser(ctx.request)
    if (!user) {
      // The Worker gates upgrades before they reach here, so this is defence in
      // depth: a socket that arrives without an identity never joins the room.
      connection.close(4401, 'unauthorized')
      return
    }

    connection.setState({ user, cookie: ctx.request.headers.get('cookie') ?? '' })
    await this.scheduleRevocationCheck()
    await super.onConnect(connection, ctx)
  }

  /**
   * Re-validate every open socket's session.
   *
   * Checking only at upgrade time would make "sign out everywhere" cosmetic:
   * new logins would be blocked while already-connected clients kept syncing
   * for as long as they stayed connected.
   */
  override async onAlarm(): Promise<void> {
    const connections = [...this.getConnections<ConnState>()]
    if (connections.length === 0) return

    const auth = getAuth(this.env)
    await Promise.all(
      connections.map(async (connection) => {
        const state = connection.state
        if (!state) return
        try {
          const session = await auth.api.getSession({
            headers: new Headers({ cookie: state.cookie }),
          })
          if (!session?.user || session.user.id !== state.user.id) {
            connection.close(4401, 'session ended')
          }
        } catch (err) {
          console.error('[room] session re-check failed:', err)
        }
      }),
    )

    await this.scheduleRevocationCheck()
  }

  private async scheduleRevocationCheck(): Promise<void> {
    const existing = await this.ctx.storage.getAlarm()
    if (existing === null) {
      await this.ctx.storage.setAlarm(Date.now() + revocationIntervalMs(this.env))
    }
  }

  private async readSnapshot(): Promise<Uint8Array | null> {
    const count = (await this.ctx.storage.get<number>(SNAPSHOT_COUNT_KEY)) ?? 0
    if (count === 0) return null

    const keys = Array.from({ length: count }, (_, index) => snapshotKey(index))
    const stored = await this.ctx.storage.get<ArrayBuffer>(keys)
    const parts: Uint8Array[] = []
    for (const key of keys) {
      const chunk = stored.get(key)
      if (!chunk) {
        // A partially written snapshot is not safe to apply — treat the
        // document as empty rather than as silently truncated history.
        console.error(`[room ${this.name}] snapshot chunk ${key} missing; ignoring snapshot`)
        return null
      }
      parts.push(new Uint8Array(chunk))
    }
    return joinSnapshot(parts)
  }

  private async writeSnapshot(update: Uint8Array): Promise<void> {
    const parts = splitSnapshot(update)
    const chunks: Record<string, ArrayBuffer> = {}
    parts.forEach((part, index) => {
      chunks[snapshotKey(index)] = part.buffer as ArrayBuffer
    })

    const previous = (await this.ctx.storage.get<number>(SNAPSHOT_COUNT_KEY)) ?? 0
    // Write chunks before the count so a crash mid-write leaves the old, still
    // complete snapshot addressable rather than a half-updated one.
    if (parts.length > 0) await this.ctx.storage.put(chunks)
    await this.ctx.storage.put(SNAPSHOT_COUNT_KEY, parts.length)
    const stale = staleKeys(previous, parts.length)
    if (stale.length > 0) await this.ctx.storage.delete(stale)
  }
}

function readUser(request: Request): SessionUser | null {
  const id = request.headers.get(USER_HEADERS.id)
  const email = request.headers.get(USER_HEADERS.email)
  if (!id || !email) return null
  return {
    id,
    email,
    name: request.headers.get(USER_HEADERS.name) || email,
    image: request.headers.get(USER_HEADERS.image) || null,
  }
}
