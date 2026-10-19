# OpenRouter Credits Pre-flight — Plan Brief

> Full plan: `context/changes/openrouter-credits-preflight/plan.md`

## What & Why

An empty OpenRouter balance showed up only as a bare 402 after the model call: three eval runs failed on 2026-10-14, and the CI review would fail the same way, as an `API error`. A cheap pre-flight of two GET requests stops the run early with a clear "no credits" message. This is the M5L1 opportunity map's first candidate and the M5L5 exercise: planned here, then implemented unattended by `/10x-goal-implement` in a git worktree inside tmux.

## Starting Point

The review CLI `tools/code-reviewer/src/index.ts` is the single choke point: the CI action runs its bundle and the evals use the same key. Nothing checks the balance today. The CI job `code-reviewer` expects exit 2 from the bundle on an empty diff.

## Desired End State

- Every review, local or CI, prints one pre-flight line and stops on "no credits". `:free` models are skipped.
- `npm run preflight` checks on its own.
- `npm run eval` checks first, forced on.
- An unreachable credits API only warns.

## Key Decisions Made

| Decision                    | Choice                                                                                  | Why (1 sentence)                                                                   | Source |
| --------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| Task                        | Credits pre-flight                                                                      | First candidate of the M5L1 map; small and safe for an unattended run              | Owner  |
| Run place                   | git worktree + tmux on this box, `claude -p`                                            | SSH/tmux archetype; `main` is untouched until the owner merges                     | Owner  |
| API unreachable / 401 / 5xx | Warn and continue                                                                       | A diagnosis aid must never block a review that could succeed                       | Owner  |
| Free models                 | Skipped (`:free`), forced on with `--require-credits`                                   | They work without credits; the evals use paid models                               | Plan   |
| Where                       | Inside the CLI after input validation                                                   | Covers CI and local use without touching the action; keeps the exit-2 bundle check | Plan   |
| Shape                       | Pure `assessCredits` + `checkCredits` with an injectable `fetch`, discriminated verdict | Testable without network; matches the conventions (zod, unions)                    | Plan   |

## Scope

**In scope:**

- `src/credits.ts` + tests
- Wiring in `src/index.ts`
- `src/preflight.ts` + `npm run preflight`
- Evals script prefix
- Evals README and one CLAUDE.md sentence

**Out of scope:**

- Changes to the action or workflows
- Alerts, cost tracking, thresholds
- App, toolkit and database
- Ever printing the key

## Phases at a Glance

| Phase                               | What it delivers                               | Key risk                                                                  |
| ----------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| 1. Credits rule + client with tests | `credits.ts` and 10 no-network tests           | Leaking the key in a message; guarded by a test                           |
| 2. Wiring + docs                    | CLI check, `preflight` CLI, evals prefix, docs | Breaking the CI exit-2 check; the order is pinned in the plan and checked |

**Prerequisites:**

- The worktree has `npm ci` at the root (hooks, lint-staged) and in `tools/code-reviewer`.
- Network access to openrouter.ai for gate 2.3, which needs no key.

**Estimated effort:** one unattended run, then a short review by the owner.

## Open Risks & Assumptions

- OpenRouter's response shapes are as observed on 2026-10-14. A change surfaces as `unknown` (a warning), not as a false block.
- The unattended agent runs with `acceptEdits` and the listed tools in the worktree only, never on `main`.

## Success Criteria (Summary)

- A review with no credits fails in seconds with "no credits", not an `API error`.
- The CI bundle check and every existing test stay green.
- The owner can see the balance with one command.
