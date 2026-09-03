import { describe, expect, it } from 'vitest'
import { clearCachedCopy, type CachedCopyDeps } from './cached-copy'

function fakeDeps(cacheKeys: string[], registrationCount: number) {
  const log: string[] = []
  const deps: CachedCopyDeps = {
    registrations: async () =>
      Array.from({ length: registrationCount }, (_, index) => ({
        unregister: async () => {
          log.push(`unregister:${index}`)
          return true
        },
      })),
    cacheKeys: async () => cacheKeys,
    deleteCache: async (key) => {
      log.push(`delete:${key}`)
      return true
    },
    reload: () => log.push('reload'),
  }
  return { deps, log }
}

describe('clearCachedCopy', () => {
  it('unregisters every service worker and deletes every cache before reloading', async () => {
    const { deps, log } = fakeDeps(['workbox-precache-v2', 'fonts'], 2)
    await clearCachedCopy(deps)
    expect(log).toEqual([
      'unregister:0',
      'unregister:1',
      'delete:workbox-precache-v2',
      'delete:fonts',
      'reload',
    ])
  })

  it('still reloads when there is nothing to clear', async () => {
    const { deps, log } = fakeDeps([], 0)
    await clearCachedCopy(deps)
    expect(log).toEqual(['reload'])
  })

  it('does not reload if clearing throws, so the notice can report it', async () => {
    const { deps, log } = fakeDeps(['workbox-precache-v2'], 0)
    deps.deleteCache = async () => {
      throw new Error('denied')
    }
    await expect(clearCachedCopy(deps)).rejects.toThrow('denied')
    expect(log).toEqual([])
  })
})
