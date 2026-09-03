# Environments and promotion — Design

How this repository runs more than one live Worker from one configuration, how a change travels between them, and how the machines involved authenticate. The [README](../../../README.md) turns this into a recipe; the [architecture doc](../../ARCHITECTURE.md) describes the running system.

- **Date** — 2026-09-03
- **Status** — Implemented. A retroactive record of decisions taken and built between 2026-08-28 and 2026-09-03.
- **Scope** — `packages/worker/wrangler.toml`, npm scripts, `.github/workflows/ci.yml`, GitHub branch rules, Cloudflare Workers Builds settings, local credential handling

## Goal

Live users are isolated from development, a change reaches production only by a deliberate step, and nothing about deploying depends on a credential held on a developer's machine.

## Decisions

| Question | Decision | Why |
|---|---|---|
| How many environments | Two here, `dev` and `prod`, each its own Worker with its own Durable Objects, D1 database and secrets; the pattern admits any number | Isolation is only real when nothing is shared. The recipe describes one environment and how to add another, without dictating how many |
| How an environment is declared | A named `[env.<name>]` block carrying its full bindings; the top level of `wrangler.toml` holds only shared keys and is deliberately not deployable | Every command names its environment with `--env`, and a forgotten flag lands on a visibly wrong Worker instead of silently on dev. Bindings are not inherited, so each block is complete |
| Environment names | `dev` and `prod`, matching the Worker suffixes | Flag, block and Worker name agree; `production` had matched neither |
| Local secrets | A `.env` file, from the committed `.env.example`; per-environment files are never needed | Wrangler supports `.env` as an equal to `.dev.vars`, and the name no longer collides with an environment called `dev`. Deployed environments get secrets through `wrangler secret put --env` |
| Which branch deploys where | `dev` is the default branch and deploys `mind-meld-dev` on push; `main` deploys `mind-meld-prod`; feature branches deploy nowhere | Pull requests, clones and the compare view default to `dev`, so contributions land on the integration branch without instruction |
| Promotion | A pull request from `dev` into `main`, merged with a merge commit and only at the user's directive | A merge commit keeps `dev` an ancestor of `main`, so nothing is ever rebased and the next release contains exactly the commits since the last. Squash and rebase merges would diverge the branches on every release |
| Protection on `main` | A GitHub ruleset pinned to `refs/heads/main`: no deletion, no force-push, pull request required, the CI check required, merge commits only, zero required approvals | Nothing reaches production by direct push or with failing checks; zero approvals lets a solo or agent-operated repo still merge. Pinning by name rather than "default branch" is what let `dev` become the default without moving the protection |
| Hotfixes | A pull request straight into `main`, followed at once by merging `main` back into `dev` | The one case where `main` receives something `dev` lacked; the back-merge restores the ancestry |
| Deploys | Cloudflare Workers Builds, one connection per Worker, each watching its branch, with the typecheck, tests and client build in the build command and migrations applied before the deploy | Cloudflare builds and deploys inside the platform with a token it mints itself, so no API token is ever copied anywhere, and a red build never deploys |
| Preview builds | Off on every Worker | Feature branches get their verdict from CI on GitHub; the default preview command names no environment; preview URLs do not exist for Workers with Durable Objects |
| Continuous integration | GitHub Actions on every push and pull request: typecheck, tests, client build, and a credential-free dry-run deploy of every environment | The visible gate on every branch, and the required check on `main` |
| Developer and agent authentication | Wrangler's own OAuth login; no Cloudflare API token is held on the machine or in the vault | A raw token was only ever needed to mirror credentials into GitHub Actions, which Workers Builds made unnecessary. An exported `CLOUDFLARE_API_TOKEN` silently overrides the login, so no project exports one |
| Migration to this layout | Fresh Workers and databases created, production data migrated by D1 export and import, the original single Worker decommissioned | A clean cut over a rename; the URL change was accepted |

## Consequences for prose

- The README's deploy section walks through one environment, then describes adding another and promoting between them, then what CI does.
- Project guidance states the branch model and the explicit-environment rule so they survive the README being edited.

## Out of scope

- A staging environment. The pattern admits one; the recipe does not prescribe it.
- Automated promotion. Releases are a human directive by design.
