---
date: 2026-10-05T15:24:34+00:00
researcher: Claude (Opus 5.5) for Mariusz Michalak
git_commit: a8c8cc96533aafff7f7f7ff6555f0da31d4774f3
branch: main
repository: 10xdevs
topic: "Test-plan Phase 2 — where status transitions, revert confirmation, history traces and list ordering are enforced, and what tests already prove them (risks #3, #4; #5 gaps)"
tags: [research, testing, status, ordering, history, rls, pgtap, smoke]
status: complete
last_updated: 2026-10-05
last_updated_by: Claude (Opus 5.5)
---

# Research: Status rules end to end (test-plan Phase 2)

**Date**: 2026-10-05T15:24:34+00:00
**Researcher**: Claude (Opus 5.5) for Mariusz Michalak
**Git Commit**: a8c8cc96533aafff7f7f7ff6555f0da31d4774f3 (working tree: `context/` changes only)
**Branch**: main
**Repository**: 10xdevs

## Research Question

From `context/foundation/test-plan.md` §2 (Risk Response Guidance, rows #3 and #4) and §3 Phase 2:

1. **Risk #3** — where are transitions enforced (UI, API, SQL), how is the revert confirmation passed, how is list ordering computed? Challenge: "the domain unit tests cover it, so the API and UI enforce it too".
2. **Risk #4** — which UI/API writes bypass the SQL "change + trace" functions, and what do the existing pgTAP and smoke steps already assert? Challenge: "pgTAP covers atomicity, so every write path goes through it".
3. **Risk #5** — list any isolation gap found along the way (test-plan §3 note).

Oracle for every expectation: PRD Business Logic (`context/foundation/prd.md:109-115`), FR-003/004/007/010/011/012 — not the code.

## Summary

- **Transitions are enforced in exactly one server-side place: the TypeScript service** `changeApplicationStatus` (`src/lib/services/applications.ts:107-111`) calling `checkTransition` (`src/lib/domain/status.ts:25-41`). The SQL function `change_application_status` persists whatever it is given — by design (`supabase/migrations/20260930150000_atomic_writes.sql:4`, body `:18-29`). It checks only that the status is still `p_from`.
- **Confirmation lives only in the service**: form field `confirm=true` → zod `z.literal("true").optional()` → `confirmed` → `needs_confirmation` (409) when missing. It never reaches SQL; only `is_revert` is stored.
- **The database does not stop a trace-less change.** The `authenticated` role holds full table privileges on all six domain tables (verified on the local stack, see below). The `applications` and `notes` update policies only check ownership (`create_applications.sql:50-53`). So a signed-in owner calling PostgREST directly with the publishable key can:
  - change `status` (including backward) or any field with no history row;
  - set `notes.deleted_at = null`;
  - insert made-up history rows.
    This is the owner tampering with their own data, not a cross-user leak. It still contradicts "every change leaves a trace" at the database level. Today no test pins it either way.
- **Every app route that changes an application or note goes through a trace function**, with one exception: note removal is a direct `update notes set deleted_at` (`src/lib/services/notes.ts:68`). That is acceptable — `deleted_at` itself is the trace (FR-010). Application create (`applications.ts:78`) and CV upload (`cv.ts:13`) are direct inserts that need no trace.
- **Ordering is computed once, server-side, in TypeScript** (`sortApplications`, `status.ts:63-70`, called at `applications.ts:136`). There is no SQL `ORDER BY` and no `.limit()`. The dashboard hides non-matching rows instead of re-sorting. "Most recent activity" is a stored column `last_activity_at`, set in exactly two places: `change_application_status` and `add_note` (including the rate note inside `update_application`). In both it is set to `now()`, not to the note's `noted_at`.
- **Coverage today:**
  - Unit tests cover the transition rule well, but not exhaustively.
  - Smoke covers 5 status moves over HTTP.
  - pgTAP covers 2 status cases and update/rollback.
  - **Nothing anywhere** asserts:
    - the rendered list order;
    - `last_activity_at` maintenance;
    - `is_revert` / "(cofnięcie)";
    - `note_revisions` content;
    - `set_application_cv` at the SQL layer;
    - the PostgREST bypass.
  - One smoke isolation step passes for the wrong reason (details below).
- **Product questions for the owner:**
  - Is active → Accepted from Sent/HR contact/Interviews a valid "forward" move?
  - Should "latest note" mean `noted_at` or insertion time?
  - Should the database (not just TS) refuse trace-less writes?

## Detailed Findings

### 1. Transition rule per layer (risk #3)

**Domain** — `src/lib/domain/status.ts`

- Statuses: active `sent, hr_contact, interviews, offer`; terminal `accepted, rejected, withdrawn`; closed `rejected, withdrawn` (`:5-7`).
- `PIPELINE = [sent, hr_contact, interviews, offer, accepted]` (`:10`) — Accepted is treated as the step after Offer.
- `checkTransition` applies these checks in order (`:25-41`):
  1. same status → refused;
  2. from terminal → `revert`, `requiresConfirmation: true`, to any other status;
  3. to rejected/withdrawn → `close`;
  4. later in PIPELINE → `forward`;
  5. anything else → refused.
- `allowedTargets` (`:43-50`) drives the UI select.

**Comparison with the PRD** (`prd.md:111-113`):

| PRD rule                                                                        | Code (`status.ts`)                                                                                                                                                                                     | Verdict                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Forward moves incl. skipping                                                    | `:37-39`                                                                                                                                                                                               | matches                                     |
| Any active → Rejected / Withdrawn                                               | `:34-36`                                                                                                                                                                                               | matches                                     |
| Terminal → any other status (incl. terminal), only after confirmation, recorded | `:31-33` + `is_revert`                                                                                                                                                                                 | matches                                     |
| Any other move refused (e.g. Offer → Sent)                                      | `:40`                                                                                                                                                                                                  | matches                                     |
| How Accepted is reached                                                         | PRD lists Accepted as terminal and does not say which active statuses lead to it. Code allows **every** active → Accepted with no confirmation (e.g. Sent → Accepted, asserted at `status.test.ts:11`) | **open product question**                   |
| X → X                                                                           | refused (`:26-28`); PRD silent                                                                                                                                                                         | consistent with "any other move is refused" |

PRD tension, informational only: cut-list item `prd.md:140` ("reverting a terminal status" as a contingency cut). Not cut; code implements `prd.md:113`.

**API** — `src/pages/api/applications/[id]/status.ts`

- 401 without a user (`:10-12`).
- Reads form `status` and `confirm` (`:14-18`) and passes `confirm === "true"` (`:30`).
- Error mapping (`:7`, `:33`): `not_allowed` → 400; `needs_confirmation` → 409 with `requiresConfirmation: true`; `conflict` → 409; `not_found` → 404.
- No `isUuid` guard on the id (other routes have one). A malformed id probably produces 500 — inferred, not run.

**Service** — `src/lib/services/applications.ts:93-128`

- Reads the current status (`:99-105`), then `checkTransition` (`:107`).
- Refusal → `not_allowed` (`:108`); confirmation required but absent → `needs_confirmation` (`:109-111`).
- RPC with `p_from: current.status`, `p_is_revert: kind === "revert"` (`:115-121`); `false` → `conflict`.
- zod schema: `confirm: z.literal("true").optional()` (`applications.ts:84-87`). Any other value (e.g. `"false"`) → 400.

**SQL** — `change_application_status` (`atomic_writes.sql:8-30`)

- `SECURITY INVOKER`.
- Runs `update … set status = p_to, last_activity_at = now() where id = … and status = p_from`, then inserts `status_changes(from, to, is_revert)`.
- No transition table, no confirmation parameter, and `p_is_revert` is whatever the caller passes.
- A direct RPC call, e.g. `{p_from:'offer', p_to:'sent', p_is_revert:false}` or `{X→X}`, succeeds and writes history.
- Execute is granted to `authenticated` only (`:131,135`).

**UI** — `src/components/applications/StatusControl.tsx`

- Options come from `allowedTargets(status)` (`:15`). The terminal group is labelled "Cofnij na (wymaga potwierdzenia)" (`:67`).
- A revert asks via native `window.confirm` (`:18-25`); the request adds `confirm=true` only then (`:30`).
- On success → `window.location.reload()` (`:34`), so the server re-sorts the list. An error shows `data.error` (`:37-38`).
- Used on `dashboard.astro:132` and `applications/[id]/index.astro:97`.

**Other status writers**

- Create: `createApplicationSchema` has no `status` key, so the DB default is `sent` (`applications.ts:18-38`, `create_applications.sql:32`).
- `update_application` and `set_application_cv` do not touch `status`.
- The only other path is direct PostgREST (§3).

### 2. List ordering (risk #3)

- `listApplications` (`applications.ts:130-137`) runs `.select("*")` with no `.order()` / `.limit()`, then `sortApplications` (`status.ts:63-70`).
- Ranking (`STAGE_RANK`, `status.ts:53-61`): accepted 0, offer 1, interviews 2, hr_contact 3, sent 4, rejected 5, withdrawn 5. Within a rank, newest `last_activity_at` comes first. This matches the PRD order (`prd.md:115`).
- Rejected and Withdrawn share a rank and interleave by activity (PRD silent).
- Ties (same rank and same ms) keep PostgREST's unspecified row order, because the sort is stable and the input order is not defined.
- Dashboard (`src/pages/dashboard.astro`):
  - Loads the sorted list (`:17`) and renders all cards in that order (`:106-142`).
  - Non-matches get `hidden` (`:120`). Visible ones carry `data-testid="application-visible"` (`:113`).
  - The live filter script toggles `hidden` and never reorders (`:148-199`, toggle `:172-176`).
  - Closed applications: `line-through` (`:123`) and `opacity-50` (`:110`) via `isClosed`. Accepted is not crossed out, which is correct.
- **Row cap:** local `max_rows = 1000` (`supabase/config.toml:18`). Without SQL ordering, more than 1000 applications would return an arbitrary 1000 before sorting. The cloud setting was not checked. Not a risk at the ~300 demo rows.

**`last_activity_at`** — stored column, `not null default now()` (`create_applications.sql:33`)

| Event                                 | Bumps activity?                                | Where                                                          |
| ------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| create                                | yes, default `now()`                           | `create_applications.sql:33`                                   |
| status change                         | yes, `now()`                                   | `atomic_writes.sql:20`                                         |
| add note                              | yes, `now()` (insert time, **not** `noted_at`) | `atomic_writes.sql:93-95`                                      |
| rate note inside `update_application` | yes                                            | `atomic_writes.sql` (rate-note branch of `update_application`) |
| field edit without a note             | no                                             | `update_application` sets only `updated_at`                    |
| note edit                             | no                                             | `edit_note`                                                    |
| note removal                          | no; the earlier bump stays                     | `notes.ts:68`                                                  |
| CV change                             | no                                             | `cv_files.sql:84-86`                                           |

PRD: "date of its most recent activity (latest note or status change)". Two deviations remain open questions:

- A backdated note (`noted_at` in the past) still lifts the application to the top of its stage.
- A removed note's bump persists.

### 3. Write paths and traces (risk #4)

React components never write to Supabase directly. They only `fetch` the API (`NotesPanel.tsx`, `ApplicationForm.tsx`, `StatusControl.tsx:32`, `CvPanel.tsx`, `CvLibrary.tsx`).

| Route                                  | Service                                        | Write                                            | Trace                                                   |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| POST `api/applications/index.ts`       | `createApplication` `applications.ts:78`       | direct insert                                    | none needed (FR-002)                                    |
| PATCH `api/applications/[id]/index.ts` | `updateApplication` `applications.ts:144`      | rpc `update_application`                         | `field_changes` (+ optional rate note), one transaction |
| POST `api/applications/[id]/status.ts` | `changeApplicationStatus` `applications.ts:93` | rpc `change_application_status`                  | `status_changes`                                        |
| POST `api/applications/[id]/notes.ts`  | `addNote` `notes.ts:11`                        | rpc `add_note`                                   | the note is the record                                  |
| PATCH `api/notes/[id].ts`              | `editNote` `notes.ts:43`                       | rpc `edit_note`                                  | `note_revisions`                                        |
| DELETE `api/notes/[id].ts`             | `removeNote` `notes.ts:62`                     | **direct** `update notes set deleted_at` (`:68`) | `deleted_at` is the trace (FR-010); a single statement  |
| POST `api/applications/[id]/cv.ts`     | `setApplicationCv` `cv.ts:68`                  | rpc `set_application_cv`                         | `field_changes` field `cv` (`cv_files.sql:88-89`)       |
| POST `api/cv/index.ts`                 | `uploadCv` `cv.ts:13`                          | storage upload + direct insert `cv_files`        | none needed (library add)                               |

- `update_application` persists the `p_changes` computed in TypeScript. A direct RPC with `p_changes='[]'` changes fields without a trace.
- `editNote` refuses a removed note in the service (`notes.ts:45`) and in SQL (`atomic_writes.sql`, `deleted_at is null` in `edit_note`).
- `removeNote` is idempotent on an already removed note (`notes.ts:65`).
- UI for removed notes: `window.confirm` before removal (`NotesPanel.tsx:180`); `data-removed="true"` (`:213`); body crossed out (`:247`).

### 4. RLS, grants, bypass (risks #3, #4, #5)

- **Grants (observed):** on the local stack (`supabase_db_*` container, `information_schema.role_table_grants`), `authenticated` holds `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` on all six tables:
  - `applications`
  - `notes`
  - `status_changes`
  - `field_changes`
  - `note_revisions`
  - `cv_files`

  No migration revokes them, except on `keepalive` (`20261004120000_keepalive.sql:16`). The cloud project was not queried. Its migrations are the same, so the same default grants are expected (inference).

- **Policies:**
  - `applications`: select/insert/update own (`create_applications.sql:42-53`).
  - `notes`: select/insert/update own (`create_notes.sql`).
  - History tables: select/insert own, no update.
  - No delete policy anywhere — a delete affects 0 rows (consistent with CLAUDE.md).
- **Resulting owner-level bypass** (not tested, inferred from grants and policies):
  - `PATCH /rest/v1/applications` can change `status`/fields with no history.
  - `PATCH /rest/v1/notes` can rewrite `body` with no revision, or un-remove a note.
  - `POST` to the history tables can forge entries.
  - Direct RPC calls can skip the transition rule (§1).
  - Cross-user access is still blocked by RLS.
- **Functions:** all five trace functions are `SECURITY INVOKER`, `search_path=''`, and none checks `auth.uid()`. Ownership comes from RLS: an invisible row means `not found` → false. `set_application_cv` looks up the new CV through RLS (`cv_files.sql:78`), so another user's CV id → false.

### 5. Existing test coverage

**Unit** — `src/lib/domain/status.test.ts`

Expectations are hand-written examples in PRD wording, not derived from `STAGE_RANK`/`PIPELINE`. They do encode the code's Sent → Accepted reading (`:11`).

- `checkTransition` block (`:5-46`):
  - forward: sent→hr_contact, sent→interviews, hr_contact→offer, offer→accepted, sent→accepted;
  - close: sent→rejected, interviews→withdrawn, offer→rejected;
  - backward refused: offer→sent, interviews→hr_contact, hr_contact→sent;
  - revert with confirmation: rejected→interviews, withdrawn→sent, accepted→offer, rejected→withdrawn, accepted→withdrawn;
  - same status refused.
- `allowedTargets` (`:48-64`): from interviews and from rejected.
- `sortApplications` (`:67-98`): one mixed list with all 7 statuses, plus a no-mutation test.
- Missing:
  - an exhaustive 7×7 matrix from the PRD;
  - an activity tie;
  - a newer item in a lower stage;
  - rejected older than withdrawn (cannot distinguish interleaving from grouping).

**pgTAP** — `supabase/tests/atomic_writes.test.sql`

- `change_application_status`: success + 1 history row (`:19-23`); stale `p_from` → false, nothing written (`:25-34`).
- `update_application`: rollback when the log insert fails (`:37-52`); 1 `field_changes` row (`:55-68`); stale `updated_at` refused (`:70-77`).
- `edit_note`: "succeeds" only (`:81-84`).
- Second user cannot change status (`:88-91`).
- Missing:
  - `set_application_cv` (no test at all);
  - `add_note` and the `last_activity_at` bumps;
  - `note_revisions` row content;
  - `is_revert`;
  - the direct-table bypass.

**Smoke** — `scripts/smoke.mjs`

- Status steps (`:209-223`), all HTTP codes only:
  - sent→interviews 200;
  - interviews→sent 400;
  - →rejected 200;
  - rejected→offer without confirm 409 `requiresConfirmation`;
  - with `confirm=true` 200.
- Notes: add, edit + "Poprzednie wersje" (`:257`), remove (`:258`) + `data-removed="true"` (`:259`).
- Rate change logged and crossed out; CV attach + "CV:" in the log.
- Second-user isolation:
  - list and details;
  - add note;
  - edit application;
  - CV library and download;
  - attach CV;
  - edit note.
- Missing:
  - any check that the details history shows the status change or "(cofnięcie)";
  - same-status moves, terminal→terminal, and offer→accepted;
  - dashboard order.
- **False-positive isolation step:** "second user cannot edit the first user's note" (`:405-410`) runs after the owner removed that note (`:258`). The service returns 404 for any removed note (`notes.ts:45`), so the 404 does not prove RLS isolation.

**E2E** — `tests/e2e/`

- Only `seed.spec.ts` (sign-in) and `call-phone-search.spec.ts`. No status, notes or ordering tests.

### 6. Gaps by risk (input for the plan)

**Risk #3**

- No exhaustive PRD-oracle transition matrix (unit).
- No HTTP coverage for X→X, terminal→terminal, offer→accepted, or a bad `confirm` value.
- No check that a revert is recorded with `is_revert` / "(cofnięcie)".
- No test that the rendered dashboard order follows the PRD (data → SQL → service → HTML).
- No test that `last_activity_at` is bumped by a status change / note and not by an edit.
- The SQL/RLS layer does not enforce transitions. The plan must decide whether to pin current behaviour or harden it, which is a product/security decision.

**Risk #4**

- `set_application_cv` has no pgTAP test.
- `note_revisions` content (previous body/kind/`noted_at`) is never asserted.
- `add_note` and the rate note have no pgTAP assertion.
- The trace-less PostgREST paths are not pinned.

**Risk #5**

- The smoke note-edit isolation step is a false positive.
- Untested for a second user:
  - status change over HTTP;
  - note DELETE;
  - attaching the first user's CV to the second user's own application;
  - visibility of history rows.

## Code References

- `src/lib/domain/status.ts:25-41` — `checkTransition`
- `src/lib/domain/status.ts:53-70` — `STAGE_RANK`, `sortApplications`
- `src/lib/services/applications.ts:84-87` — zod `confirm`
- `src/lib/services/applications.ts:93-128` — the only server-side transition/confirmation guard
- `src/lib/services/applications.ts:130-137` — list query, no order/limit
- `src/pages/api/applications/[id]/status.ts:7-33` — error → HTTP mapping
- `src/components/applications/StatusControl.tsx:15-38` — targets, `window.confirm`, reload
- `src/pages/dashboard.astro:106-199` — render order, `hidden` filtering, crossed-out closed applications
- `src/pages/applications/[id]/index.astro:186` — "(cofnięcie)" marker
- `src/lib/services/notes.ts:45,62-68` — removed-note guard, direct removal
- `src/components/applications/NotesPanel.tsx:180,213,247` — removal confirm, `data-removed`, crossed-out body
- `supabase/migrations/20260930150000_atomic_writes.sql:4,8-30,93-95,131-138` — trust-the-caller functions, grants
- `supabase/migrations/20260929180000_create_applications.sql:32-53` — status default, `last_activity_at`, RLS
- `supabase/migrations/20261001090000_cv_files.sql:54-91` — `set_application_cv`
- `supabase/config.toml:18` — `max_rows = 1000`
- `supabase/tests/atomic_writes.test.sql` — existing pgTAP
- `scripts/smoke.mjs:209-223,257-259,405-410` — status steps, note steps, false-positive isolation step
- `src/lib/domain/status.test.ts:5-98` — unit coverage

## Architecture Insights

- Deliberate split, stated at `atomic_writes.sql:4`:
  - rules live in TypeScript (`src/lib/domain/`);
  - SQL functions only make "change + trace" atomic;
  - RLS only checks ownership.
- The guarantees therefore hold for traffic through the app's API routes, not for the database as a whole.
- Phase 2 tests must say which layer they prove. Integration tests via the API prove the rule. Direct PostgREST/RPC tests prove (or currently disprove) database-level enforcement.
- Ordering is a pure function over a denormalised `last_activity_at`. Correctness depends on every writer bumping it, which no test checks.

## Historical Context (from prior changes)

- Commit `921bd8b` "Add status transitions and importance ordering (PRD business rule)" introduced `status.ts` and its tests together. The unit oracle was written alongside the code; the test plan asks for a PRD-sourced oracle.
- Commit `a181f7e` "Make change-and-trace writes atomic via SQL functions" introduced `atomic_writes.sql` with its "rules stay in TypeScript" comment.
- `context/archive/2026-10-05-testing-call-scenario-browser/follow-ups/review-fixes.md`:
  - The E2E guards it asked for "before Phase 2 adds more data-writing E2E specs" were done in `context/archive/2026-10-05-e2e-local-guards/` — supported.
  - The Phase 2 E2E pattern can reuse `tests/e2e/support/local-admin.ts` (test-plan §6.3).
- No archived change researched status rules or ordering before (searched `context/archive/**`, `context/changes/**`).

## Related Research

- `context/archive/2026-10-05-testing-call-scenario-browser/research.md` — Phase 1 (search, sign-in); not about status rules.

## Open Questions

1. **Accepted reachability** — should Sent / HR contact / Interviews → Accepted be allowed without confirmation (current code), or only Offer → Accepted? The PRD (`prd.md:111-113`) does not say. Decides the oracle row.
2. **"Latest note" timestamp** — insertion time `now()` (current) or the note's `noted_at`? Should removing a note lower activity again? Decides the ordering oracle for backdated notes.
3. **Database-level enforcement** — is owner-only PostgREST/RPC tampering accepted (single-user app, own data), or should Phase 2 harden it? Hardening options include:
   - revoking `update` on `applications`/`notes` and `insert` on history tables from `authenticated`;
   - a SECURITY DEFINER path with `auth.uid()` checks;
   - a transition check in SQL.

   Hardening is a migration (`npx supabase db push` before push, per `lessons.md`) and is beyond pure testing.

4. **Rejected vs Withdrawn order and ties** — the PRD is silent; accept interleaving by activity?
5. Not verified: the cloud `max_rows` value and cloud table grants; the 500 on a malformed id at the status route.
