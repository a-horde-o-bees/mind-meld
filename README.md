# Mind Meld

A shared team space where notes, task lists and tables update live as everyone types. Built on [Yjs](https://yjs.dev) CRDTs, running on Cloudflare Workers with one Durable Object per document.

- **📝 Notes** — rich text (no markup on screen), edited concurrently with each person's cursor visible and labelled.
- **✅ Task lists** — reorder by dragging or with `Alt+↑` / `Alt+↓`; open any task for status, assignee, due date, priority, tags, a full description, a checklist and comments.
- **🌳 Tables** — typed columns, and grouping by any column turns the table into a searchable tree with per-branch counts and totals. CSV in and out.

Everything works offline and re-syncs on reconnect, so the installable app is usable on a phone with no signal.

## Reach

One build serves three places:

| Where | How |
|---|---|
| Browser | Served by the Worker at your domain |
| Installable app | A PWA: "Install" in Chrome, "Add to Home Screen" on iOS |
| Google Play | A Trusted Web Activity wrapping the same site — see [`packaging/android-twa`](packaging/android-twa/README.md) |

## Getting started

```bash
npm install
cp packages/worker/.dev.vars.example packages/worker/.dev.vars   # then edit it
npm run db:migrate:local                                          # create the auth tables
npm run build                                                     # build the client
npm run dev                                                       # http://localhost:8787
```

`npm run dev` runs the real Worker locally via `wrangler dev`, serving the built client, the auth endpoints and the sync sockets from one origin. With no `RESEND_API_KEY` set, verification and password-reset emails are printed to the console instead of sent — which is usually what you want locally.

For a faster edit loop on the interface, run the Vite dev server alongside it:

```bash
npm run dev            # terminal one: the Worker on :8787
npm run dev:client     # terminal two: Vite on :5173, proxying /api and /parties
```

That needs `MIND_MELD_EXTRA_ORIGINS=http://localhost:5173` in `.dev.vars`, so the sign-in request from the Vite origin is trusted.

## Architecture

[`docs/superpowers/specs/2026-08-21-mind-meld-design.md`](docs/superpowers/specs/2026-08-21-mind-meld-design.md) records why these choices were made — the close calls, the constraints that forced them, and what the two-browser test run caught.

```
packages/client   Vite + React SPA, PWA-enabled
packages/worker   Worker: router, auth, static assets, and the Yjs Durable Object
packaging/        Play Store (TWA) scaffolding — no app code
```

**One document per Durable Object.** Rooms are named `workspace`, `note_<id>`, `tasks_<id>` and `table_<id>`. The `workspace` room holds only the index — id, type, title, icon, order — so it loads instantly, and an item's own document is opened lazily when someone views it. A big table never occupies memory for people who never open it.

[`y-partyserver`](https://github.com/cloudflare/partykit) supplies the sync and awareness protocol, websocket hibernation (idle connections cost nothing) and the debounced save trigger. `packages/worker/src/room.ts` adds storage, authorisation and session revocation on top.

**Ordering is by fractional index, never by array position.** Moving a task rewrites one string field on one task, so two people dragging different rows at the same moment merge cleanly. Splicing a shared array instead means delete-then-insert, which is exactly the shape that duplicates or drops a row when two moves interleave. See `packages/client/src/lib/fractional.ts`.

**Persistence** is a whole-document snapshot in Durable Object storage, chunked across keys because a single value is size-capped, written on a 2s debounce with a 15s ceiling. Clients additionally mirror every open document into IndexedDB.

## Accounts

Sign-in is [Better Auth](https://better-auth.com) with **Google** and **email + password**, on a D1 database.

- Sessions last **60 days and slide**: an active teammate is never signed out, while a device left idle for two months stops being a way in. "Sign out everywhere" is in the account menu, and the Worker re-checks open sockets so a revoked session stops syncing rather than lingering until it reconnects.
- Email verification and password reset are real, sent through Resend. Cloudflare has no outbound email product — Email Routing is inbound only and Workers cannot speak SMTP — so an HTTP email API is required.
- **Membership is an allowlist.** Self-signup is genuinely open once email works, so set `MIND_MELD_ALLOWED_DOMAINS` or `MIND_MELD_ALLOWED_EMAILS`. With neither set the Worker refuses every signup unless you explicitly set `MIND_MELD_ALLOW_ANY_SIGNUP=1`, which lets anyone on the internet in.

Every document socket is authorised by the same session cookie: the Worker resolves the session before the upgrade reaches the room and rejects it with 401 otherwise.

## Configuration

Set in `packages/worker/wrangler.toml` under `[vars]`, or in `.dev.vars` locally. The two allowlist variables are set as per-Worker secrets instead (`wrangler secret put`), keeping personal addresses out of the committed config:

| Variable | Purpose |
|---|---|
| `APP_URL` | Public origin. Must match the Google OAuth client's authorised origin. |
| `MIND_MELD_ALLOWED_DOMAINS` | Comma-separated domains that may hold an account (secret) |
| `MIND_MELD_ALLOWED_EMAILS` | Comma-separated individual addresses (secret) |
| `MIND_MELD_ALLOW_ANY_SIGNUP` | `1` to accept any address — read the warning above |
| `MAIL_FROM` | Sender for verification and reset mail |
| `ANDROID_PACKAGE`, `ANDROID_FINGERPRINTS` | Populate `/.well-known/assetlinks.json` for the Play app |
| `MIND_MELD_EXTRA_ORIGINS` | Extra trusted origins, for the Vite dev server |
| `MIND_MELD_SESSION_RECHECK_MS` | How often live sockets re-check their session (default 5 min) |

Secrets, via `wrangler secret put NAME` — never in the repo:

`BETTER_AUTH_SECRET` (random 32+ bytes), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`.

## Deploy your own

This repository is replicable from a fresh clone: the steps below take a blank Cloudflare account and an empty GitHub repo to a working two-environment pipeline. `main` is production — protected, merged into by pull request, and every merge deploys `mind-meld-prod`. Day-to-day work happens on a dedicated development branch (`dev` here; any name works) that deploys `mind-meld-dev` on every push. Feature branches deploy nowhere: they get CI, and reach an environment only when you deliberately merge them. Each Worker has its own Durable Objects, D1 database and secrets, so dev and prod state never mix.

Prerequisites: a Cloudflare account (the free plan suffices — SQLite-backed Durable Objects run on it), Node 20+, and a fork or clone of this repo pushed to your own GitHub.

**1. Authenticate wrangler** (opens a browser; no API token to store):

```bash
npx wrangler login
```

**2. Provision the databases**, from `packages/worker/`:

```bash
npx wrangler d1 create mind-meld-dev
npx wrangler d1 create mind-meld-prod
```

Paste each printed `database_id` into its block in `wrangler.toml` (`[[d1_databases]]` for dev, `[[env.production.d1_databases]]` for prod).

**3. Make the config yours.** These `wrangler.toml` values are this deployment's, not placeholders — replace them in both `[vars]` and `[env.production.vars]`: `APP_URL` (your Workers URLs are `https://mind-meld-dev.<your-subdomain>.workers.dev` and `…-prod…`) and `MAIL_FROM`. The membership allowlist is deliberately **not** in this file — it goes in as a secret in the next step, so personal addresses never sit in a public repo.

**4. Migrate, set secrets, and deploy both Workers**, from the repo root:

```bash
npm install
npm run db:migrate:remote                                  # dev database
npm run db:migrate:prod                                    # prod database
cd packages/worker
openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET
openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET --env production
echo "you@example.com" | npx wrangler secret put MIND_MELD_ALLOWED_EMAILS
echo "you@example.com" | npx wrangler secret put MIND_MELD_ALLOWED_EMAILS --env production
cd ../..
npm run deploy                                             # dev worker
npm run deploy:prod                                        # prod worker
```

Both URLs should now serve the app, with signups limited to your allowlist.

**5. Create the dev branch and protect main:**

```bash
git branch dev && git push -u origin dev
```

Then in GitHub, add a ruleset for `main` (Settings → Rules → Rulesets): require a pull request before merging, and require the CI check to pass. Add a required review for any repo where more than one pair of hands merges; a solo or agent-operated repo can set required approvals to zero and still keep the protection that matters — nothing reaches `main`, and therefore production, by direct push or with failing checks.

**6. Connect the pipeline.** In the Cloudflare dashboard, for **each** Worker: Workers & Pages → the Worker → Settings → Builds → Connect, choose your repo, then set:

| Setting | mind-meld-dev | mind-meld-prod |
|---|---|---|
| Branch | `dev` | `main` |
| Root directory | `/` | `/` |
| Build command | `npm ci && npm run typecheck && npm test && npm run build` | same |
| Deploy command | `cd packages/worker && npx wrangler d1 migrations apply mind-meld-dev --remote && npx wrangler deploy` | `cd packages/worker && npx wrangler d1 migrations apply mind-meld-prod --remote --env production && npx wrangler deploy --env production` |

Cloudflare builds and deploys from inside the platform, so no API token is ever copied anywhere; a red typecheck or test fails the build and never deploys, and migrations are applied before the code that expects them. The GitHub Actions workflow (`ci.yml`) runs the same checks plus a credential-free `wrangler deploy --dry-run` of both environments, as the visible gate on every branch.

The working loop this produces: branch from `dev` and push freely (CI runs, nothing deploys) → merge into `dev` to see the feature live on the dev Worker → pull-request `dev` into `main` to release.

**7. Optional add-ons**, each independent and skippable:

- **Google sign-in**: in Google Cloud Console create an OAuth 2.0 **Web application** client — your origin under "Authorised JavaScript origins", `https://YOUR-DOMAIN/api/auth/callback/google` under "Authorised redirect URIs" — then `wrangler secret put GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (per environment). The sign-in button appears on its own: the client asks `/api/config` what the server has configured.
- **Real email** (verification and reset): a [Resend](https://resend.com) API key via `wrangler secret put RESEND_API_KEY` (per environment); without it, emails are logged by the Worker instead of sent.
- **Play Store app**: see [`packaging/android-twa`](packaging/android-twa/README.md).

### Roughly what it costs

For a team of about ten, this sits inside the free tier: SQLite-backed Durable Objects run on the Workers Free plan, websocket messages bill as requests, and hibernation means idle sockets cost nothing. The $5/month Workers Paid plan buys headroom and removes daily caps. D1, Durable Object storage, static assets and Resend's free tier cover the rest. One-off: Play Console $25, a domain ~$10/year. Check Cloudflare's current pricing before relying on these figures.

## Development

```bash
npm test         # unit tests for both packages
npm run typecheck
npm run build
```

Tests cover the parts where a subtle bug is expensive and invisible: fractional index ordering under concurrent moves, the search query language, tree grouping and aggregates, CSV round-tripping, snapshot chunking, and the membership allowlist.

## Not built yet

- iOS packaging, and any native shell (Capacitor)
- Per-document permissions — every member sees the whole space
- File attachments
- Document history and restore
- Server-side search across documents
