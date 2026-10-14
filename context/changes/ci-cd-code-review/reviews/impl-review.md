<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: AI Code Review of Pull Requests in GitHub Actions

- **Plan**: context/changes/ci-cd-code-review/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Notes: two unplanned changes were approved during implementation (ci.yml wait loops `i`→`_` for actionlint SC2034; agent error line names the model). Minor wording drifts: replay error text differs from the plan; GH_TOKEN set at job level as in the template (see F2). All automated criteria re-run green on 2026-10-14; manual 3.3–3.8 backed by live runs on PRs #4 and #5 and the bypass message on the push of bc03a13.

## Findings

### F1 — Verdict labels can go stale and turn the gate green

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/review.yml:38-50, 57-65, 83-97
- **Detail**: The verdict lives in PR-wide labels, read from the event-time snapshot. "Drop the previous verdict" removes only labels present in the payload; "Comment and label" adds the new label without removing the opposite one. Cases: (a) a run for an older commit adds `ai-cr:passed` just before being cancelled by a newer push — the newer run does not see it in its payload, the PR ends with both labels, and the next unrelated label event replays green (the replay checks `ai-cr:passed` first); (b) a human label event between a push and the new run's Drop step replays green on the new head from stale labels (which check run then wins is inferred, not verified); (c) a Re-run of an old run re-labels the PR from old code; (d) a hand-added `ai-cr:passed` passes the replay. Owner-only repo today, and the owner can bypass anyway — but the gate's promise "green only with a pass for the current commit" does not hold.
- **Fix A ⭐ Recommended**: Bind the verdict to the head commit. The replay asks the API for the latest completed review (non-replay) run's conclusion for `github.event.pull_request.head.sha` instead of reading labels; labels stay as a human-facing signal only.
  - Strength: Closes all four cases, including hand-added labels and re-runs (a re-run of an old run reviews an old SHA, not the head).
  - Tradeoff: Replay needs `actions: read` and an API call; slightly more logic than the template.
  - Confidence: MED — the runs API by `head_sha` is used in this session; distinguishing review vs replay runs needs a marker (e.g. a step outcome or run name).
  - Blind spot: How GitHub picks between several same-name check runs on one SHA is still unverified.
- **Fix B**: Harden the labels. Read live labels (`gh pr view --json labels`) in Drop, always remove both verdict labels before adding one, and treat "both present" as a fail in the replay.
  - Strength: Small, local change; fixes (a) and most of (b).
  - Tradeoff: (c) and (d) remain — a re-run or a hand label still sets the verdict PR-wide.
  - Confidence: HIGH — plain `gh` calls already used in the workflow.
  - Blind spot: Remaining race window between live read and label edit.
- **Decision**: FIXED via Fix A — verdict recorded as commit status "AI review verdict" on the head SHA; replay reads that status; labels read live, opposite label removed — verified live on PR #5 (commit 4790201): status `AI review verdict: failure` recorded; a hand-added `ai-cr:passed` replayed red ("verdict for this commit: fail")

### F2 — GitHub token visible to third-party code

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/review.yml:32, 52-55
- **Detail**: `GH_TOKEN` (pull-requests/issues: write) is set at job level, so it reaches `npm ci` lifecycle scripts and the agent's third-party dependencies inside the composite action; checkout also keeps the token in `.git/config` (default `persist-credentials`). The plan asked for GH_TOKEN only on steps that call `gh`.
- **Fix**: Move `GH_TOKEN` to the "Drop the previous verdict" and "Comment and label" steps and add `persist-credentials: false` to checkout.
- **Decision**: FIXED — GH_TOKEN only on the three steps that call gh; checkout with persist-credentials: false

### F3 — No job timeout on the required check

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/review.yml:26-29
- **Detail**: The model call has no timeout; a hung OpenRouter request keeps the required check pending up to the 6 h default.
- **Fix**: Add `timeout-minutes: 15` to the job.
- **Decision**: FIXED — timeout-minutes: 15 on the job

### F4 — Misleading or missing error signals in the action

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/actions/ai-reviewer/action.yml:79-85
- **Detail**: A PR with no net diff makes the agent exit 2 (usage error), reported as "exited with 2 and gave no verdict"; an invalid `verdict` in the JSON fails the step under `-e` without an `::error` annotation.
- **Fix**: Give exit 2 its own message ("empty diff") and add `|| { echo "::error title=AI review::invalid verdict in review JSON"; exit 1; }` to the verdict line.
- **Decision**: FIXED — own ::error for exit 2 (empty diff / unreadable DIFF_FILE) and for a missing/invalid verdict

### F5 — Secret readable by anyone who can push a branch

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/review.yml:75; .github/actions/ai-reviewer/action.yml:67-80
- **Detail**: Same-repo PRs get `OPENROUTER_API_KEY` and run their own workflow/action/agent code, so a branch pusher can read the key. Only the owner pushes today; this becomes critical with a collaborator.
- **Fix**: Note in CLAUDE.md that write access grants the key, and set a credit limit on the OpenRouter key.
- **Decision**: FIXED — CLAUDE.md notes that write access grants the key and to keep a credit limit on it (limit itself: owner, in OpenRouter)

### F6 — Two action pinning styles in the repo

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: .github/actions/ai-reviewer/action.yml:54; .github/workflows/review.yml:52; .github/workflows/ci.yml:38-39
- **Detail**: New files pin checkout v7.0.1 / setup-node v7.1.0 by SHA (as planned, from the lesson); ci.yml (incl. the new `code-reviewer` job) uses `@v4` tags.
- **Fix**: Leave as is for now; align ci.yml to SHA pins in a separate change if wanted.
- **Decision**: SKIPPED — consistent with the plan; aligning ci.yml to SHA pins left for a separate change
