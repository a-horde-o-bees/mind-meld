import { describe, expect, it } from 'vitest'
import { probeServer } from './server-config'

const json = (body: unknown, status = 200) => () =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

const text = (body: string, status: number) => () =>
  Promise.resolve(new Response(body, { status, headers: { 'content-type': 'text/plain' } }))

describe('probeServer', () => {
  it('is ok when the server identifies itself, and reads the providers', async () => {
    expect(await probeServer(json({ app: 'mind-meld', providers: { google: true } }))).toEqual({
      status: 'ok',
      config: { providers: { google: true } },
    })
    expect(await probeServer(json({ app: 'mind-meld', providers: { google: false } }))).toEqual({
      status: 'ok',
      config: { providers: { google: false } },
    })
  })

  it('treats a provider flag that is not exactly true as off', async () => {
    const probe = await probeServer(json({ app: 'mind-meld', providers: { google: 'yes' } }))
    expect(probe).toEqual({ status: 'ok', config: { providers: { google: false } } })
    expect(await probeServer(json({ app: 'mind-meld' }))).toEqual({
      status: 'ok',
      config: { providers: { google: false } },
    })
  })

  it('is defunct when a server answers without the identity', async () => {
    // Cloudflare's page for a Worker that no longer exists.
    expect(await probeServer(text('error code: 1042', 404))).toEqual({ status: 'defunct' })
    // Some other app, or a stale Worker, answering JSON without the field.
    expect(await probeServer(json({ providers: { google: true } }))).toEqual({ status: 'defunct' })
    expect(await probeServer(json(null))).toEqual({ status: 'defunct' })
    expect(await probeServer(json({ app: 'other' }))).toEqual({ status: 'defunct' })
  })

  it('is offline when the request fails', async () => {
    expect(await probeServer(() => Promise.reject(new TypeError('Failed to fetch')))).toEqual({
      status: 'offline',
    })
  })

  it('is offline, not defunct, when our origin answers 5xx', async () => {
    // The origin exists and is unwell; a cached copy must not declare it dead.
    expect(await probeServer(text('error code: 1101', 500))).toEqual({ status: 'offline' })
    expect(await probeServer(json({ error: 'boom' }, 503))).toEqual({ status: 'offline' })
  })
})
