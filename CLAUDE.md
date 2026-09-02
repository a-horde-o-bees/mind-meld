# Mind Meld — project guidance

What must stay true of this repo while the app grows: it is a public, replicable example of one repo running two live Workers — an always-current dev environment and a user-gated prod.

## The README is an executable recipe

README.md's "Deploy your own" section is the replication contract: a stranger — human or agent — with a blank Cloudflare account and an empty GitHub repo follows it top to bottom and ends with the working two-environment pipeline, never reading source or guessing.

- A change touching configuration, environment variables, provisioning, secrets, or the pipeline updates the recipe in the same change.
- The Workers Builds settings exist only as dashboard state; the README's settings table is their single written home.
- The worker suite fails on an `Env` field documented in neither `wrangler.toml` nor `.env.example`; that failure means document the field, never relax the test.
- CI dry-runs the deploy of every environment, because each `[env.<name>]` block repeats every binding and can break on its own while another environment looks fine — the dry-run surfaces a broken declaration at commit time instead of at release.
- Every wrangler command names its environment with `--env`; the config's top level is deliberately not deployable, so a forgotten flag lands on a visibly wrong Worker instead of silently on dev.

## The architecture doc is the current state

`docs/ARCHITECTURE.md` describes the system as built and changes with the code: a change that alters how the system works updates it in the same change. `docs/superpowers/specs/` holds dated decision records that are never edited to match later reality, so nothing points a reader there for current truth.

## Public repo, no personal data

Personal values stay out of every committed file: the membership allowlist rides in per-Worker secrets, and commits carry a GitHub noreply identity, which comes from global git config rather than anything in this repo.

## Environments

`dev` is the default branch: pull requests land there, and it deploys `mind-meld-dev` on push. Protected `main` deploys `mind-meld-prod` and receives only releases — `dev` merged in with a merge commit, only at the user's directive — so `dev` stays an ancestor of `main` and nothing is ever rebased. A hotfix merged straight to `main` is merged back into `dev` at once. Each Worker has its own Durable Objects, D1 database and secrets — nothing is shared between environments.
