# Mind Meld — project guidance

What must stay true of this repo while the app grows: it is a public, replicable example of one repo running two live Workers — an always-current dev environment and a user-gated prod.

## The README is an executable recipe

README.md's "Deploy your own" section is the replication contract: a stranger — human or agent — with a blank Cloudflare account and an empty GitHub repo follows it top to bottom and ends with the working two-environment pipeline, never reading source or guessing.

- A change touching configuration, environment variables, provisioning, secrets, or the pipeline updates the recipe in the same change.
- The Workers Builds settings exist only as dashboard state; the README's settings table is their single written home.
- The worker suite fails on an `Env` field documented in neither `wrangler.toml` nor `.dev.vars.example`; that failure means document the field, never relax the test.
- CI dry-runs the deploy of both environments, because `[env.production]` duplicates every binding and can break independently while the live dev worker looks fine — the dry-run surfaces a broken production declaration at commit time instead of at release.

## Public repo, no personal data

Personal values stay out of every committed file: the membership allowlist rides in per-Worker secrets, and commits use the repo-local noreply identity.

## Environments

`dev` deploys `mind-meld-dev` on push; protected `main` deploys `mind-meld-prod`. Merging `dev` into `main` is a production release, done only at the user's directive. Each Worker has its own Durable Objects, D1 database and secrets — nothing is shared between environments.
