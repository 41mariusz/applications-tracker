# Status Rules End to End (Test-Plan Phase 2) Implementation Plan

## Overview

This phase covers test-plan Phase 2 (risks #3 and #4, plus the risk #5 gaps found in research). The tests must prove:

- every status transition in the PRD;
- that reverting a terminal status needs confirmation and leaves a trace;
- that each change writes its history row;
- the importance ordering of the list.

Expected values come from the PRD (`context/foundation/prd.md:109-115`) and the decisions in this plan, never from the code under test.

There is one small behaviour change: a deterministic tie-break in the list order. Two PRD clarifications are also added. The owner's ability to bypass the app through Supabase's REST API is recorded as a known limit, not fixed.

## Current State Analysis

From `context/changes/testing-status-rules-end-to-end/research.md`:

- **Transitions:**
  - The rule lives in `checkTransition` (`src/lib/domain/status.ts:25-41`).
  - It is enforced server-side only by `changeApplicationStatus` (`src/lib/services/applications.ts:107-111`). This is also the only place the revert confirmation is checked.
  - `change_application_status` (`supabase/migrations/20260930150000_atomic_writes.sql:8-30`) persists what it is given, with an optimistic `status = p_from` guard.
- **Ordering:**
  - `sortApplications` (`status.ts:53-70`) runs once server-side (`applications.ts:136`). There is no SQL `ORDER BY`.
  - The dashboard renders all cards in that order and hides non-matches (`src/pages/dashboard.astro:106-199`).
  - Ties keep PostgREST's unspecified row order.
- **Activity:** `last_activity_at` is a stored column. It is bumped to `now()` by:
  - `change_application_status` (`atomic_writes.sql:20`);
  - `add_note` (`atomic_writes.sql:93-95`);
  - the rate note inside `update_application`.

  Field edits, note edits and removals, and CV changes do not bump it.

- **Traces:** every app route that changes an application or note uses a trace function, except note removal. Removal (`src/lib/services/notes.ts:68`) is a direct `deleted_at` update, and `deleted_at` itself is the trace.
- **Coverage today:**
  - Unit: hand-written cases, no exhaustive matrix (`src/lib/domain/status.test.ts`).
  - pgTAP: 12 assertions (`supabase/tests/atomic_writes.test.sql`).
  - Smoke: 5 status moves, HTTP codes only (`scripts/smoke.mjs:209-223`).
  - E2E: no status test.
  - Never asserted anywhere:
    - `set_application_cv`;
    - `note_revisions` content;
    - `is_revert`;
    - `last_activity_at`;
    - the rendered order.
- **False-positive isolation step:** "second user cannot edit the first user's note" (`smoke.mjs:405-410`) targets a note the owner already removed (`:258`). The 404 comes from the removed-note guard (`notes.ts:45`), not from isolation.
- **Database bypass:** `authenticated` holds full table grants (verified locally). The `applications` and `notes` update policies check only ownership (`supabase/migrations/20260929180000_create_applications.sql:50-53`).

## Desired End State

- **Unit:** an exhaustive 7×7 transition table, hand-written from the PRD, passes against `checkTransition`. The ordering tests cover:
  - the PRD stage order;
  - recency within a stage;
  - Rejected and Withdrawn interleaving by activity;
  - the new tie-break.
- **pgTAP:**
  - each trace function writes its exact history row (or none, for no-ops);
  - `last_activity_at` moves only on a status change or a note;
  - another user can neither act through the functions nor see history rows.
- **Smoke:**
  - each transition kind returns the right HTTP code;
  - a revert shows "(cofnięcie)" in the history;
  - `/dashboard` lists a fresh account's applications in PRD order;
  - the second-user isolation steps prove isolation, not the removed-note guard.
- **E2E:** one browser spec proves that cancelling the revert dialog changes nothing, and that accepting it reverts the status and records the revert.
- **Docs:** the test plan, CLAUDE.md and PRD describe the decided rules and the known limit.

Verify with `npm test`, `npx supabase test db`, `npm run smoke` (local), `npx playwright test`, and `npm run lint`.

### Key Discoveries:

- pgTAP runs in one transaction, so `now()` is constant. To assert a bump, first set `last_activity_at` to an old value, then compare with `now()`. Setting the value directly as `authenticated` is allowed by the update policy (`create_applications.sql:50-53`).
- Smoke steps later in the run depend on the main application ending in `offer`: the status filter steps check `?status=offer` → 1 and `sent,rejected` → 0 (`smoke.mjs` "status filter" steps). New transition steps must leave it at `offer`.
- The second smoke user has an empty list, so it is a clean account for an ordering assertion. It signs in near the end (`smoke.mjs:372-376`).
- `StatusControl` is rendered on the details page (`src/pages/applications/[id]/index.astro:97`). The revert dialog is a native `window.confirm` (`src/components/applications/StatusControl.tsx:18-25`). On success the page reloads (`:34`).
- E2E pattern: data is created through the app API with the app's `Origin`, and cleanup is asserted with `deleteApplication` (`tests/e2e/call-phone-search.spec.ts:12-23,41-45`, `tests/e2e/support/local-admin.ts`).
- Dashboard cards carry `data-status` and link to `/applications/<id>` (`dashboard.astro:111,124`). Closed cards get `line-through` (`:123`).

## What We're NOT Doing

- **Database-level enforcement.** A signed-in owner can change status, fields or notes, or forge history, by calling PostgREST or RPC directly with their own token. We don't revoke table grants, add SQL transition checks or add SECURITY DEFINER paths; the limit is recorded instead (decision: document the limit). Cross-user access is still blocked by RLS and tested.
- **Changing what counts as activity.** Activity stays the moment of saving. Backdated notes still lift an application, and removing a note does not lower it (decision).
- **Restricting the route to Accepted.** Any active → Accepted stays a forward move without confirmation (decision).
- **Separate ranks for Rejected and Withdrawn** (decision: they interleave by activity).
- An HTTP request for every one of the 42 transitions. The exhaustive matrix is a unit test; HTTP covers one representative move per transition kind and error code.
- Fixing the probable 500 for a malformed id on the status route, the 1000-row PostgREST cap, or a screenshot test of the list (test-plan §7).

## Implementation Approach

Each phase covers one test layer, from the cheapest up. The only production-code change, the tie-break, lands in Phase 1 together with its unit test, so later layers test the final rule.

The oracle for each layer is written out by hand:

- the PRD matrix (unit);
- the activity rules decided above (pgTAP);
- an expected company order (smoke);
- the dialog behaviour (E2E).

Each new browser or HTTP check is shown to protect: break the behaviour, watch the check go red, revert.

## Phase 1: PRD oracle in unit tests + deterministic tie-break

### Overview

Replace the hand-picked transition examples with an exhaustive matrix written from the PRD. Make the list order fully deterministic, and record the two clarified rules in the PRD.

### Changes Required:

#### 1. Transition matrix from the PRD

**File**: `src/lib/domain/status.test.ts`

**Intent**: Add an exhaustive table of all 49 (from, to) pairs. Each pair is marked forward / close / revert-with-confirmation / refused, typed by hand from `prd.md:111-113` plus the decision that any active status may move forward to Accepted. The test must not derive expectations from `PIPELINE`, `STAGE_RANK` or other exports of `status.ts`. Keep the existing named cases that document PRD examples.

**Contract**: one `it.each` (or equivalent) over a literal matrix. A header comment cites `prd.md:111-113` and this plan's Accepted decision. It asserts `allowed`, `kind` and `requiresConfirmation` for each pair, and that the `allowedTargets` output equals the matrix row.

#### 2. Ordering tests

**File**: `src/lib/domain/status.test.ts`

**Intent**: Pin the PRD order and the decided tie rules:

- a newer item in a lower stage stays below an older item in a higher stage;
- Rejected and Withdrawn interleave by activity, tested in both directions (withdrawn newer and rejected newer);
- equal `last_activity_at` falls back to the newer `created_at`, then to `id`.

**Contract**: the test fixture gains `created_at`. The expected id lists are literal.

#### 3. Deterministic tie-break

**File**: `src/lib/domain/status.ts`

**Intent**: When stage and activity are equal, order by newer `created_at` first, then by `id` ascending, so the list never reorders between reloads.

**Contract**: the generic bound of `sortApplications` becomes `{ status; last_activity_at; created_at; id }`. `Application` (`src/types.ts:18-36`) already satisfies it, and the only caller is `applications.ts:136`. Update the comment above `STAGE_RANK` to name the tie-break.

#### 4. PRD clarifications

**File**: `context/foundation/prd.md`

**Intent**: Record the two decisions as dated updates under Business Logic, in the style of the existing `> Update 2026-10-01` notes:

1. Accepted is reachable as a forward move from any active status.
2. "Most recent activity" is the moment a note or status change is saved. Editing fields, notes or the CV does not change it, and removing a note does not lower it. Rejected and Withdrawn interleave by activity, and ties go to the newer application.

**Contract**: two `> Update 2026-10-05:` blockquotes under `**Transitions.**` and `**Ordering.**` (`prd.md:113,115`). The PRD body text stays unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- The matrix covers 49 pairs (`npm test -- status` reports them)

#### Manual Verification:

- Changing one entry of `checkTransition`'s logic (e.g. allowing offer → sent) makes the matrix test fail on that pair; the change is reverted

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: pgTAP — traces, activity and isolation of the trace functions

### Overview

A new pgTAP file proves that each trace function writes its exact history row and moves `last_activity_at` only where decided, and that another user is shut out.

### Changes Required:

#### 1. History traces test file

**File**: `supabase/tests/history_traces.test.sql` (new)

**Intent**: Follow the setup pattern of `atomic_writes.test.sql:1-16`: two users, act as the owner through RLS, roll back at the end. Assert:

- **`change_application_status`**
  - stores `is_revert` as passed (true and false);
  - writes from/to correctly;
  - bumps `last_activity_at` to `now()`.
- **`add_note`**
  - inserts the note;
  - bumps `last_activity_at`.
- **`update_application`**
  - does not bump `last_activity_at` without a rate note;
  - bumps it with a rate note, and that note exists.
- **`edit_note`**
  - writes one `note_revisions` row holding the previous body, kind and `noted_at`;
  - the note holds the new body;
  - no bump;
  - returns false for a note with `deleted_at` set.
- **Note removal** (direct `update notes set deleted_at`, the app's path)
  - leaves the body unchanged;
  - no bump.
- **`set_application_cv`**
  - writes a `field_changes` row with `field = 'cv'` and old/new file names (first attach: old is null; replacement: both names);
  - same CV again → true with no new row;
  - unknown or foreign CV id → false with no row;
  - no bump.
- **Another user**
  - `add_note`, `edit_note`, `update_application` and `set_application_cv` on the owner's rows return false or not-found and write nothing;
  - `select count(*)` from `status_changes`, `field_changes` and `note_revisions` is 0.

**Contract**: `select plan(N)` matches the number of assertions. Before each bump assertion, set `last_activity_at` to a fixed past timestamp (see Key Discoveries). `cv_files` rows are inserted directly as the owner, with `storage_path` under `<uid>/` to satisfy the policy (`supabase/migrations/20261001090000_cv_files.sql:30-36`). A cross-user CV row is inserted while acting as the second user.

### Success Criteria:

#### Automated Verification:

- Database tests pass: `npx supabase test db` (local Supabase running)
- Both pgTAP files run in CI's `smoke` job without workflow changes (`supabase test db` picks up every file in `supabase/tests/`)

#### Manual Verification:

- Temporarily removing the `last_activity_at` bump from a local copy of `add_note` (via `create or replace` in a psql session, not a migration) turns the activity assertion red; reset with `npx supabase db reset`

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Smoke HTTP — transition kinds, revert trace, list order, isolation

### Overview

Prove the rule through the real API and SSR pages:

- each transition kind and error code;
- the revert marker in the history;
- PRD order on a clean account's dashboard;
- isolation steps that test isolation.

### Changes Required:

#### 1. Transition kinds and the revert trace

**File**: `scripts/smoke.mjs`

**Intent**: After the existing "confirmed revert is accepted" step (`smoke.mjs:220-224`, which leaves the application at `offer`), add these steps in order:

1. same status (offer → offer) → 400;
2. offer → accepted → 200;
3. accepted → withdrawn without `confirm` → 409 `requiresConfirmation` (terminal → terminal);
4. accepted → withdrawn with `confirm=false` → 400;
5. accepted → withdrawn with `confirm=true` → 200;
6. the details page history includes `(cofnięcie)`;
7. withdrawn → offer with `confirm=true` → 200.

The last step restores `offer`, which the later status-filter steps rely on.

**Contract**: reuse `changeStatus` and `details` (`smoke.mjs:134-148`). Step names describe the PRD rule, not the code path.

#### 2. A note that stays active, for isolation

**File**: `scripts/smoke.mjs`

**Intent**: Before the owner signs out, add a second note that is never removed, and keep its id. Point the second user's "cannot edit the first user's note" step at it, so the 404 can only come from RLS. Add new second-user steps:

- cannot remove that note (DELETE → 404);
- cannot change the first user's status (POST status → 404).

**Contract**: new module-level `activeNoteId`, set the same way as `noteId` (`smoke.mjs:236-245`).

#### 3. List order on a clean account

**File**: `scripts/smoke.mjs`

**Intent**: After the isolation steps, while signed in as the second user (empty list), one step sets up and checks the order:

- Create seven applications with companies carrying a per-run tag.
- Move them, in sequence, to: accepted, offer, interviews, hr_contact, sent (two of them), rejected, withdrawn. Moves to a closed status come from `sent`.
- Add a note to the older `sent` application, so it becomes the most recently active `sent`.
- Fetch `/dashboard` and extract the company names in document order. Compare them with the expected order:
  1. accepted
  2. offer
  3. interviews
  4. hr_contact
  5. the noted `sent`
  6. the other `sent`
  7. the closed two, ordered by when they were closed (the later one first)
- Every closed card must carry `line-through`.

**Contract**: the step returns `{ status, location, body }` like the other steps. `body` is the extracted order joined with `>`, and the expectation uses `bodyIncludes` with the literal expected string. Extraction relies on the existing `href="/applications/<id>"` links. The ids returned by create map back to companies, so the check does not depend on CSS classes.

#### 4. CLAUDE.md smoke description

**File**: `CLAUDE.md`

**Intent**: Extend the `npm run smoke` sentence with "status transitions incl. terminal → terminal and the revert marker, importance ordering of the list".

**Contract**: the `## Commands` bullet for `npm run smoke`.

### Success Criteria:

#### Automated Verification:

- Smoke passes locally against a production preview on local Supabase: `npm run build`, preview, then `BASE_URL=… SUPABASE_URL=<local> SUPABASE_SERVICE_ROLE_KEY=<local> npm run smoke` (per test-plan §6.4; `.dev.vars` only, never a swapped `.env`)
- Lint passes: `npm run lint`

#### Manual Verification:

- Temporarily giving `withdrawn` the same rank as `sent` in `STAGE_RANK` turns the ordering step red with a readable expected/actual order; reverted
- The note targeted by the second user's edit/remove steps is active: as the owner, the details page shows it without `data-removed`

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 4.

---

## Phase 4: E2E — revert confirmation in a browser

### Overview

Prove the part only a browser can see: the UI asks before reverting a terminal status, sends nothing when the owner cancels, and records the revert when they accept.

### Changes Required:

#### 1. Revert spec

**File**: `tests/e2e/status-revert.spec.ts` (new)

**Intent**: Signed in through the `setup` project's `storageState`:

1. Create one application through the app API with the app's `Origin` and a letters-only tag (pattern `call-phone-search.spec.ts:37-45`). Close it via `POST /api/applications/<id>/status` with `status=rejected`.
2. Open `/applications/<id>`.
3. Pick "Oferta" in the "Zmień status" select, and dismiss the dialog. Assert that:
   - the dialog text names the revert;
   - no request was sent to the status route;
   - after a reload the status is still "Odrzucona" and the history has no "(cofnięcie)".
4. Pick "Oferta" again and accept the dialog. After the page reloads, assert that:
   - the status shows "Oferta";
   - the history shows "Odrzucona → Oferta" with "(cofnięcie)".

Asserted cleanup in `afterEach` via `deleteApplication`, as in `call-phone-search.spec.ts:12-23`.

**Contract**: header comment `// risk: #3 (test-plan.md) — …`. Use `page.once("dialog", …)` to handle each dialog. Watch the status route with `page.on("request")` or `waitForRequest`, and fail if a POST is seen after a dismiss. Select the control by its label "Zmień status".

### Success Criteria:

#### Automated Verification:

- E2E passes locally: `npx playwright test tests/e2e/status-revert.spec.ts` (local guards per test-plan §6.3)
- Full E2E suite passes: `npx playwright test`
- Lint passes: `npm run lint`

#### Manual Verification:

- Temporarily replacing the `window.confirm(...)` condition in `StatusControl.tsx` with `true` makes the spec fail on the "nothing sent after dismiss" assertion; reverted
- No `[E2E]` applications remain in local Supabase after a passing run and after the deliberately failing run

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 5.

---

## Phase 5: Documentation and test-plan close-out

### Overview

Record how to test a status-rule change, the decided rules, and the accepted database-level limit.

### Changes Required:

#### 1. Test plan

**File**: `context/foundation/test-plan.md`

**Intent**:

- Fill §6.5 "Testing a status-rule change":
  - oracle = the PRD matrix in `status.test.ts`;
  - activity and trace rules in `supabase/tests/history_traces.test.sql`;
  - HTTP kinds and dashboard order in smoke;
  - the dialog in `tests/e2e/status-revert.spec.ts`;
  - the `now()`-in-a-transaction gotcha.
- Add a Phase 2 note to §6.6.
- Add the owner-level PostgREST/RPC bypass to §7, with its rationale (single-user app, owner token only, RLS blocks other users) and a re-evaluation trigger (a second user or a shared account).
- Note in §2 or §3 that the risk #5 gaps were fixed in smoke.
- Update the §4 test-base profile counts.

**Contract**: sections §4, §6.5, §6.6 and §7. Leave the §3 Status column to the orchestrator (`/10x-test-plan`).

#### 2. CLAUDE.md hard rule

**File**: `CLAUDE.md`

**Intent**: Qualify "Every change leaves a trace": the guarantee holds for writes through the app's API routes; table grants still let the owner bypass it (see test-plan §7).

**Contract**: the `## Hard rules` bullet "Every change leaves a trace".

### Success Criteria:

#### Automated Verification:

- Prettier/lint pass on the edited docs: `npx prettier --check context/foundation/test-plan.md CLAUDE.md context/foundation/prd.md`

#### Manual Verification:

- §6.5 lets someone add a new transition test without reading this plan

---

## Testing Strategy

### Unit Tests:

- 7×7 PRD transition matrix and `allowedTargets` rows.
- Ordering: stage order, recency, closed interleave (both directions), tie-break by `created_at` then `id`, no mutation.

### Integration Tests:

- pgTAP:
  - exact history rows for status, note edit and CV;
  - no-ops write nothing;
  - `last_activity_at` bump rules;
  - cross-user refusal and invisibility.
- Smoke HTTP:
  - one representative per transition kind and error code;
  - revert marker;
  - dashboard order on a clean account;
  - corrected isolation steps.

### End-to-end:

- One Playwright spec for the revert dialog (cancel → nothing sent; accept → reverted and traced).

### Manual Testing Steps:

1. Break the transition rule → matrix red; revert.
2. Break the stage rank → smoke order step red; revert.
3. Bypass `window.confirm` → E2E red; revert.
4. Confirm that no E2E data remains.

## Performance Considerations

- Smoke gains about 20 requests and E2E one short spec. Both are negligible next to the CI build.

## Migration Notes

- No migration. The tie-break is TypeScript only, so `npx supabase db push` is not needed (`context/foundation/lessons.md`).

## References

- Research: `context/changes/testing-status-rules-end-to-end/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (risks #3, #4, #5), §6.3, §6.4
- PRD: `context/foundation/prd.md:109-115`
- Patterns:
  - `supabase/tests/atomic_writes.test.sql:1-16`
  - `tests/e2e/call-phone-search.spec.ts:12-45`
  - `scripts/smoke.mjs:134-148,236-245`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: PRD oracle in unit tests + deterministic tie-break

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — e154059
- [x] 1.2 Lint passes: `npm run lint` — e154059
- [x] 1.3 Type check passes: `npx astro check` — e154059
- [x] 1.4 The matrix covers 49 pairs — e154059

#### Manual

- [x] 1.5 Breaking one transition makes the matrix fail on that pair; reverted — e154059

### Phase 2: pgTAP — traces, activity and isolation of the trace functions

#### Automated

- [x] 2.1 Database tests pass: `npx supabase test db` — aec5e03
- [x] 2.2 Both pgTAP files run in CI's smoke job without workflow changes — aec5e03

#### Manual

- [x] 2.3 Removing the add_note activity bump turns the assertion red; reset — aec5e03

### Phase 3: Smoke HTTP — transition kinds, revert trace, list order, isolation

#### Automated

- [x] 3.1 Smoke passes locally against a production preview on local Supabase — 3ec326d
- [x] 3.2 Lint passes: `npm run lint` — 3ec326d

#### Manual

- [x] 3.3 Breaking the stage rank turns the ordering step red; reverted — 3ec326d
- [x] 3.4 The note-edit isolation step targets an active note — 3ec326d

### Phase 4: E2E — revert confirmation in a browser

#### Automated

- [x] 4.1 E2E passes locally: status-revert spec
- [x] 4.2 Full E2E suite passes
- [x] 4.3 Lint passes: `npm run lint`

#### Manual

- [x] 4.4 Bypassing window.confirm makes the spec fail; reverted
- [x] 4.5 No [E2E] applications remain after passing and failing runs

### Phase 5: Documentation and test-plan close-out

#### Automated

- [ ] 5.1 Prettier check passes on the edited docs

#### Manual

- [ ] 5.2 §6.5 lets someone add a transition test without reading this plan
