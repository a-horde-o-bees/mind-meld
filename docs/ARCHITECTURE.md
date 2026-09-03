# Mind Meld — Architecture

How Mind Meld works as built: one Cloudflare Worker serving the client, the auth API and one Durable Object per document, syncing Yjs documents between everyone in the space. This file tracks the current shape and changes with the code; the dated records under [`superpowers/specs/`](superpowers/specs/) hold the decisions behind it.

```
packages/client   Vite + React SPA, PWA-enabled
packages/worker   Worker: router, auth, static assets, and the Yjs Durable Object
packaging/        Play Store (TWA) scaffolding — no app code
```

One Worker, one origin: the built client via `[assets]`, `/api/*` for auth and config, `/parties/doc-room/<room>` for sync sockets, and `/.well-known/assetlinks.json` for the Play app. Same origin means the session cookie rides on the websocket upgrade with no CORS work.

## Documents

- **One Durable Object per document.** Rooms are named `workspace`, `note_<id>`, `tasks_<id>` and `table_<id>`; `routing.ts` validates the pattern because names become storage names and appear in URLs. `partyserver` routes each room to `env.DocRoom.idFromName(room)`.
- **The `workspace` room holds only the index** — id, type, title, icon, order, timestamps. Content lives in the item's own document, opened when someone views it, so a large table costs nothing to a person who never opens it.
- **The room** (`room.ts`) subclasses `y-partyserver`'s `YServer`, which supplies the sync and awareness protocol, websocket hibernation (idle connections hold no memory and are not billed) and a debounced save trigger (2 s debounce, 15 s ceiling). The subclass adds storage, the authorisation gate and session revocation.
- **Persistence** is a whole-document snapshot in Durable Object storage, split into 48 KiB chunks (`snapshot.ts`) because a single stored value is size-capped. Chunks are written before the count key, so a crash mid-write leaves the previous complete snapshot addressable. `DELETE /api/rooms/<room>` discards a document's stored state.
- **Offline.** The client mirrors every open document into IndexedDB (`y-indexeddb`), so it reopens without a network and re-syncs on reconnect.

## Ordering

Every ordered thing — tasks, subtasks, table rows, sidebar items — carries an `order` string, and lists sort by it. A move computes a new string between its new neighbours (`keyBetween` in `packages/client/src/lib/fractional.ts`): one field rewrite on one item. Concurrent moves of different items merge cleanly, and concurrent moves of the same item resolve to one winner, with id as the tie-break so every peer agrees. Splicing a shared array instead would be delete-then-insert, which duplicates or drops a row when two moves interleave.

## Accounts

- **Better Auth on D1** (`auth.ts`), one instance per request context. Email and password always; Google registers only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set. The same check feeds `GET /api/config`, which returns `{ app: "mind-meld", providers: { google: boolean } }`, so the client shows the Google button only when the server would honour it and treats a failed fetch as "not configured".
- **Membership is an allowlist** (`membership.ts`): every address is refused unless `MIND_MELD_ALLOWED_DOMAINS` or `MIND_MELD_ALLOWED_EMAILS` admits it, or `MIND_MELD_ALLOW_ANY_SIGNUP=1` opens signup deliberately. The module imports nothing from Better Auth or the Worker runtime, so the rule deciding who reaches every document is a plain, unit-tested function. It runs twice: as a request-level `hooks.before`, which yields a real 403 with a readable reason (the database hook alone lets the endpoint answer 200 with an unsaved user), and as `databaseHooks.user.create.before`, defence in depth and the only gate on the Google path, where the address arrives from the provider.
- **Sessions last 60 days and slide**, refreshed on activity, and "sign out everywhere" revokes them.
- **Sockets are authorised by the same cookie.** The Worker resolves the session before forwarding the upgrade and attaches the identity as headers; the room closes any socket arriving without them. The client never supplies its own identity. The room also re-checks live sockets on an alarm (`MIND_MELD_SESSION_RECHECK_MS`, five minutes by default), so a revoked session stops syncing instead of lingering until it reconnects.
- **The auth schema is generated from the installed library** by `scripts/generate-schema.mjs` into `migrations/`, so the tables and the Better Auth version in `package.json` cannot drift.

## Email

Verification and password-reset mail go out over Resend's HTTP API (`mailer.ts`). Without `RESEND_API_KEY` the message body is logged instead of sent, which keeps the whole signup and reset flow exercisable under `wrangler dev`. Cloudflare has no outbound email product: Email Routing is inbound only, and Workers cannot speak SMTP.

## Reach

- **PWA.** `vite-plugin-pwa` emits the manifest and an auto-updating Workbox service worker, with `/api`, `/parties` and `/.well-known` excluded from the navigation fallback so the shell never swallows an API call.
- **A cached copy checks its origin.** At boot and on reconnect the client probes `/api/config` and requires the `app` identity. A rejected request or a 5xx is "offline" and changes nothing, since offline-first is a feature. A server that answers without the identity — Cloudflare's page for a deleted Worker, or something else at the same name — means this copy is a ghost: the app is replaced by a notice whose one button unregisters the service worker and clears Cache Storage, then reloads. IndexedDB is never touched; the documents in it belong to the user.
- **Play Store.** A Trusted Web Activity: real Chrome rendering the deployed site full-screen, with no application code of its own. Because it is Chrome rather than an embedded webview, Google sign-in works untouched. The Worker serves `/.well-known/assetlinks.json` from `ANDROID_PACKAGE` and `ANDROID_FINGERPRINTS`, which is what earns the chrome-less window.

## What the tests guard

Unit tests cover the places where a bug is expensive and invisible: fractional ordering under concurrent moves, the search query language, tree grouping and aggregates, CSV round-tripping, snapshot chunking, the membership allowlist, and the configuration contract that every `Env` field is documented in `wrangler.toml` or `.env.example`.
