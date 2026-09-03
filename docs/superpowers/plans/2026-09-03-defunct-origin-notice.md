# Defunct-Origin Notice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cached copy of the app whose origin no longer serves Mind Meld replaces itself with a notice and a button that clears the cached copy, while offline use keeps working.

**Architecture:** The Worker's `/api/config` identifies itself with `app: "mind-meld"`. The client probes it at boot and on reconnect, classifying the outcome as `ok`, `offline` (fetch rejected or 5xx) or `defunct` (a server answered without the identity). On `defunct`, `App` renders a full-screen notice whose button unregisters service workers and deletes Cache Storage, then reloads; IndexedDB is never touched.

**Tech Stack:** Cloudflare Workers (TypeScript), React 18 + Vite client, vitest in both packages (node environment; no DOM tests).

**Spec:** `docs/superpowers/specs/2026-09-03-defunct-origin-notice-design.md`

## Global Constraints

- Every change to this repo goes through `dev`; commit on `dev`, never on `main`.
- Commits carry the repo's configured identity; do not pass `--author`.
- IndexedDB is never cleared by anything in this plan.
- A rejected fetch or a 5xx response keeps today's behaviour (offline-first); only a resolved response lacking `app: "mind-meld"` is `defunct`.
- `docs/ARCHITECTURE.md` is updated in the same change as the code (project guidance).
- Run tests from the repo root with `npm test`, or per package with `npx vitest run <file>` inside `packages/<pkg>`.

---

### Task 1: Worker identifies itself on `/api/config`

**Files:**

- Modify: `packages/worker/src/auth.ts` (add `serverConfig` beside `googleConfigured`)
- Modify: `packages/worker/src/index.ts:27-32`
- Test: `packages/worker/test/worker.test.ts`

**Interfaces:**

- Consumes: `googleConfigured(env: Env): boolean` (exists in `auth.ts`).
- Produces: `serverConfig(env: Env): { app: 'mind-meld'; providers: { google: boolean } }` — the exact body `/api/config` returns. The client (Task 2) requires `app === 'mind-meld'`.

Steps:

- [ ] **Step 1: Write the failing test**

In `packages/worker/test/worker.test.ts`, change the import line `import { googleConfigured } from '../src/auth'` to `import { googleConfigured, serverConfig } from '../src/auth'`, and add this block after the `google provider detection` describe:

```ts
describe('server config', () => {
  it('identifies the app so a cached client can tell a live origin from a dead one', () => {
    expect(serverConfig(env())).toEqual({ app: 'mind-meld', providers: { google: false } })
    expect(
      serverConfig(env({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' })).providers
        .google,
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/worker`): `npx vitest run test/worker.test.ts -t 'server config'`

Expected: FAIL — `serverConfig` is not exported.

- [ ] **Step 3: Implement `serverConfig` and use it in the route**

In `packages/worker/src/auth.ts`, directly below `googleConfigured`:

```ts
/**
 * Body of `GET /api/config`. `app` is a positive identity: a client served from
 * cache on an origin that no longer runs Mind Meld gets some other answer here
 * (Cloudflare's "worker not found" page, a stranger's Worker) and can tell.
 */
export function serverConfig(env: Env): {
  app: 'mind-meld'
  providers: { google: boolean }
} {
  return { app: 'mind-meld', providers: { google: googleConfigured(env) } }
}
```

In `packages/worker/src/index.ts`, change the import to `import { getAuth, getSessionUser, serverConfig } from './auth'` and replace the route body:

```ts
    // Which optional sign-in methods are live, so the client only renders
    // buttons the server will honour, plus an identity a cached client checks
    // at boot. Public by design: it holds booleans, never credentials.
    if (url.pathname === '/api/config') {
      return json(serverConfig(env))
    }
```

If `googleConfigured` is no longer referenced in `index.ts`, drop it from that import.

- [ ] **Step 4: Run the worker suite and typecheck**

Run (from `packages/worker`): `npx vitest run && npm run typecheck`

Expected: all tests PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src/auth.ts packages/worker/src/index.ts packages/worker/test/worker.test.ts
git commit -m "Identify the app on /api/config so a cached client can tell a live origin"
```

---

### Task 2: Client probe classifies the origin as ok, offline or defunct

**Files:**

- Modify: `packages/client/src/lib/server-config.ts` (whole file)
- Modify: `packages/client/src/components/AuthScreens.tsx:3,25-32`
- Test: `packages/client/src/lib/server-config.test.ts` (whole file)

**Interfaces:**

- Consumes: the Task 1 body shape `{ app: 'mind-meld', providers: { google: boolean } }`.
- Produces the shape below. `fetchServerConfig` is removed; `AuthScreens` is its only caller and moves to `probeServer`.

```ts
export type ServerConfig = { providers: { google: boolean } }
export type ServerProbe =
  | { status: 'ok'; config: ServerConfig }
  | { status: 'offline' }
  | { status: 'defunct' }
export function probeServer(fetchImpl?: (url: string) => Promise<Response>): Promise<ServerProbe>
```

Steps:

- [ ] **Step 1: Replace the test file with the failing cases**

Overwrite `packages/client/src/lib/server-config.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/client`): `npx vitest run src/lib/server-config.test.ts`

Expected: FAIL — `probeServer` is not exported.

- [ ] **Step 3: Rewrite `server-config.ts`**

Overwrite `packages/client/src/lib/server-config.ts`:

```ts
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
 * - `offline`: the request failed, or our origin answered 5xx. Both keep the
 *   app working from local data; a sick origin is not a dead one.
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
```

- [ ] **Step 4: Move `AuthScreens` to the probe**

In `packages/client/src/components/AuthScreens.tsx`, change line 3 to `import { probeServer } from '../lib/server-config'` and the effect to:

```ts
  useEffect(() => {
    let cancelled = false
    void probeServer().then((probe) => {
      if (!cancelled && probe.status === 'ok') setGoogleAvailable(probe.config.providers.google)
    })
    return () => {
      cancelled = true
    }
  }, [])
```

- [ ] **Step 5: Run the client suite and typecheck**

Run (from `packages/client`): `npx vitest run && npm run typecheck`

Expected: all tests PASS (the five probe cases included), typecheck clean. A typecheck error naming `fetchServerConfig` means a caller was missed; there should be none besides `AuthScreens`.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/lib/server-config.ts packages/client/src/lib/server-config.test.ts packages/client/src/components/AuthScreens.tsx
git commit -m "Probe the origin at boot: ok, offline, or defunct"
```

---

### Task 3: Clearing the cached copy, with browser APIs injected

**Files:**

- Create: `packages/client/src/lib/cached-copy.ts`
- Test: `packages/client/src/lib/cached-copy.test.ts`

**Interfaces:**

- Produces the shape below. Task 4 calls `clearCachedCopy(browserCachedCopyDeps())` from the notice's button.

```ts
export type CachedCopyDeps = {
  registrations: () => Promise<{ unregister: () => Promise<boolean> }[]>
  cacheKeys: () => Promise<string[]>
  deleteCache: (key: string) => Promise<boolean>
  reload: () => void
}
export function clearCachedCopy(deps: CachedCopyDeps): Promise<void>
export function browserCachedCopyDeps(): CachedCopyDeps
```

Steps:

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/lib/cached-copy.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/client`): `npx vitest run src/lib/cached-copy.test.ts`

Expected: FAIL — module `./cached-copy` not found.

- [ ] **Step 3: Implement `cached-copy.ts`**

Create `packages/client/src/lib/cached-copy.ts`:

```ts
/**
 * Removes this device's cached copy of the app: every service worker
 * registration for the origin and every Cache Storage entry, then a reload so
 * the browser fetches whatever the origin really serves now. IndexedDB is
 * deliberately untouched — the documents in it belong to the user.
 *
 * The browser APIs are injected so the sequence is testable in node.
 */

export type CachedCopyDeps = {
  registrations: () => Promise<{ unregister: () => Promise<boolean> }[]>
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `packages/client`): `npx vitest run src/lib/cached-copy.test.ts && npm run typecheck`

Expected: 3 tests PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/cached-copy.ts packages/client/src/lib/cached-copy.test.ts
git commit -m "Clear a device's cached copy of the app: service workers and caches, never IndexedDB"
```

---

### Task 4: The notice, and the boot and reconnect check in `App`

**Files:**

- Create: `packages/client/src/components/DefunctOrigin.tsx`
- Modify: `packages/client/src/App.tsx:1-38`
- Modify: `packages/client/src/styles.css` (append after the `.boot__spinner` rule, around line 169)

**Interfaces:**

- Consumes: `probeServer(): Promise<ServerProbe>` (Task 2), `clearCachedCopy(browserCachedCopyDeps())` (Task 3).
- Produces: `DefunctOrigin({ origin }: { origin: string })` and `useOriginStatus(): 'pending' | 'ok' | 'offline' | 'defunct'`. `App` renders `DefunctOrigin` when the status is `defunct` and otherwise renders exactly what it renders today; `pending` never blocks the boot.

No automated test: the component is markup over browser APIs and the client suite runs in node. Verification is by hand in Step 4.

Steps:

- [ ] **Step 1: Create the notice and the status hook**

Create `packages/client/src/components/DefunctOrigin.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { browserCachedCopyDeps, clearCachedCopy } from '../lib/cached-copy'
import { probeServer, type ServerProbe } from '../lib/server-config'

export type OriginStatus = 'pending' | ServerProbe['status']

/**
 * Whether the origin still serves Mind Meld. Probed once at boot and again
 * whenever the browser reports coming back online, so a device that booted
 * offline learns the truth when it reconnects. `pending` never blocks anything.
 */
export function useOriginStatus(): OriginStatus {
  const [status, setStatus] = useState<OriginStatus>('pending')

  useEffect(() => {
    let cancelled = false
    const probe = () => {
      void probeServer().then((result) => {
        if (!cancelled) setStatus(result.status)
      })
    }
    probe()
    window.addEventListener('online', probe)
    return () => {
      cancelled = true
      window.removeEventListener('online', probe)
    }
  }, [])

  return status
}

/**
 * Full-screen notice for a copy of the app cached on this device whose origin
 * no longer serves Mind Meld. Replaces the app rather than sitting over it: a
 * ghost that still shows a sign-in form is the failure this exists to end.
 */
export function DefunctOrigin({ origin }: { origin: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clear = async () => {
    setBusy(true)
    setError(null)
    try {
      await clearCachedCopy(browserCachedCopyDeps())
    } catch (cause) {
      setBusy(false)
      setError(cause instanceof Error ? cause.message : 'Could not clear the cached copy')
    }
  }

  return (
    <div className="boot defunct" role="alert">
      <h1 className="defunct__title">This copy of Mind Meld is no longer served</h1>
      <p>
        You are seeing a copy cached on this device. The server at <code>{origin}</code> no
        longer runs Mind Meld, so nothing here can sign in or sync.
      </p>
      <p>
        Documents stored on this device are untouched. Clearing removes only the cached app; if
        Mind Meld has moved, open its new address in your browser.
      </p>
      <button type="button" className="button button--primary" onClick={clear} disabled={busy}>
        {busy ? 'Clearing…' : 'Clear the cached copy'}
      </button>
      {error && <p className="defunct__error">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `App`**

In `packages/client/src/App.tsx`, add the import `import { DefunctOrigin, useOriginStatus } from './components/DefunctOrigin'` beside the other component imports, and change the top of `App` to:

```tsx
export function App() {
  const origin = useOriginStatus()
  const { data: session, isPending } = useSession()

  // A cached copy whose origin no longer serves the app says so instead of
  // pretending. `pending` and `offline` change nothing: offline-first is a
  // feature, and the probe never delays the boot.
  if (origin === 'defunct') return <DefunctOrigin origin={window.location.origin} />

  if (isPending) {
```

Everything below `if (isPending) {` stays as it is.

- [ ] **Step 3: Style the notice**

Append to `packages/client/src/styles.css`, directly after the `.boot__spinner` rule:

```css
.defunct {
  max-width: 34rem;
  margin: 0 auto;
  padding: 2rem 1.25rem;
  text-align: left;
  gap: 0.75rem;
}

.defunct__title {
  font-size: 1.25rem;
  margin: 0;
}

.defunct code {
  word-break: break-all;
}

.defunct__error {
  color: var(--danger, #b42318);
  margin: 0;
}
```

If `styles.css` defines a danger colour under another variable name, use that name in place of `--danger`.

- [ ] **Step 4: Typecheck, build, and verify by hand**

Run (from the repo root): `npm run typecheck && npm test && npm run build`

Expected: clean, all tests PASS, client builds.

Then run the Worker locally and check the three outcomes:

1. `npm run dev`, open `http://localhost:8787`. Expected: the normal sign-in screen (probe `ok`).
2. In DevTools → Network, set "Offline", reload. Expected: the cached shell opens as before, no notice (probe `offline`). Set back to "Online".
3. Simulate a dead origin: in DevTools → Network, add a request-blocking rule for `*/api/config` is not enough (blocking rejects, which is `offline`). Instead, temporarily edit the route in `packages/worker/src/index.ts` to `return new Response('error code: 1042', { status: 404 })`, let `wrangler dev` reload, then reload the page. Expected: the notice appears in place of the app, naming `http://localhost:8787`. Click "Clear the cached copy": the page reloads and shows the notice again (the origin is still "dead" but the copy came from the server this time). Revert the temporary edit before committing; `git diff packages/worker/src/index.ts` must be empty.

Only the client files change in this task's commit.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/DefunctOrigin.tsx packages/client/src/App.tsx packages/client/src/styles.css
git commit -m "Show a notice instead of a ghost app when the origin no longer serves Mind Meld"
```

---

### Task 5: Architecture doc

**Files:**

- Modify: `docs/ARCHITECTURE.md` (Accounts section, the "Better Auth on D1" bullet; and the Reach section, the PWA bullet)

**Interfaces:** none.

Steps:

- [ ] **Step 1: Record the current shape**

In `docs/ARCHITECTURE.md`, in the Accounts bullet that begins with **Better Auth on D1**, replace the sentence that quotes the `/api/config` return shape with:

```markdown
The same check feeds `GET /api/config`, which returns `{ app: "mind-meld", providers: { google: boolean } }`, so the client shows the Google button only when the server would honour it and treats a failed fetch as "not configured".
```

In the Reach section, append this bullet after the PWA bullet:

```markdown
- **A cached copy checks its origin.** At boot and on reconnect the client probes `/api/config` and requires the `app` identity. A rejected request or a 5xx is "offline" and changes nothing, since offline-first is a feature. A server that answers without the identity — Cloudflare's page for a deleted Worker, or something else at the same name — means this copy is a ghost: the app is replaced by a notice whose one button unregisters the service worker and clears Cache Storage, then reloads. IndexedDB is never touched; the documents in it belong to the user.
```

- [ ] **Step 2: Lint and commit**

Run: `node /home/dev/.claude/skills/markdown-authoring/scripts/lint.mjs docs/ARCHITECTURE.md`

Expected: 0 errors, 0 warnings.

```bash
git add docs/ARCHITECTURE.md
git commit -m "Architecture: a cached copy checks its origin at boot"
```

---

### Task 6: Ship to dev and confirm the ghost is caught

**Files:** none (verification only).

Steps:

- [ ] **Step 1: Push and watch the build**

```bash
git push origin dev
```

Then wait for GitHub CI to pass on the pushed commit and for Workers Builds to deploy `mind-meld-dev` (about ninety seconds after the push):

Run (from `packages/worker`): `npx wrangler deployments list --env dev | grep '^Created:' | sort | tail -1`

Expected: a timestamp after the push.

- [ ] **Step 2: Verify the live probe**

Run: `curl -s https://mind-meld-dev.a-horde-o-bees.workers.dev/api/config`

Expected: `{"app":"mind-meld","providers":{"google":false}}`

- [ ] **Step 3: Verify the notice against a real dead origin**

On a browser that has the new build cached from the dev URL: open the dev URL once so the new service worker installs, then in DevTools → Application → Service Workers, confirm the registration is current. A real dead origin cannot be produced without deleting a Worker, so the by-hand check from Task 4 Step 4 stands as the evidence for the notice; this step confirms the shipped build carries the probe by checking the Network tab shows a `/api/config` request on every load and on each `online` event.
