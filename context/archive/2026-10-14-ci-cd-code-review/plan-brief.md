# AI Code Review of Pull Requests in GitHub Actions — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`

## What & Why

Course lesson M5L3: move the code-review agent from localhost onto the path to production. Every pull request to `main` gets an AI review with a comment and a verdict label, and a `fail` verdict blocks the merge — a Definition of Done enforced by CI rather than by memory.

## Starting Point

The agent works locally (`tools/code-reviewer`, change `tool-loop-agent`) and already speaks the action's input contract (`DIFF_FILE`, `PR_TITLE`, `PR_BODY`, `REVIEW_MODEL`, pure-JSON stdout, exit 0/1/2). Nothing in CI builds or tests it, there is no `dist/`, and the lesson's templates assume `master`, a different key name, Node 24 and a committed build.

## Desired End State

A PR to `main` shows a Polish review comment, `ai-cr:passed` or `ai-cr:failed`, and a check `AI code review` that is green only with a `pass` verdict for the current commit. Unrelated labels never cancel a review or turn the gate green; `ai-cr:review` re-runs it. A ruleset requires the check, with the owner able to bypass deliberately; direct pushes to `main` keep working. `ci.yml` tests and builds the agent.

## Key Decisions Made

| Decision              | Choice                                                                                                        | Why (1 sentence)                                                                     | Source          |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------- |
| Agent build           | Built inside the action (`npm ci` + esbuild to `$RUNNER_TEMP`), nothing committed                             | The bundle always matches the PR's code and `.gitignore` stays as is.                | Plan            |
| Model in CI           | Repo variable `REVIEW_MODEL`, starting with the free `nemotron-3-super-120b-a12b:free`                        | Zero cost and switchable without a commit; tested in this session.                   | Plan            |
| Fork / Dependabot PRs | Red check with an explanation, no comment or labels                                                           | A skipped job would count as a passing required check.                               | Research + Plan |
| `ai-cr:review` re-run | Label trigger kept; other labels replay the verdict from labels in their own concurrency group, no model call | Meets the lesson requirement without the template's cancel and false-green pitfalls. | Research + Plan |
| Stale labels          | Verdict labels removed before each review                                                                     | A replay can never pass a commit nobody reviewed.                                    | Plan            |
| Merge gate            | Ruleset requiring `AI code review`, admin on the bypass list                                                  | Blocks accidental merges of `fail`, keeps direct pushes before the 4.11 deadline.    | Plan            |
| Agent tests in CI     | New `code-reviewer` job in `ci.yml`, not a deploy dependency                                                  | A broken agent shows up before a PR depends on it.                                   | Plan            |
| Key name              | Secret `OPENROUTER_API_KEY`, passed to the agent under the same name                                          | No mapping layer; the provider reads that name.                                      | Plan            |
| Pins / Node           | Template SHAs (verified), Node 22                                                                             | Matches repo CI and the agent's `engines`.                                           | Research        |

## Scope

**In scope:**

- `build` script + esbuild devDependency; `code-reviewer` job in `ci.yml`
- `.github/actions/ai-reviewer/action.yml`, `.github/workflows/review.yml`
- Owner's GitHub setup (secret, variable, ruleset) and throwaway-PR verification
- `CLAUDE.md` CI documentation

**Out of scope:**

- `pull_request_target`, reviews of fork/Dependabot PRs
- Committed `dist/`, separate action repository
- Agent tools, promptfoo, prompt/schema changes
- Changes to `ci` / `smoke` / `deploy`; gating direct pushes

## Architecture / Approach

`review.yml` (job `AI code review`) → mode: **review** (opened / synchronize / reopened / `ai-cr:review`) or **replay** (any other label). Review: drop verdict labels → diff `origin/main...HEAD` → `.github/actions/ai-reviewer` (key check → `npm ci` + esbuild → `node review.js` → `verdict`, `review-file`) → comment + label → gate. Replay: read labels from the event → green only with `ai-cr:passed`.

## Phases at a Glance

| Phase                                       | What it delivers                                         | Key risk                                                          |
| ------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Agent build and CI job                   | Standalone bundle, agent checked on every push           | esbuild/CJS quirks in CI (already reproduced and fixed locally)   |
| 2. Composite action and review workflow     | Event routing, labels, comment, gate                     | Concurrency/replay logic only fully provable on real PRs          |
| 3. GitHub setup, live verification and docs | Secret, variable, ruleset; pass/fail/label/re-run proven | Free-model rate limits; ruleset must reference the exact job name |

**Prerequisites:** OpenRouter key (have it); owner access to repository settings; pushing to `main` for the CI job (owner's call).
**Estimated effort:** ~1-2 sessions across 3 phases, most of Phase 3 is clicking and waiting for runs.

## Open Risks & Assumptions

- Replay and supersede behaviour of check runs on the same commit is inferred from docs; Phase 3 tests it before relying on it.
- The gate guards against mistakes, not a malicious PR: `pull_request` runs the PR's own workflow and agent code.
- Direct pushes to `main` (owner, agent) are not gated by design.

## Success Criteria (Summary)

- A PR's merge button reflects the AI verdict for its current commit.
- Labels other than `ai-cr:review` never change the outcome or cancel a review.
- The agent is typechecked, tested and built on every push to `main`.
