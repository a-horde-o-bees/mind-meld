import { describe, expect, it } from 'vitest'
import { fetchServerConfig } from './server-config'

const respondingWith = (body: unknown, status = 200) => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

describe('fetchServerConfig', () => {
  it('reports google available when the server says so', async () => {
    const config = await fetchServerConfig(respondingWith({ providers: { google: true } }))
    expect(config.providers.google).toBe(true)
  })

  it('reports google unavailable when the server says so', async () => {
    const config = await fetchServerConfig(respondingWith({ providers: { google: false } }))
    expect(config.providers.google).toBe(false)
  })

  it('falls back to no providers when the request fails', async () => {
    const config = await fetchServerConfig(() => Promise.reject(new Error('offline')))
    expect(config.providers.google).toBe(false)
  })

  it('falls back to no providers on a non-OK response', async () => {
    const config = await fetchServerConfig(respondingWith({ error: 'nope' }, 500))
    expect(config.providers.google).toBe(false)
  })

  it('falls back to no providers on a malformed body', async () => {
    expect((await fetchServerConfig(respondingWith({ pro: 'viders' }))).providers.google).toBe(
      false,
    )
    expect((await fetchServerConfig(respondingWith(null))).providers.google).toBe(false)
    expect((await fetchServerConfig(respondingWith({ providers: { google: 'yes' } }))).providers.google).toBe(false)
  })
})
