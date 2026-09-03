# Mind Meld — Design

Why Mind Meld is built the way it is. The [README](../../../README.md) covers what it does and how to run it; this records the decisions behind it, including the ones that were close calls and the constraints that forced them.

- **Date** — 2026-08-21
- **Status** — Implemented. This is the record of a built system, so it closes with what verification caught rather than with a plan.
- **Scope** — `packages/client`, `packages/worker`, `packaging/`

## Goal

A team space, reachable online, for sharing three things:

1. text notes,
2. task lists that can be **manually reordered** and **opened for more robust information**,
3. tabular data **visually organised into trees**, searchable by column values,

built on Yjs.

Everything below follows from those four requirements plus the decisions taken while planning.

## Scope decisions

| Question | Decision | Why |
|---|---|---|
| Reach | Browser + installable PWA + Play Store TWA. No iOS. | One web build covers all three; iOS packaging needs a Mac and a paid developer account for little gain here |
| Hosting | Cloudflare Workers + Durable Objects | The sync layer needs one owner per document; Durable Objects make that a platform guarantee rather than a problem to solve |
| Notes editor | Rich text (ProseMirror + `y-prosemirror`) | Chosen over markdown so no markup shows on screen |
| Auth | Better Auth on D1 | Google **and** email/password were both wanted; sessions, verification and reset are the parts most expensive to hand-write correctly |
| Sessions | 60-day sliding, revocable | "Stay logged in" was wanted, and long sessions are only safe if they can be revoked |
| Email | Resend HTTP API | Forced: Cloudflare sells no outbound email and Workers cannot speak SMTP |
| CI/CD | Cloudflare Workers Builds, one connection per Worker | The test gate lives in the build command, so a red typecheck or test still never deploys — and no Cloudflare token has to be mirrored into GitHub. Supersedes GitHub Actions `wrangler deploy`, which needed exactly that mirror |
| Environments | Two Workers from one `wrangler.toml`, each a named block selected with `--env`: `mind-meld-dev` (`[env.dev]`, deployed from the `dev` branch) and `mind-meld-prod` (`[env.prod]`, deployed from `main`, which is protected and merged into by pull request). The top level is not deployable, so a forgotten `--env` lands on a visibly wrong Worker | Live users are isolated from development; feature branches deploy nowhere until merged, and a careless merge cannot reach `main` by direct push or with failing checks. Supersedes the original single instance, which conflated the two |

## Architecture

### Documents: one Durable Object each

Rooms are named `workspace`, `note_<id>`, `tasks_<id>` and `table_<id>`. `partyserver` routes `/parties/doc-room/<room>` to `env.DocRoom.idFromName(room)`, so each document is a separate Durable Object instance.

The `workspace` room holds **only the index** — id, type, title, icon, order, timestamps. Item content lives in the item's own document, opened lazily when someone views it. This is the difference between a space that opens instantly and one that gets slower as it fills up: a 10,000-row table costs nothing to a person who never opens it.

### Why Durable Objects rather than a Node server

The first sketch of this project was a Node process holding documents in memory with snapshots on local disk. That works for one process and breaks the moment there are two: both hold the same document and fight over one snapshot file. Durable Objects make single-ownership-per-document a property of the platform, so horizontal scaling stops being a problem that needs solving at all.

### Reach: one build, three places

- `vite-plugin-pwa` emits the manifest and a Workbox service worker. `/api` and `/parties` are excluded from the navigation fallback so the SPA shell never swallows an API call.
- Offline works because every open document is mirrored into IndexedDB (`y-indexeddb`) and re-syncs on reconnect. That is also what makes the installed app usable on a phone with no signal, rather than a tab that fails.
- The Play Store path is a **Trusted Web Activity**: Chrome rendering the deployed site full-screen, with no application code of its own. Because it is real Chrome rather than an embedded webview, Google sign-in works untouched — the `disallowed_useragent` restriction that breaks OAuth inside webview wrappers does not apply. The Worker serves `/.well-known/assetlinks.json` from configuration, which is what earns the chrome-less window.

Still open: the HTTPS domain. It is the one input the TWA cannot be finished without, and hosting was deliberately deferred.

## Components

### The room

`y-partyserver`'s `YServer` base class supplies the Yjs sync and awareness protocol, WebSocket **hibernation** (idle connections are not billed and hold no memory), and a debounced save trigger. `packages/worker/src/room.ts` subclasses it to add three things it does not provide:

- **Storage.** `onLoad`/`onSave` read and write a whole-document snapshot in Durable Object storage. A single stored value is size-capped and a busy table exceeds it, so snapshots are split across keys — the arithmetic lives in `snapshot.ts`, apart from the room, because off-by-one errors there are invisible until a document fails to load.
- **An authorisation gate.** The room refuses any socket that arrives without an identity (see [Accounts](#accounts)).
- **Session revocation** for sockets that are already open.

### Ordering: fractional indices, not array positions

Every ordered thing — tasks, subtasks, table rows, sidebar items — carries an `order` string, and lists are sorted by it. Moving an item computes a new string that sorts between its new neighbours (`keyBetween` in `packages/client/src/lib/fractional.ts`).

This is the single most important decision in the codebase, and it exists because of the "manually reordered" requirement meeting real-time collaboration.

The obvious implementation is a `Y.Array` spliced on move. But a splice is delete-then-insert, and when two people drag different rows at the same moment, those operations interleave: the row can be duplicated, or lost outright. A fractional index turns a move into **one field rewrite on one item**, so concurrent moves of different items merge cleanly and concurrent moves of the *same* item resolve to one winner. Ties break by id so every peer agrees.

### Accounts

`packages/worker/src/auth.ts` configures one Better Auth instance per request context, backed by D1.

**Membership is an allowlist.** With email verification working, signup is genuinely open to the internet — so `membership.ts` refuses **every** address unless `MIND_MELD_ALLOWED_DOMAINS` or `MIND_MELD_ALLOWED_EMAILS` is set, or `MIND_MELD_ALLOW_ANY_SIGNUP=1` says otherwise explicitly. An unconfigured space that quietly accepts anyone is the wrong failure mode.

`membership.ts` deliberately imports nothing from Better Auth or the Worker runtime, so the rule that decides who can reach every document is a plain function that can be read and unit-tested on its own. `auth.ts` translates its error into the framework's.

**Optional sign-in providers are plug-and-play.** Google registers with Better Auth only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set, and the same check (`googleConfigured`) feeds a public `GET /api/config` returning `{ providers: { google: boolean } }` — so the client renders the Google button only when the server would honour it, and enabling the provider is just setting the two secrets, with no code change or client rebuild. On any config-fetch failure the client assumes "not configured": a missing button beats a dead one, and email/password never waits on the call.

**Sessions slide over 60 days.** An active teammate is never signed out; a device left idle for two months stops being a way in. That is only defensible with revocation, which is why "sign out everywhere" exists.

**The auth schema is generated from the installed library**, by `scripts/generate-schema.mjs`, not by a separately versioned CLI. That is a scar: the CLI produced an `account` table missing the `issuer` column the installed Better Auth expected, and the mismatch only surfaced at runtime as a failed signup. Asking the library itself for its migration plan cannot drift.

### Email

Cloudflare has no product for this. Email Routing is inbound only — it forwards mail arriving at your domain — and Email Workers process incoming messages, with a `send_email` binding that can only reach addresses pre-verified on your own account. Workers cannot practically speak SMTP either. So verification and reset mail go out over Resend's HTTP API.

`mailer.ts` keeps that behind a small interface: with no `RESEND_API_KEY`, the message body is logged instead of sent, which is what makes the whole signup and reset flow exercisable under `wrangler dev` with no account anywhere.

## Data flow

- **Opening the space.** The client syncs the `workspace` index document and nothing else. Each item's own document is opened only when someone views it, and is mirrored into IndexedDB so it reopens offline and re-syncs on reconnect.
- **Authorising a socket.** Websockets are authorised by the same session cookie as the API. The Worker resolves the session *before* forwarding the upgrade and attaches the user's identity as headers; the room rejects anything arriving without them. The client never supplies its own identity.
- **Reordering.** A move rewrites one item's `order` field; every peer re-sorts by that field, so the change travels as an ordinary Yjs map update.
- **Persisting.** The room's debounced save writes a whole-document snapshot, chunked across Durable Object storage keys.

## Error handling

- **Concurrent moves.** Two peers dragging different rows merge cleanly; two peers dragging the *same* row resolve to one winner, with id as the tie-break so every peer agrees.
- **Crash mid-save.** Snapshot chunks are written before the count key, so a crash mid-write leaves the previous complete snapshot addressable rather than a half-updated one.
- **Rejected signup that reports success.** The allowlist is enforced in two places, and the reason is worth recording. Better Auth's `databaseHooks.user.create.before` prevents the row from being written, but the endpoint still answers **200 with an unsaved user object** — access is denied, yet the client is told signup succeeded. So the check also runs as a request-level `hooks.before` middleware, which produces a real 403 with a readable reason. The database hook remains as defence in depth, and it is the only gate on the Google path, where the address is not known until the provider hands it back.
- **Revocation that would otherwise be cosmetic.** The room re-checks live sockets on an alarm (`MIND_MELD_SESSION_RECHECK_MS`, five minutes by default). Checking only at upgrade time would leave new logins blocked while already-connected clients kept syncing indefinitely.
- **No mail provider configured.** `mailer.ts` logs the message body instead of sending, so a missing key degrades to a visible log line, not a silent drop.

## Testing

### Unit tests

94 unit tests cover the places where a bug is both expensive and invisible: fractional ordering under concurrent moves, the search query language, tree grouping and aggregates, CSV round-tripping, snapshot chunking, and the membership allowlist.

`fractional.test.ts` reproduces exactly the concurrent-move scenario above — two peers each dragging a different row against the list as they saw it — and asserts nothing is lost.

### Two-browser verification, and what it caught

Beyond that, the app was driven in **two real browsers** against `wrangler dev` — 22 checks covering note text and remote cursors flowing both ways, drag and keyboard reordering propagating between windows, tables grouping into searchable trees with totals, documents surviving a server restart, unauthenticated sockets being rejected, and a revoked session closing its live socket.

That exercise earned its place. It caught five defects that unit tests did not and mostly could not:

1. A stale-cache bug in the Yjs subscription hook: the cached snapshot was only invalidated when the *document* changed, so opening a second item showed the first one's data. Selectors now declare their dependencies.
2. A circular import between the task list and its detail panel, which failed at runtime as a temporal-dead-zone error rather than at build time.
3. A `dispatchTransaction` closing over the `EditorView` const its own constructor was still initialising — every note crashed the app.
4. A destroyed-view race: a remote update arriving in the same tick a view was torn down dispatched into a dead editor.
5. Table seeding keyed off the local cache rather than server sync, so a second person opening a brand-new table got a **duplicate set of columns**.

## Out of scope

- iOS packaging and any native shell (Capacitor). If push notifications or genuinely offline-first startup are ever wanted, Capacitor consumes the same client build — but Google sign-in would then need the native plugin path, because a Capacitor webview *is* the embedded-webview case Google blocks.
- Per-document permissions. Every member sees the whole space.
- File attachments.
- Document history and restore. Snapshots are whole-state, not a log, so this would need a different persistence shape.
- Server-side search across documents. Search is client-side over loaded data.
