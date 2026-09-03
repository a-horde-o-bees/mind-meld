/**
 * Removes this device's cached copy of the app: every service worker
 * registration for the origin and every Cache Storage entry, then a reload so
 * the browser fetches whatever the origin really serves now. IndexedDB is
 * deliberately untouched — the documents in it belong to the user.
 *
 * The browser APIs are injected so the sequence is testable in node.
 */

export type CachedCopyDeps = {
  // Readonly because the browser's `getRegistrations()` resolves to a readonly
  // array and this helper only iterates the list.
  registrations: () => Promise<readonly { unregister: () => Promise<boolean> }[]>
  cacheKeys: () => Promise<string[]>
  deleteCache: (key: string) => Promise<boolean>
  reload: () => void
}

export async function clearCachedCopy(deps: CachedCopyDeps): Promise<void> {
  const registrations = await deps.registrations()
  for (const registration of registrations) await registration.unregister()
  const keys = await deps.cacheKeys()
  for (const key of keys) await deps.deleteCache(key)
  deps.reload()
}

export function browserCachedCopyDeps(): CachedCopyDeps {
  return {
    registrations: () =>
      'serviceWorker' in navigator
        ? navigator.serviceWorker.getRegistrations()
        : Promise.resolve([]),
    cacheKeys: () => ('caches' in window ? caches.keys() : Promise.resolve([])),
    deleteCache: (key) => caches.delete(key),
    reload: () => window.location.reload(),
  }
}
