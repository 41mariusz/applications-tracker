# AI Code Review of Pull Requests in GitHub Actions Implementation Plan

## Overview

Run the code-review agent from `tools/code-reviewer` on every pull request to `main` (course lesson M5L3). A local composite action builds the agent from the PR's code and runs it; the workflow posts the summary as a PR comment, sets `ai-cr:passed` / `ai-cr:failed`, re-runs on the `ai-cr:review` label, and its job `AI code review` fails on a `fail` verdict so a GitHub ruleset can make it a merge gate. The agent's own typecheck, tests and build join `ci.yml`.

## Current State Analysis

- The agent exists (change `tool-loop-agent`): `tools/code-reviewer/src/index.ts` reads `DIFF_FILE`, `PR_TITLE`, `PR_BODY`, `REVIEW_MODEL`, requires `OPENROUTER_API_KEY` (exit 2 when missing), prints only the review JSON, exits 0 on any verdict / 1 on a failed review / 2 on a usage error. No `build` script; `.gitignore:2` ignores every `dist/`.
- Nothing in CI installs, tests or builds `tools/code-reviewer` (excluded in `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`).
- `.github/` holds only `workflows/ci.yml` (jobs `ci`, `smoke`, `deploy`) and `workflows/health.yml`. Conventions: untrusted values only through `env:` (`ci.yml:88`), minimal `permissions` (`health.yml:10`; `ci.yml` has none), actions referenced by moving tags `@v4`, Node 22.
- The repo is public, default branch `main`; the owner and the agent push straight to `main` (`context/foundation/infrastructure.md:79`); 2 PRs in history.
- Full evidence: `context/changes/ci-cd-code-review/research.md`.

## Desired End State

- On a PR to `main` from this repository: one review per push (newer pushes cancel older reviews), a PR comment `## AI Code Review: <verdict>` with the Polish summary, exactly one of `ai-cr:passed` / `ai-cr:failed`, and the check `AI code review` green on `pass`, red on `fail`.
- Red, with a clear `::error::` and no comment/labels, when the review cannot produce a verdict: missing key (fork or Dependabot PR), API failure, invalid output.
- Adding any other label never cancels a review and never turns the check green without a verdict; adding `ai-cr:review` re-runs the review and removes that label.
- `ci.yml` job `code-reviewer` typechecks, tests and builds the agent on every push/PR to `main`; `deploy` does not depend on it.
- A ruleset on `main` requires `AI code review`; the owner (admin) is on the bypass list, so direct pushes keep working.
- `CLAUDE.md` documents the workflow, the secret, the variable and the ruleset.

Verify: actionlint clean; a throwaway PR shows the comment, label and check for a `pass` and a `fail` diff, an unrelated label, and `ai-cr:review`.

### Key Discoveries:

- Template workflow and action: `.claude/config-templates/m5l3-review.yml.template:8-67`, `m5l3-action.yml.template:9-60`.
- The esbuild ESM bundle needs `--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);` or it crashes on `Dynamic require of "path"` (`@vercel/oidc`); with it the 1.6 MB bundle runs standalone (`research.md`, "Packaging the reviewer").
- `concurrency` is applied before job `if:` — with `cancel-in-progress: true` keyed only by PR number, any `labeled` event cancels a running review (`research.md`, "Concurrency").
- A job skipped by `if:` reports success for a required check (GitHub docs, troubleshooting required status checks) — so no path of this workflow may skip the job to mean "nothing to say".
- Fork and Dependabot PRs get no repository secrets and a read-only token (GitHub docs, events that trigger workflows).
- Events caused by `GITHUB_TOKEN` (the workflow's own label edits) do not start new runs; labels added by a human do.
- Pinned SHAs verified: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1), `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1` (v7.1.0).

## What We're NOT Doing

- No `pull_request_target`; no review of PRs from forks or Dependabot (they fail red with an explanation; the owner bypasses deliberately).
- No committed `dist/` and no separate ai-reviewer repository (the lesson's cross-repo variant).
- No tools for the agent, no promptfoo (change `code-review-evals`), no change to the agent's prompts or schema.
- No sticky/edited comment: each review adds a new comment, as in the template.
- No change to `ci`, `smoke`, `deploy` or their triggers; no `permissions` retrofit for the existing `ci.yml` jobs.
- No ruleset without bypass and no "require a pull request" rule — direct pushes to `main` stay allowed.
- No diff-size cap.

## Implementation Approach

Build first, so the bundle is proven in CI before any PR depends on it. Then adapt the two lesson templates with the research's fixes: the action owns building and running the agent (and the missing-key error); the workflow owns event routing, labels, comment and the gate. Every non-review event resolves to an explicit green/red from existing verdict labels, never to a skipped job. Finally the owner configures GitHub and the behaviour is proven on throwaway PRs.

## Critical Implementation Details

- **Label replay must not trust stale labels.** Before a real review starts, remove `ai-cr:passed` and `ai-cr:failed`; set the new one only after a verdict. Then a replay (unrelated label event) reads labels that describe the current head or none at all — none means red.
- **Concurrency group must separate replays.** Review events (opened, synchronize, reopened, `ai-cr:review`) share `ai-review-<PR>` with cancel-in-progress; replay events use a group unique to the run (`run_id`), so they neither cancel nor get cancelled.
- **Replay reads labels from the event payload** (`github.event.pull_request.labels`, passed through `env:` as JSON), not via an API call, so it needs no extra permission and reflects the state at the event.

## Phase 1: Agent build and CI job

### Overview

Give the agent a reproducible single-file build and check typecheck, tests and the built bundle in `ci.yml`.

### Changes Required:

#### 1. Build script

**File**: `tools/code-reviewer/package.json`

**Intent**: Bundle the CLI into one standalone ESM file the action can run with plain `node`, without `node_modules`.

**Contract**: devDependency `esbuild` pinned to the version already in the tree (0.28.2, already allow-listed in `allowScripts`); script `build` = esbuild of `src/index.ts`, `--bundle --platform=node --format=esm --target=node22`, the `createRequire` banner, output path from `--outfile` overridable (default `dist/review.js`, ignored by `.gitignore:2`).

#### 2. CI job

**File**: `.github/workflows/ci.yml`

**Intent**: Catch a broken agent on every push/PR to `main`, before a review depends on it, without touching deploy.

**Contract**: new job `code-reviewer` (job-level `permissions: contents: read`), following the file's existing style (`actions/checkout@v4`, `actions/setup-node@v4`, Node 22, npm cache keyed on `tools/code-reviewer/package-lock.json`); steps in `tools/code-reviewer`: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, then run the bundle with an empty diff and assert exit code 2 (proves it starts without `node_modules`). Not added to `deploy.needs`.

### Success Criteria:

#### Automated Verification:

- Build produces a runnable bundle: `cd tools/code-reviewer && npm run build && echo "" | OPENROUTER_API_KEY=x node dist/review.js` exits 2 with the usage line
- Agent checks pass: `cd tools/code-reviewer && npm run typecheck && npm test`
- Workflow lint passes: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:1.7.12`
- App checks unaffected: `npm run lint` at the repo root passes

#### Manual Verification:

- After push, the `code-reviewer` job is green on GitHub and `deploy` ran without waiting for it

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Composite action and review workflow

### Overview

Adapt the lesson templates into a local action that builds and runs the agent, and a workflow whose every path ends in an explicit verdict.

### Changes Required:

#### 1. Composite action

**File**: `.github/actions/ai-reviewer/action.yml`

**Intent**: Build the agent from the checked-out code and run it on the diff; fail clearly when there is no key instead of reaching the agent.

**Contract**: from `m5l3-action.yml.template` with these deltas:

- inputs `api-key` (required: false, so the missing-key path reaches our own error), `pr-title`, `pr-body`, `diff-file`, `model` (default empty → agent's `DEFAULT_MODEL`), `reviewer-dir` (default `tools/code-reviewer`, relative to the workspace); outputs `verdict`, `review-file` unchanged;
- `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0` with Node 22;
- a key check step: empty `api-key` → `::error::` "No OPENROUTER_API_KEY: PR from a fork or Dependabot gets no secrets — review it manually" and exit 1;
- build step: `npm ci` and `npm run build -- --outfile="$RUNNER_TEMP/ai-reviewer/review.js"` in `reviewer-dir`;
- run step: env `OPENROUTER_API_KEY`, `PR_TITLE`, `PR_BODY`, `DIFF_FILE`, `REVIEW_MODEL` (all through `env:`), stdout to `$RUNNER_TEMP/ai-review.json`, verdict validated as `pass|fail` before writing outputs (template :54-58).

#### 2. Review workflow

**File**: `.github/workflows/review.yml`

**Intent**: Route PR events to a review or a verdict replay, publish the result, and gate on it — with no path that skips the job.

**Contract**: from `m5l3-review.yml.template` with these deltas:

- `on.pull_request.branches: [main]`, types `opened, synchronize, reopened, labeled`; `permissions` as template; no job-level `if:`;
- job id `review`, `name: AI code review` (the required check name — keep stable);
- concurrency: group `ai-review-<PR>-review` for review events and `ai-review-<PR>-<run_id>` for replay events (labeled with a label other than `ai-cr:review`); `cancel-in-progress: true`;
- mode step: replay when the event is `labeled` and the label is not `ai-cr:review`; otherwise review;
- replay path: read `github.event.pull_request.labels` (JSON through `env:`), exit 0 if `ai-cr:passed` is present, else `::error::` "No AI review verdict for this commit yet — push or add ai-cr:review" and exit 1; no model call, no comment, no label edits;
- review path: checkout with `fetch-depth: 0`; remove `ai-cr:passed` / `ai-cr:failed` (ignore "not present"); diff `origin/main...HEAD` into `$RUNNER_TEMP/pr.diff`; run `./.github/actions/ai-reviewer` with `api-key: ${{ secrets.OPENROUTER_API_KEY }}`, `model: ${{ vars.REVIEW_MODEL }}`; on a verdict: comment via `--body-file`, `gh label create --force` for both labels, add the matching one, remove `ai-cr:review`; gate step exits 1 unless `verdict == pass`;
- all PR text and outputs reach `run:` scripts only through `env:`; `GH_TOKEN: ${{ github.token }}` on steps that call `gh`.

### Success Criteria:

#### Automated Verification:

- Workflow lint passes: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:1.7.12`
- No `${{ github.event.pull_request.title }}`, `.body` or `.labels` appears inside a `run:` block: `grep -n` over both files returns nothing
- Replay decision logic is correct for: `ai-cr:passed` present → 0; `ai-cr:failed` present → 1; no verdict label → 1 (the step's script run locally with sample JSON)
- Agent and app checks still pass: `cd tools/code-reviewer && npm test` and `npm run lint` at the repo root

#### Manual Verification:

- Read-through of `review.yml` against the Desired End State: every event type ends in an explicit exit 0/1, none skips the job

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: GitHub setup, live verification and docs

### Overview

The owner configures GitHub, the workflow is proven on throwaway PRs, and the setup is documented.

### Changes Required:

#### 1. GitHub configuration (owner, in the GitHub UI — no repo change)

**Intent**: Provide the key, the model and the merge gate.

**Contract**:

- Repository secret `OPENROUTER_API_KEY` (Settings → Secrets and variables → Actions → Secrets).
- Repository variable `REVIEW_MODEL` = `nvidia/nemotron-3-super-120b-a12b:free` (… → Variables).
- Ruleset on `main` (Settings → Rules → Rulesets): target the default branch, rule "Require status checks to pass" with `AI code review` (source GitHub Actions), bypass list: Repository admin. Enable only after the first successful review run, so the check name exists.

#### 2. Documentation

**File**: `CLAUDE.md`

**Intent**: Record the new workflow and its operating rules next to the existing CI description.

**Contract**: in `## CI`: `review.yml` (job `AI code review` on PRs to `main`, composite action `.github/actions/ai-reviewer`, labels and replay rule, red for forks/Dependabot), the `code-reviewer` job in `ci.yml`, secret `OPENROUTER_API_KEY`, variable `REVIEW_MODEL`, the ruleset with admin bypass and that direct pushes are not gated. In `## Hard rules` env-var line: `OPENROUTER_API_KEY` lives only in `tools/code-reviewer/.env` locally and in GitHub secrets — the app never reads it.

### Success Criteria:

#### Automated Verification:

- Docs mention the workflow and secret: `grep -n "review.yml\|OPENROUTER_API_KEY\|AI code review" CLAUDE.md` finds the new lines
- App checks pass: `npm run lint` at the repo root

#### Manual Verification:

- Secret `OPENROUTER_API_KEY` and variable `REVIEW_MODEL` exist in the repository settings
- Throwaway PR with a small correct change: comment with a Polish summary, label `ai-cr:passed`, check `AI code review` green
- Throwaway PR (or new push) with an obviously flawed change: label `ai-cr:failed`, check red
- Adding an unrelated label to the failed PR: the check stays red and no review was cancelled
- Adding `ai-cr:review`: a new review runs, a new comment appears, `ai-cr:review` is removed
- Ruleset active: the failed PR shows merge blocked for non-bypass merge (bypass offered to the admin); a direct push to `main` still works

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None new in TypeScript: the agent's behaviour is covered by `tool-loop-agent`'s tests, now run in CI (`code-reviewer` job).

### Integration Tests:

- `code-reviewer` CI job runs the built bundle (empty diff → exit 2), proving the bundle starts standalone.
- Replay decision script exercised locally with sample label JSON (Phase 2).

### Manual Testing Steps:

1. Open a PR with a harmless change → `pass` path (comment, `ai-cr:passed`, green).
2. Push a deliberately flawed change (e.g. SQL string concatenation from user input) → `fail` path (red, `ai-cr:failed`).
3. Add label `test` → check stays red; no cancelled run in the Actions tab.
4. Add `ai-cr:review` → new review, label removed.
5. Close the throwaway PRs and delete their branches.

## Performance Considerations

Each review adds `npm ci` in `tools/code-reviewer` (~10-20 s) and one model call; replays take seconds (no checkout, no model). The free model is rate-limited; a 429 ends red and is retried with `ai-cr:review`.

## References

- Requirements: `context/changes/ci-cd-code-review/requirements.md`
- Research: `context/changes/ci-cd-code-review/research.md`
- Templates: `.claude/config-templates/m5l3-review.yml.template`, `.claude/config-templates/m5l3-action.yml.template`
- Agent contract: `context/changes/tool-loop-agent/plan.md`, `tools/code-reviewer/src/index.ts`
- Lesson prompt: `.claude/prompts/m5l3-cicd.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Agent build and CI job

#### Automated

- [x] 1.1 Build produces a runnable bundle: `npm run build` then the bundle exits 2 on an empty diff — 4106bfc
- [x] 1.2 Agent checks pass: `npm run typecheck && npm test` in `tools/code-reviewer` — 4106bfc
- [x] 1.3 Workflow lint passes: actionlint 1.7.12 via docker — 4106bfc
- [x] 1.4 App checks unaffected: `npm run lint` at the repo root passes — 4106bfc

#### Manual

- [x] 1.5 After push, the `code-reviewer` job is green on GitHub and `deploy` ran without waiting for it — 4106bfc

### Phase 2: Composite action and review workflow

#### Automated

- [x] 2.1 Workflow lint passes: actionlint 1.7.12 via docker — 05f1f13
- [x] 2.2 No PR title, body or labels expression inside a `run:` block — 05f1f13
- [x] 2.3 Replay decision logic is correct for passed / failed / no verdict label — 05f1f13
- [x] 2.4 Agent and app checks still pass: `npm test` in `tools/code-reviewer` and `npm run lint` at the repo root — 05f1f13

#### Manual

- [x] 2.5 Read-through of `review.yml`: every event type ends in an explicit exit 0/1, none skips the job — 05f1f13

### Phase 3: GitHub setup, live verification and docs

#### Automated

- [x] 3.1 Docs mention the workflow and secret in `CLAUDE.md` — bc03a13
- [x] 3.2 App checks pass: `npm run lint` at the repo root — bc03a13

#### Manual

- [x] 3.3 Secret `OPENROUTER_API_KEY` and variable `REVIEW_MODEL` exist in the repository settings — bc03a13
- [x] 3.4 Throwaway PR with a small correct change: comment, `ai-cr:passed`, check green — bc03a13
- [x] 3.5 Throwaway PR with an obviously flawed change: `ai-cr:failed`, check red — bc03a13
- [x] 3.6 Adding an unrelated label to the failed PR keeps the check red and cancels nothing — bc03a13
- [x] 3.7 Adding `ai-cr:review` runs a new review and removes the label — bc03a13
- [x] 3.8 Ruleset active: failed PR blocked for non-bypass merge; direct push to `main` still works — bc03a13
