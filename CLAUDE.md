# Mind Meld — project guidance

Standing guidance for agents working in this repo. Most of it exists to keep one thing true: the README stays an executable replication recipe while the app keeps changing.

## The README is an executable recipe

README.md's "Deploy your own" section is the project's replication contract: a stranger — human or agent — with a blank Cloudflare account and an empty GitHub repo follows it top to bottom and ends with the working two-environment pipeline, never reading source or guessing. Judge every edit to it against that reader.

- A change that touches configuration, environment variables, provisioning, secrets, or the pipeline updates the recipe in the same change — the recipe describes current reality, never a past or intended state.
- The Workers Builds settings exist only as dashboard state, so the README's settings table is their single written home: changing one means changing the other.
- Two mechanisms back the discipline, and failures there are documentation bugs to fix in the docs, not tests to relax: the worker suite fails when an `Env` field is documented in neither `wrangler.toml` nor `.dev.vars.example`, and CI dry-runs the deploy of both environments.

## Public repo, no personal data

This repo is public. Personal values stay out of every committed file — the membership allowlist rides in per-Worker secrets (`wrangler secret put`), and commits are authored with the repo-local noreply identity, never a personal email.

## Branches and deploys

Work lands on `dev` (directly, or via feature branches merged into it), which deploys `mind-meld-dev` on push. Releasing is a pull request from `dev` into `main`, which is protected — direct pushes are rejected, CI must be green — and deploys `mind-meld-prod`. Each Worker has its own Durable Objects, D1 database and secrets; nothing is shared between environments.
