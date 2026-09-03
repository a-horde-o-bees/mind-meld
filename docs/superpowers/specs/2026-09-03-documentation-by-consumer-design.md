# Documentation by consumer — Design

Which document serves which reader, so information is written once in the place its reader opens. The [README](../../../README.md), the [architecture doc](../../ARCHITECTURE.md) and this folder are the three surfaces it defines.

- **Date** — 2026-09-03
- **Status** — Implemented. A retroactive record of decisions taken and built on 2026-09-02 and 2026-09-03.
- **Scope** — `README.md`, `docs/ARCHITECTURE.md`, `docs/superpowers/specs/`, project guidance

## Goal

Three readers arrive with different questions, and each finds one document that answers theirs without mirroring another.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Who the README serves | Someone cloning to run their own copy or to contribute: what the product is in a paragraph and a feature list, setup, configuration, deployment, and where pull requests go | GitHub renders it first, and the cloner is the reader most likely to arrive cold |
| Where "how it works" lives | `docs/ARCHITECTURE.md`, one mutable file describing the system as built, changed in the same change as the code | A reader of the system needs the current shape in one place. A timeline of dated files cannot say which one the code follows |
| What the dated specs are | Immutable records of decisions at their date; never edited to match later reality, and never the place a reader is sent for current truth | A record that is edited stops being a record. The August spec was edited three times before this rule existed; it stays as it now stands |
| What the README says about the system | Pointers to the architecture doc and the specs folder, and only the facts a deployer needs about accounts and mail | Restating the architecture in the README produced two copies that drifted |
| Terms of art | PWA and Trusted Web Activity are linked to their canonical documentation rather than explained | Both are industry terms; the owners' docs say what they are better than a paragraph here |
| Claims about reach | The README states what has been observed; an untested platform is not listed as supported | The iOS "Add to Home Screen" claim was removed because no one had tried it |
| A user guide | Not yet | The product's users are the people invited to it, and none has asked. A guide gets its own surface when there is a reader for it |
| Agent access to the architecture doc | Project guidance points at it and states the keep-current rule | Guidance is loaded automatically, which turns a hop an agent might skip into one the harness performs |

## Consequences for prose

- Every change to the repository takes the brainstorming skill's architectural path and yields a dated spec here, so a README adjustment traces to a decision rather than the reverse.
- `docs/ARCHITECTURE.md` gains the "why" of a change only where the current shape needs it; the reasoning stays in the spec.

## Out of scope

- Screenshots and a features walkthrough. They belong to the user guide, when it exists.
