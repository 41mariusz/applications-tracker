<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Application list usable on a 360 px phone (S-06)

- **Plan**: context/changes/phone-friendly-list/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Accepted adaptations (reported during implementation): card surface `bg-muted` (equals the old `bg-white/10`), `ApplicationCard.astro` added to `CLEAN_VIEWS`, disabled state shown with `STATUS_PILL_CLASS`. Gates on review: lint (13 clean views), `astro check` 0 errors, 511 unit tests, literal scan 0; smoke and E2E passed locally and in CI before the deploy the owner checked on the phone.

## Findings

### F1 — Chip class copied by hand into the kitchen sink and already drifted

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.astro:85, src/pages/dev/ui.astro:111
- **Detail**: The filter-chip class string exists twice; the kitchen-sink copy already lacks `transition-colors`. The kitchen sink can show a chip that is not the real one — the drift the shared `ApplicationCard` was introduced to prevent.
- **Fix**: Export one `FILTER_CHIP_CLASS` (next to the card, e.g. `src/components/applications/list-classes.ts`) and use it in both files.
- **Decision**: FIXED — shared FILTER_CHIP_CLASS in src/components/applications/list-classes.ts, used by /dashboard and /dev/ui

### F2 — Phone spec walks every card of the shared E2E user

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/phone-list.spec.ts:54-77
- **Detail**: `cards.count()` is read once and `nth(i)` walks all visible cards. With `fullyParallel` and several local workers, another spec creating or deleting applications for the same user can shift indices (timeout or wrong box). CI uses 1 worker, so this is local flakiness.
- **Fix**: Limit the per-card loop to the two cards this test created (filter by their company names); keep the page-wide overflow and chip checks.
- **Decision**: FIXED — per-card checks limited to the two cards the test created; overflow and chip checks stay page-wide

### F3 — Kitchen-sink disabled/error states copy StatusControl markup

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dev/ui.astro (list section, "disabled" and "error" cards)
- **Detail**: The disabled pill is rebuilt around `STATUS_PILL_CLASS`, and the error line copies `text-destructive max-w-48 text-xs` and the "Zapisywanie…" markup. A future StatusControl change would not show up there.
- **Fix A ⭐ Recommended**: Accept the copies and say so in a comment next to them
  - Strength: No production-code change for a dev-only page; the pill class itself is already shared.
  - Tradeoff: The error/pending lines can still drift silently.
  - Confidence: HIGH — the existing islands section already documents the same limitation.
  - Blind spot: None significant.
- **Fix B**: Add `initialPending` / `initialError` props to StatusControl for static renders
  - Strength: The kitchen sink renders the real component in every state.
  - Tradeoff: Props that exist only for the kitchen sink widen the component's API.
  - Confidence: MED — simple, but adds test-only surface to production code.
  - Blind spot: Hydration of an initial error state on the real pages is untested.
- **Decision**: FIXED via Fix A — comment next to the copies in /dev/ui

### F4 — Chip count dimmed with opacity-60

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:93, src/pages/dev/ui.astro (chips)
- **Detail**: `opacity-60` on `text-xs` passes the literal lint but bypasses the token contract and may fall below 4.5:1 contrast; the muted role has a token.
- **Fix**: Replace `opacity-60` with `text-muted-foreground` on the count.
- **Decision**: FIXED — chip count uses text-muted-foreground instead of opacity-60

### F5 — Broken in-page anchor in the kitchen sink

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dev/ui.astro (list section, `href="#ks-list"`)
- **Detail**: The add-button sample links to `#ks-list`, an id that does not exist.
- **Fix**: Add `id="ks-list"` to the list section.
- **Decision**: FIXED — id="ks-list" on the list section

### F6 — Kitchen sink misses a few list pieces

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/pages/dev/ui.astro (list section)
- **Detail**: Not shown: the "Wyniki: N" summary line and a card without salary or rate (the card's optional row).
- **Fix**: Add the summary line and one card without salary details.
- **Decision**: FIXED — "Wyniki: N" line and a card without salary, rate and date added to /dev/ui

### F7 — StatusControl.tsx not guarded by the literal lint

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/check-ui-literals.mjs
- **Detail**: StatusControl now holds the shared 40 px pill class used by the list, details and kitchen sink, but is not in `CLEAN_VIEWS`.
- **Fix**: Add it to `CLEAN_VIEWS` if it is literal-free.
- **Decision**: FIXED — StatusControl.tsx and list-classes.ts in CLEAN_VIEWS (break-checked: a literal in list-classes.ts fails the lint)

### F8 — Other views do not follow the new phone rules yet

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/applications/[id]/index.astro:112, src/components/Topbar.astro
- **Detail**: The details view still marks closed applications with `line-through opacity-60` (the list now uses muted text and keeps the status at full contrast), and Topbar uses `break-all` instead of `wrap-anywhere`. Both are outside this change's scope (details view, Topbar deferred).
- **Fix**: Record as follow-ups for S-07/S-12 (audit findings), no change here.
- **Decision**: FIXED — recorded as follow-ups in follow-ups/review-fixes.md (S-07/S-12)
