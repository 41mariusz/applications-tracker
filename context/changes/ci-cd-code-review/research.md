---
date: 2026-10-14T09:38:30Z
researcher: Claude (Opus 5.5) with Mariusz Michalak
git_commit: 907738e
branch: main
repository: 41mariusz/applications-tracker
topic: "Running the tools/code-reviewer agent on every PR to main via GitHub Actions (M5L3 requirements)"
tags: [research, ci, github-actions, code-review, tools-code-reviewer, composite-action]
status: complete
last_updated: 2026-10-14
last_updated_by: Claude (Opus 5.5)
---

# Research: AI code review of pull requests in GitHub Actions

**Date**: 2026-10-14T09:38:30Z
**Researcher**: Claude (Opus 5.5) with Mariusz Michalak
**Git Commit**: 907738e
**Branch**: main
**Repository**: 41mariusz/applications-tracker

## Research Question

Based on `context/changes/ci-cd-code-review/requirements.md`: what does the repository and the GitHub platform imply for a workflow that runs the review agent from `tools/code-reviewer` on every pull request to `main` through a composite action, posts a summary comment, sets `ai-cr:passed` / `ai-cr:failed` labels, re-runs on the `ai-cr:review` label, and gates merge on the binding `verdict` — starting from `.claude/config-templates/m5l3-review.yml.template` and `m5l3-action.yml.template`?

## Summary

- **The templates fit with five concrete adaptations**: branch `master` → `main` (`m5l3-review.yml.template:10`); key name `LLM_PROVIDER_API_KEY` (template) vs `OPENROUTER_API_KEY` (agent, read by `@openrouter/ai-sdk-provider`); `dist/review.js` does not exist yet and the root `.gitignore:2` ignores every `dist/`; Node 24 in the action (`m5l3-action.yml.template:39-41`) vs Node 22 in this repo's CI (`ci.yml:16`) and the package's `engines` `>=22`; default model `z-ai/glm-5.3` in the action (`m5l3-action.yml.template:26`) vs `deepseek/deepseek-v4.1-flash` in the agent (`tools/code-reviewer/src/agent.ts`, `DEFAULT_MODEL`).
- **The agent bundles into one runnable file**: an esbuild ESM bundle of `tools/code-reviewer/src/index.ts` (esbuild 0.28.2, already installed via tsx) is 1,590,612 bytes, needs no `node_modules`, and keeps the CLI's exit codes (2 on empty diff, 1 with one line `Review failed (HTTP 401)` on a bad key) — but only with a `createRequire` banner; without it the bundle crashes on `Dynamic require of "path"` from `@vercel/oidc` (verified locally, bundle written to the scratchpad, not the repo).
- **Two template behaviours are unsafe as written** (platform facts, primary sources below): `concurrency.cancel-in-progress: true` keyed by PR number lets a `labeled` event for _any_ label cancel a running review (concurrency is applied before the job `if:`); and a job skipped by `if:` reports **success** for a required check, so a later unrelated label event may turn a failed gate green (inferred, to be confirmed on a throwaway PR).
- **Fork and Dependabot PRs get no repository secrets and a read-only token**: the review cannot run there and `gh pr comment` / label edits fail with 403. The repo is public (GitHub API, `private: false`, default branch `main`), so fork PRs are possible.
- **Branch protection / rulesets with a required status check are available** on a free public repo; the required check is matched by the **job** name. The owner is admin and can bypass unless "Do not allow bypassing" is set.
- **Trust model**: `pull_request` runs the PR's own version of the workflow, the composite action and the reviewer code. A PR can therefore change the gate itself; the gate guards against honest mistakes, not against a malicious PR author with push access (only the owner has it here). `pull_request_target` must not be used: it would hand secrets to PR code; `actions/checkout` ≥ v7.0.0 refuses that checkout by default.
- **Repo conventions the new workflow should follow or consciously differ from**: untrusted values only through `env:` (`ci.yml:88`); explicit minimal `permissions` (`health.yml:10`; the missing block in `ci.yml` was flagged in an earlier review); existing workflows use moving tags (`actions/checkout@v4`, `ci.yml:13`), while the lesson templates pin full SHAs (both SHAs verified against their tags). Nothing in CI builds or tests `tools/code-reviewer` today.

## Detailed Findings

### Lesson templates vs this repository

- Workflow template (`.claude/config-templates/m5l3-review.yml.template`):
  - trigger `pull_request` on `branches: [master]`, types `opened, synchronize, reopened, labeled` (:8-11);
  - `permissions: contents: read, pull-requests: write, issues: write` (:13-16);
  - `concurrency: ai-review-<PR number>`, `cancel-in-progress: true` (:18-20);
  - job `if: github.event.action != 'labeled' || github.event.label.name == 'ai-cr:review'` (:24);
  - checkout with `fetch-depth: 0` and `git diff "origin/$BASE_REF...HEAD" > "$RUNNER_TEMP/pr.diff"` (:30-37);
  - local action `./.github/actions/ai-reviewer` with `api-key: ${{ secrets.LLM_PROVIDER_API_KEY }}`, PR title/body from the event (:39-47);
  - "Comment and label" step with `gh pr comment --body-file`, `gh label create … --force`, `gh pr edit --add-label/--remove-label`, removing `ai-cr:review` (:49-61);
  - "Gate on verdict" step exits 1 unless `verdict == pass` (:63-67).
- Action template (`.claude/config-templates/m5l3-action.yml.template`): inputs `api-key`, `pr-title`, `pr-body` (default empty, "costs tokens"), `diff-file`, `model` (default `z-ai/glm-5.3`) (:9-26); outputs `verdict`, `review-file` (:28-34); `setup-node` v7.1.0 with Node 24 (:39-41); runs `node "$GITHUB_ACTION_PATH/dist/review.js" > "$RUNNER_TEMP/ai-review.json"`, validates the verdict with an inline node one-liner, writes outputs (:43-60); untrusted PR text passes only through `env:` (:46).
- The agent's CLI already matches the action's run contract: `DIFF_FILE`, `PR_TITLE`, `PR_BODY`, `REVIEW_MODEL`; stdout is the review JSON only; exit 0 on any verdict, 1 on review failure, 2 on usage error (`tools/code-reviewer/src/index.ts`, `src/cli-input.ts`; decided in `context/changes/tool-loop-agent/plan.md`).
- Mismatches to resolve in the plan:
  - Key: the agent's CLI checks `OPENROUTER_API_KEY` and exits 2 when it is missing (`tools/code-reviewer/src/index.ts`); the action exports `LLM_PROVIDER_API_KEY` (`m5l3-action.yml.template:48`).
  - `dist/review.js`: no build script exists in `tools/code-reviewer/package.json`; root `.gitignore:2` is `dist/`, so a committed `dist` anywhere is ignored unless force-added or un-ignored.
  - Node: action uses 24; repo CI uses 22 (`ci.yml:16`); `ubuntu-latest` (Ubuntu 24.04 image) ships Node 22.x and `gh` 2.102.0 (runner-images README).
  - Default model: `z-ai/glm-5.3` ($0.079/M in, $4.80/M out on OpenRouter, checked 2026-10-14) vs the agent's `deepseek/deepseek-v4.1-flash` ($0.021/M in, $0.891/M out). Free `nvidia/nemotron-3-super-120b-a12b:free` produced valid Polish reviews in this session (670 in / 380 out tokens with title + body).

### Packaging the reviewer for the action

- `node_modules/.bin/esbuild src/index.ts --bundle --platform=node --format=esm --target=node22` builds in under 0.1 s; the result fails at start with `Error: Dynamic require of "path" is not supported` (from `@vercel/oidc/dist/token-util.js`, a dependency pulled by `ai`).
- Adding `--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);` fixes it: the bundle (1,590,612 bytes) runs on Node 24.21.0 locally, exits 2 with the usage message on an empty diff, and exits 1 with `Review failed (HTTP 401): Missing Authentication header` on an invalid key.
- Options visible from the evidence (choice belongs to the plan): build the bundle inside the workflow/action at run time (no committed artifact, adds `npm ci` in `tools/code-reviewer` plus a <1 s build); or commit the bundle (needs a `.gitignore` exception and a CI check that it matches the source); or skip the bundle and run `tsx` after `npm ci`.

### GitHub platform behaviour (primary sources, checked 2026-10-14)

- Forks: on `pull_request` from a fork, repository secrets are not passed and "The `GITHUB_TOKEN` has read-only permissions in pull requests from forked repositories" — https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows. Inferred consequence: empty API key (agent exits 2) and 403 on comment/label calls. Common guard: `github.event.pull_request.head.repo.full_name == github.repository`.
- Dependabot PRs are treated like fork PRs (read-only token, only Dependabot secrets) — same page, and https://docs.github.com/en/code-security/dependabot/troubleshooting-dependabot/troubleshooting-dependabot-on-github-actions. No `dependabot.yml` exists in this repo (`.github/` holds only `workflows/ci.yml` and `workflows/health.yml`).
- `pull_request_target` runs with secrets and a write token in the base context; running PR code there is the "pwn request" pattern; `actions/checkout` v7.0.0+ blocks fork-PR checkout under `pull_request_target` / `workflow_run` unless `allow-unsafe-pr-checkout: true` — https://github.com/actions/checkout/blob/v7.0.1/README.md.
- Required checks: protected branches and rulesets are available for public repos on GitHub Free (docs source `data/reusables/gated-features/protected-branches.md`, `repo-rules.md` in github/docs). The required check is selected by its check-run (job) name; "expected source" can be pinned to GitHub Actions — https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches.
- Skips: a workflow skipped by path/branch filters leaves a required check "Pending" (blocks); a **job skipped by `if:` reports "Success"** and does not block merge — https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/troubleshooting-required-status-checks. Inference (not documented, test on a throwaway PR): a `labeled` run for another label on the same head SHA posts a skipped (= passing) `review` check that may supersede an earlier failure.
- Concurrency: workflow-level groups are evaluated when the run is queued, before job conditions; with `cancel-in-progress: true` an unrelated `labeled` run cancels the in-progress review and then skips itself (reasoned from https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax; real-world instance in a nixpkgs workflow fix). `cancel-in-progress` and the group may be expressions, so label events can get their own group or not cancel.
- Bypass: branch protection does not bind admins unless "Do not allow bypassing the above settings" is enabled; rulesets bind everyone not on the bypass list — about-protected-branches and creating-rulesets docs. The owner is the only admin here.
- `gh` is preinstalled and needs `GH_TOKEN` per step — https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-github-cli. Creating labels, adding/removing labels and commenting require "Issues (write) or Pull requests (write)" — https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens.
- No recursion: events caused by `GITHUB_TOKEN` do not create workflow runs (except dispatch events), so the workflow's own label edits do not re-trigger it; labels added by a human do — events-that-trigger-workflows page.
- Pinned SHAs: `refs/tags/v7.0.1` of `actions/checkout` → `3d3c42e5aac5ba805825da76410c181273ba90b1` (matches, released 2026-07-20, `node24`); `refs/tags/v7.1.0` of `actions/setup-node` → `949feb2413d6458794dcd2491c4babbbce0c15c1` (matches, released 2026-10-08) — via `api.github.com/repos/actions/*/git/refs/tags/*`.
- Limits: `GITHUB_OUTPUT` max 1 MB per job (workflow-syntax page; multiline values need a delimiter that cannot occur in the value, or a file). PR comment body limit 65,536 characters is empirical (API validation error), not documented; the summary field is 2-3 sentences by prompt, so the limit matters only for a misbehaving model.

### Existing CI conventions

- Untrusted values go through `env:`: `ci.yml:88` "Passed through env, never interpolated into the script (script-injection hygiene)".
- `permissions`: `health.yml:10` `permissions: {}`; `ci.yml` has none — flagged as F1 in `context/archive/2026-10-04-app-available-after-idle-week/reviews/impl-review.md:29-35` (fixed for health.yml only).
- Action references use moving major tags in all 3 workflow jobs inspected (`actions/checkout@v4` at `ci.yml:13,31,156`; `actions/setup-node@v4` at `ci.yml:14,32,157`); the only pinning is the Supabase CLI version (`ci.yml:38-39`).
- Triggers: `ci.yml:3-7` runs `ci` and `smoke` on `push` and `pull_request` to `main`; `deploy` only on push to main after `ci` + `smoke` (`ci.yml:147-148`), in environment `SUPABASE` (`ci.yml:151`). `concurrency` appears only on `deploy` (`ci.yml:152-154`).
- `tools/code-reviewer` is outside every app check: `eslint.config.js` `globalIgnores(["tools/code-reviewer/"])`, `tsconfig.json` `exclude`, `vitest.config.ts` includes only `src/**` and `scripts/**`; no CI job installs it.

## Code References

- `.claude/config-templates/m5l3-review.yml.template:8-67` — workflow template (trigger, permissions, concurrency, diff, comment/labels, gate)
- `.claude/config-templates/m5l3-action.yml.template:9-60` — composite action template (inputs, Node 24, `dist/review.js`, outputs)
- `tools/code-reviewer/src/index.ts` — CLI: `OPENROUTER_API_KEY` check, exit codes, stdout JSON
- `tools/code-reviewer/src/cli-input.ts` — `DIFF_FILE` / `PR_TITLE` / `PR_BODY`
- `tools/code-reviewer/src/agent.ts` — `DEFAULT_MODEL`, `reviewPullRequest()`
- `tools/code-reviewer/package.json` — scripts `review`, `typecheck`, `test`; no `build`
- `.gitignore:2` — `dist/`
- `.github/workflows/ci.yml:3-7,13-16,88,147-154` — triggers, action tags, Node 22, env-only rule, deploy
- `.github/workflows/health.yml:10` — `permissions: {}`

## Architecture Insights

- The review is a separate workflow from `ci.yml`; making its job a required check is a GitHub setting (branch protection or ruleset), not something the repo can enforce.
- The diff is passed as a file, so size limits of step outputs and arguments do not apply to it; the review JSON is also passed as a file (`review-file`), with only the one-word verdict in `GITHUB_OUTPUT`.
- Gate semantics depend on a run never ending as "skipped" for a reason other than "nothing to review"; the label-event design must be chosen with that in mind.

## Historical Context (from prior changes)

- `context/changes/tool-loop-agent/plan.md` — settled the CLI contract (env inputs, pure-JSON stdout, exit codes 0/1/2) for this action, and deferred the `LLM_PROVIDER_API_KEY` → `OPENROUTER_API_KEY` mapping and the `dist/review.js` build to this change (supported: both are still open).
- `context/archive/2026-10-04-app-available-after-idle-week/reviews/impl-review.md:29-35` — minimal `permissions` decided for health.yml; ci.yml still lacks it (supported).
- `context/archive/2026-10-06-testing-safe-migrations/plan.md:72,282` — preference for adding no new CI credentials (partial: it concerned that change; this change needs one new secret by design).
- `context/foundation/infrastructure.md:77,79` — CI secrets are GitHub repository secrets; an agent may push to `main` (supported; relevant because direct pushes bypass a PR-only gate).

## Related Research

- Not applicable: no other `research.md` covers CI or AI review.

## Open Questions

- Whether a skipped `labeled` run supersedes an earlier failed required check is inferred, not documented — confirm on a throwaway PR before relying on the label re-run.
- Repository settings were not inspected (no `gh`/API auth here): existing branch protection, the repository's default `GITHUB_TOKEN` permissions, and which secrets exist.
- Product choices for the plan: bundle strategy (build at run time vs committed), key mapping, default model in CI (free vs paid), skip vs explicit failure for fork/Dependabot PRs, how the `ai-cr:review` label re-run avoids the cancel/skip pitfalls, whether the owner's direct pushes to `main` stay allowed (the gate covers PRs only), and whether to add a `tools/code-reviewer` typecheck/test job to CI.
