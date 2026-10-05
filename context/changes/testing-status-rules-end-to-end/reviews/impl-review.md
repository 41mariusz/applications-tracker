<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Status Rules End to End (Test-Plan Phase 2)

- **Plan**: context/changes/testing-status-rules-end-to-end/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Success criteria re-run on 2026-10-05, all green:

- `npm test`: 271 tests.
- `npm run lint`.
- `npx astro check`: 0 errors.
- `npx supabase test db`: 3 files, 64 tests.
- `prettier --check` on the edited docs.
- `npx playwright test`: 4 passed.
- `npm run smoke` against a local production preview.

Every manual row is backed by a recorded break-check.

Scope note: the §3 table and header edits in `context/foundation/test-plan.md` landed in commit ffc4206. They are the `/10x-test-plan` orchestrator's "change opened" update, made before this change. The owner chose to include them in Phase 5, so they are not counted as scope drift.

## Findings

### F1 — Cross-user `edit_note` check in pgTAP passes vacuously

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/history_traces.test.sql:261-265
- **Detail**: The note id is looked up by a subselect that runs as the second user. RLS hides the owner's note, so the call becomes `edit_note(NULL, …)` and returns false whatever `edit_note` does. The owner-side counts later in the file stay green too, because the real id was never attempted.
- **Fix**: Look up the owner's note id while still acting as the owner (a temp table or a fixed literal note id). Pass that id to the second user's `edit_note`.
- **Decision**: FIXED — owner note id stored with `set_config` before switching users (+1 assertion, `plan(47)`); proven by a `security definer` mutant of `edit_note` (3 assertions red, incl. this one)

### F2 — Smoke ordering step cannot fail on a closed card without `line-through`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/smoke.mjs:200-203, 523-527
- **Detail**: The plan says "Every closed card must carry `line-through`". `checkListOrder` appends ` | not crossed out: …` to the body, but the step only checks `bodyIncludes: expectedOrder`, which still matches. The strike-through check is never enforced.
- **Fix**: Add `bodyExcludes: "not crossed out"` to the step's expectation. The runner already supports it.
- **Decision**: FIXED — `bodyExcludes: "not crossed out"` on the ordering step; proven by removing `line-through` from closed dashboard cards (step went red)

### F3 — Smoke ordering proves recency only partially

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs `checkListOrder` (~151-205)
- **Detail**:
  - **What it catches:** `sent-noted` is the older application and gets the newest activity, so a `created_at DESC` rule fails the step.
  - **Recency gap:** a rule that drops the recency key and falls back to insertion order or `created_at ASC` also puts `sent-noted` first, because the query has no `ORDER BY` and returns rows roughly in insertion order. That rule would pass.
  - **Closed pair gap:** a fixed rank with withdrawn above rejected also passes, because only one pair is closed (rejected first, then withdrawn).
  - **Existing coverage:** the unit tests already pin these rules (`status.test.ts` interleave in both directions, recency over `created_at`). The gap is end-to-end only.
- **Fix A ⭐ Recommended**: Three `sent` applications A (oldest), B and C, with the note on B, so the expected order is B > C > A. Plus a second closed pair closed in the opposite order (withdrawn first, then rejected).
  - Strength: Beats `created_at` in both directions, insertion order, and a fixed closed rank in either direction, at the HTTP layer.
  - Tradeoff: About 6 more requests in smoke, and a longer literal expected string.
  - Confidence: HIGH — same mechanism as today, just more items.
  - Blind spot: An id-only order could still match by chance, about 1 in 24.
- **Fix B**: Leave smoke as is and rely on the unit tests for recency and the closed interleave.
  - Strength: No change; the unit layer already pins the rule against the real comparator.
  - Tradeoff: Wiring regressions that drop the comparator (e.g. a future SQL `ORDER BY created_at` replacing `sortApplications`) could slip past smoke.
  - Confidence: MED — depends on the sort staying in `sortApplications`.
  - Blind spot: Future refactors that move ordering into SQL.
- **Decision**: FIXED via Fix A — three "sent" applications (note on the middle one, expected noted > newest > oldest) and two closed pairs closed in opposite orders; proven by dropping the activity key from `sortApplications` (step went red, `sent-newest` jumped above `sent-noted`)

### F4 — "Another user sees no history rows" assertions are always true under RLS

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/history_traces.test.sql:279-281
- **Detail**: Rows written by the second user's calls would belong to the owner's application, so they would be invisible to that user anyway. The real proof is the owner-side count check later in the file.
- **Fix**: Rename the three assertions to "RLS hides the owner's history from another user" so they don't read as proof that nothing was written.
- **Decision**: FIXED — the three assertions renamed to "RLS hides the owner's … from another user"

### F5 — `requiresConfirmation` substring also matches the conflict 409

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:287, 299
- **Detail**: The status route always emits the `requiresConfirmation` key, and the conflict 409 carries `"requiresConfirmation":false`. The new step copies the existing one's weak match.
- **Fix**: Match `'"requiresConfirmation":true'` in both steps.
- **Decision**: FIXED — both 409 steps now match `"requiresConfirmation":true`

### F6 — E2E dismiss check could miss a POST that the reload aborts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/status-revert.spec.ts:57-89
- **Detail**: A bug that POSTs after `confirm()` returns false is caught only if the request event is recorded before `page.reload()`. That is very likely, because fetch starts synchronously in the change handler, but it is not guaranteed. The deliberate break (skipping the dialog) was caught.
- **Fix**: Wait for "Zapisywanie…" to stay hidden and the select to be enabled before the reload, and also record `requestfailed` events for the status route.
- **Decision**: FIXED — the spec also records failed status POSTs (`requestfailed`) and asserts none after the dismiss and none overall
