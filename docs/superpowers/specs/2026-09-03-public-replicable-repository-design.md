# Public, replicable repository — Design

Mind Meld is a public repository that a stranger can take from a fresh clone to a running deployment of their own, with nothing personal in any committed file. This records the decisions that make that hold; the [README](../../../README.md) is the recipe they produce.

- **Date** — 2026-09-03
- **Status** — Implemented. A retroactive record: these decisions were taken and built during the work of 2026-08-28 to 2026-09-03, and are written down here so the prose that followed from them has a source.
- **Scope** — repository visibility and history, committed configuration, `README.md`, the worker test suite, `.github/workflows/ci.yml`

## Goal

The repository stands as a worked example of one repo running live environments on Cloudflare, so it must be readable and reproducible by anyone, and it must expose nothing about the people who run this instance.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Visibility | Public | The point is to be an example. Public visibility also unlocks GitHub rulesets on a personal account, which branch protection needed |
| Personal data | None in any committed file: the membership allowlist is a per-Worker secret, commits carry the account's GitHub noreply identity, and GitHub's email privacy settings are on so merge-button commits carry it too | A public repo's history is permanent and copied. The allowlist and the commit identity were the two places a personal address had lived |
| History | Rewritten to a single root commit before going public, and the repository recreated afterwards so unreachable objects and a merge commit that had leaked the real identity were gone too | GitHub serves unreachable commits by SHA until its own garbage collection; only a fresh repository is free of them |
| The README's deploy section | An executable recipe: literal commands from a blank Cloudflare account and an empty GitHub repo to a working pipeline, no placeholders the reader must interpret | A stranger who has to read source or guess has not been given a recipe |
| Deployment-specific values | Committed in `wrangler.toml`, marked `# yours`, and replaced by the cloner; secrets are never in the file | Wrangler has no template layer and the pipeline builds from the committed file, so the real config must be the committed one. Database ids and public URLs are not secrets; marking them makes the boundary visible |
| Configuration contract | The worker suite fails on any `Env` field documented in neither `wrangler.toml` nor `.env.example` | A variable the Worker reads but no template names is one a fresh clone can only discover from source |
| Broken environment declarations | CI dry-runs the deploy of every environment on every push, without credentials | Each environment block repeats every binding and can break alone while another looks fine; the dry-run moves that failure from release time to commit time |

## Consequences for prose

- `README.md` carries the recipe and the configuration table, and says which values are this deployment's.
- The Workers Builds settings exist only as dashboard state, so the README's settings list is their single written home.
- Project guidance holds the rules that keep these decisions true as the app grows: a change touching configuration, provisioning, secrets or the pipeline updates the recipe in the same change.

## Out of scope

- Detecting or purging personal data that a contributor introduces later. The identity settings and the allowlist-as-secret pattern prevent the two known sources; nothing scans for others.
