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
| Installable app | A [PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps), installed from the browser |
| Google Play | A [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity) wrapping the same site — see [`packaging/android-twa`](packaging/android-twa/README.md) |

## Getting started

```bash
npm install
cp packages/worker/.env.example packages/worker/.env   # then edit it
npm run db:migrate:local                                # create the auth tables
npm run build                                           # build the client
npm run dev                                             # http://localhost:8787
```

`npm run dev` runs the real Worker locally via `wrangler dev --env dev`, serving the built client, the auth endpoints and the sync sockets from one origin, with `.env` supplying the secrets a deployed Worker gets from `wrangler secret put`. With no `RESEND_API_KEY` set, verification and password-reset emails are printed to the console instead of sent — which is usually what you want locally.

For a faster edit loop on the interface, run the Vite dev server alongside it:

```bash
npm run dev            # terminal one: the Worker on :8787
npm run dev:client     # terminal two: Vite on :5173, proxying /api and /parties
```

That needs `MIND_MELD_EXTRA_ORIGINS=http://localhost:5173` in `.env`, so the sign-in request from the Vite origin is trusted.

## Architecture

How it works as built, including the package layout: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The decisions behind it, as dated records: [`docs/superpowers/specs/`](docs/superpowers/specs/).

## Accounts

Sign-in is [Better Auth](https://better-auth.com) on D1: email + password always, and Google once its two secrets are set. **Membership is an allowlist.** Set `MIND_MELD_ALLOWED_DOMAINS` or `MIND_MELD_ALLOWED_EMAILS`; with neither set the Worker refuses every signup unless you explicitly set `MIND_MELD_ALLOW_ANY_SIGNUP=1`, which lets anyone on the internet in. Verification and password-reset mail go through Resend, and without `RESEND_API_KEY` they are logged instead of sent.

## Configuration

Set per environment in `packages/worker/wrangler.toml` under `[env.<name>.vars]`, or in `.env` locally. The two allowlist variables are set as per-environment secrets instead (`wrangler secret put NAME --env <name>`), keeping personal addresses out of the committed config:

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

Secrets, via `wrangler secret put NAME --env <name>` — never in the repo:

`BETTER_AUTH_SECRET` (random 32+ bytes), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`.

## Deploy your own

This repository is a recipe for running one Worker per environment from a single config file. The steps below take a blank Cloudflare account and an empty GitHub repo to one running environment, then to a promotion pipeline between as many environments as you run. This repo runs two, `dev` and `prod`, and ships both blocks.

An environment is four things: an `[env.<name>]` block in `packages/worker/wrangler.toml`, a D1 database, a Worker with its own secrets, and a git branch that deploys it. Every wrangler command names its environment with `--env <name>`. The config's top level is deliberately not deployable, so a forgotten flag produces a visibly wrong Worker rather than a silent deploy to the wrong one.

Prerequisites: a Cloudflare account (the free plan suffices — SQLite-backed Durable Objects run on it), Node 20+, and a fork or clone of this repo pushed to your own GitHub.

### One environment

The walkthrough uses `dev`. Its `[env.dev]` block ships in `wrangler.toml` holding this deployment's values, marked `# yours` in the file; the steps below replace them with your own.

**1. Authenticate wrangler** (opens a browser; no API token to store):

```bash
npx wrangler login
```

**2. Provision the database**, from `packages/worker/`:

```bash
npx wrangler d1 create mind-meld-dev
```

Paste the printed `database_id` into `[[env.dev.d1_databases]]`.

**3. Make the config yours.** In `[env.dev.vars]`, set `APP_URL` to your Worker's origin (`https://mind-meld-dev.<your-subdomain>.workers.dev`) and `MAIL_FROM` to your sender. The membership allowlist is deliberately **not** in this file — it goes in as a secret in the next step, so personal addresses never sit in a public repo.

**4. Migrate, set secrets, and deploy**, from the repo root:

```bash
npm install
npm run db:migrate:dev
cd packages/worker
openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET --env dev
echo "you@example.com" | npx wrangler secret put MIND_MELD_ALLOWED_EMAILS --env dev
cd ../..
npm run deploy:dev
```

The URL now serves the app, with signups limited to your allowlist.

**5. Connect the pipeline.** In the Cloudflare dashboard: Workers & Pages → `mind-meld-dev` → Settings → Builds → Connect, choose your repo, then set:

- Branch: `dev`
- Root directory: `/`
- Build command: `npm ci && npm run typecheck && npm test && npm run build`
- Deploy command: `cd packages/worker && npx wrangler d1 migrations apply mind-meld-dev --remote --env dev && npx wrangler deploy --env dev`
- Branch control → Builds for non-production branches: off. Feature branches get CI on GitHub and deploy nowhere; the default non-production command names no environment and would fail anyway.

From here every push to `dev` deploys. Cloudflare builds inside the platform, so no API token is ever copied anywhere; a red typecheck or test fails the build and never deploys; and migrations run before the code that expects them.

### More environments, and promotion between them

Adding an environment is repeating the four things under another name: copy the `[env.dev]` block to `[env.<name>]` with its own Worker name and `APP_URL`, create its database, set its secrets with `--env <name>`, and connect its Worker to its own branch. Nothing is shared between environments — each has its own Durable Objects, database and secrets.

This repo promotes `dev` into `prod`: `[env.prod]` deploys `mind-meld-prod` from `main`, and the npm scripts exist for both (`deploy:prod`, `db:migrate:prod`, and their `dev` counterparts). To set it up, follow the steps above with `prod` in place of `dev` and `main` as the branch.

Promotion is a pull request from one environment's branch into the next, merged with a merge commit so the lower branch stays an ancestor of the higher one and nothing ever needs rebasing. Protect the branch that deploys production — in GitHub, Settings → Rules → Rulesets on `main`: require a pull request, require the CI check to pass, and allow only merge commits. Add a required review for any repo where more than one pair of hands merges; a solo or agent-operated repo can set required approvals to zero and still keep the protection that matters — nothing reaches `main`, and therefore production, by direct push or with failing checks.

The working loop this produces: branch from `dev` and push freely (CI runs, nothing deploys) → merge into `dev` to see the feature live → pull-request `dev` into `main` to release. Feature branches deploy nowhere; they reach an environment only when you deliberately merge them.

### What CI does

`.github/workflows/ci.yml` runs on every push and pull request: typecheck, tests, the client build, and a credential-free `wrangler deploy --dry-run` of every environment. The dry-run exists because each environment block repeats every binding and can break on its own while another environment looks fine — a broken declaration surfaces at commit time instead of at release. Workers Builds runs the same checks in its build command, so GitHub shows the verdict and Cloudflare acts on it: a red check is visible on the branch and never deploys.

### Optional add-ons

Each is independent and skippable, and each is set per environment:

- **Google sign-in**: in Google Cloud Console create an OAuth 2.0 **Web application** client — your origin under "Authorised JavaScript origins", `https://YOUR-DOMAIN/api/auth/callback/google` under "Authorised redirect URIs" — then `wrangler secret put GOOGLE_CLIENT_ID --env <name>` and the same for `GOOGLE_CLIENT_SECRET`. The sign-in button appears on its own: the client asks `/api/config` what the server has configured.
- **Real email** (verification and reset): a [Resend](https://resend.com) API key via `wrangler secret put RESEND_API_KEY --env <name>`; without it, emails are logged by the Worker instead of sent.
- **Play Store app**: see [`packaging/android-twa`](packaging/android-twa/README.md).

### Roughly what it costs

For a team of about ten, this sits inside the free tier: SQLite-backed Durable Objects run on the Workers Free plan, websocket messages bill as requests, and hibernation means idle sockets cost nothing. The $5/month Workers Paid plan buys headroom and removes daily caps. D1, Durable Object storage, static assets and Resend's free tier cover the rest. One-off: Play Console $25, a domain ~$10/year. Check Cloudflare's current pricing before relying on these figures.

## Development

```bash
npm test         # unit tests for both packages
npm run typecheck
npm run build
```

Pull requests target `dev`, the default branch. `main` receives only releases, merged from `dev`.

## Not built yet

- iOS packaging, and any native shell (Capacitor)
- Per-document permissions — every member sees the whole space
- File attachments
- Document history and restore
- Server-side search across documents
