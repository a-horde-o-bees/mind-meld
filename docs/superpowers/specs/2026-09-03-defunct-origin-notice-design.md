# Defunct-origin notice — Design

A cached copy of the app whose origin no longer serves Mind Meld stops presenting itself as a working app and instead says what happened and how to clear it. The [README](../../../README.md) and [architecture doc](../../ARCHITECTURE.md) describe the system this changes; this records the decision.

- **Date** — 2026-09-03
- **Status** — Proposed
- **Scope** — `packages/client` boot path and config fetch; one field on the Worker's `/api/config`

## Problem

The app is a PWA whose service worker precaches the whole shell and serves it offline-first. When a Worker is deleted or renamed, a browser that once loaded it keeps rendering the app from cache: the page appears, the sign-in form appears, and every request to the server fails. The retired `mind-meld` Worker produced exactly this ghost. Nothing in the build can tell a live origin from a dead one, so no build can warn.

Offline-first is a feature, not the defect. A device with no network must keep working from IndexedDB. The defect is only the case where the server answers and is not Mind Meld.

## Decision

| Question | Decision | Why |
|---|---|---|
| How a live origin is recognised | `/api/config` carries `app: "mind-meld"`; the client requires it | A positive identity beats "not a 404": any reachable server that is not this app fails the check, including Cloudflare's own 1042 page and a stranger's Worker at the same name |
| Where the check runs | Once at boot in `App`, before session handling, and again on the browser `online` event | Boot catches the ghost immediately; the `online` event catches a device that booted offline and reconnects to a dead origin |
| What counts as defunct | The fetch resolves with a response lacking the identity field — any 404, any non-JSON body, JSON without `app` | A resolved response proves a server answered; the missing identity proves it is not ours |
| What does not count | The fetch rejects (network failure) or the Worker answers 5xx | A rejection is offline; a 5xx is our origin unwell. Both keep today's behaviour |
| What the user sees | A full-screen notice replacing the app: the copy is cached on this device, the origin no longer serves Mind Meld, local documents are untouched, and one button clears the cached copy | An app that blocks is honest; the alternative, a banner over an app whose sync and sign-in silently fail, keeps the ghost alive |
| What the button does | Unregisters every service worker for the origin, deletes every Cache Storage entry, reloads | The reload then reaches the real server response. IndexedDB is left alone: the documents in it belong to the user |

A client built before this change cannot detect anything; it protects every build from here on.

## Components

- **Worker `/api/config`** (`packages/worker/src/index.ts`) — adds `app: "mind-meld"` to the existing response.
- **`fetchServerConfig`** (`packages/client/src/lib/server-config.ts`) — returns a three-way result: `{ status: 'ok', config }`, `{ status: 'offline' }`, `{ status: 'defunct' }`. The provider-detection consumer treats anything but `ok` as "no providers", as today.
- **`App`** (`packages/client/src/App.tsx`) — runs the check at boot and on `online`; renders the notice on `defunct`, otherwise today's tree.
- **`DefunctOrigin`** (new component) — the notice and the clearing action, a thin wrapper over `navigator.serviceWorker.getRegistrations()`, `caches.keys()` and `location.reload()`.

## Testing

- Worker suite: `/api/config` includes the identity field.
- `server-config.test.ts`: one case per outcome — identity present, a text 404 in the shape of Cloudflare's 1042 page, JSON without the field, a 5xx, a rejected fetch — plus the existing provider cases against the new result shape.
- By hand after the dev deploy: the retired origin's ghost on a browser that cached it shows the notice, and the button lands on the real 404. A device offline at boot still opens its cached documents.

## Out of scope

- Detecting a *moved* origin and redirecting to it. The dead origin has no way to know where the app went.
- Clearing IndexedDB. The user decides what to do with local documents.
