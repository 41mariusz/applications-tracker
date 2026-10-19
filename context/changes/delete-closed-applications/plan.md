# Delete Crossed-out Applications Implementation Plan

## Overview

Applications stay non-deletable by default. Once one is crossed out (status Rejected or Withdrawn), the owner can delete it permanently, together with its notes, note versions, status history and field history. CV files stay in the library. This gives the app a real "D" for the 10xBuilder CRUD requirement (owner decision 2026-10-19, `change.md`), while the "no lost agreements" guardrail still protects every active application.

## Current State Analysis

- **What the docs say today:**
  - PRD FR-004 says an application is never deleted, only crossed out as Withdrawn (`context/foundation/prd.md:70-72`).
  - CLAUDE.md's hard rule says: "Nothing is deleted … no delete RLS policies".
- **RLS on `applications`:** it has only `select`, `insert` and `update` policies (`supabase/migrations/20260929180000_create_applications.sql:42-53`).
- **Cascades already in place:** `notes`, `note_revisions`, `status_changes` and `field_changes` reference `applications` (or `notes`) with `on delete cascade` (`20260930090000_create_notes.sql:9,44`, `20260929190000_create_status_changes.sql:6`, `20260930120000_create_field_changes.sql:6`).
- **CV files are independent:** `cv_files` holds the files. An application only points at one, so deleting an application leaves the file in place (FR-013: CV files are never deleted).
- **Closed statuses:** `CLOSED_STATUSES = ["rejected", "withdrawn"]` in `src/lib/domain/status.ts:7`. These are the statuses the list shows crossed out at the bottom (PRD Ordering).
- **Patterns to follow:**
  - API route: `src/pages/api/applications/[id]/status.ts`: 401 check, `routeId`, zod or form parsing, `failureResponse`. The file `[id]/index.ts` exports only `PATCH`.
  - Confirmation: `StatusControl.tsx` uses `window.confirm` with a Polish message, then `apiRequest` and a reload.
  - Services in `src/lib/services/applications.ts` return `{ ok } | { ok: false, code, message }`.
- **Migration lint:** `scripts/check-migrations.mjs` flags restrictive policies, `alter policy` and drops. A new permissive `create policy … for delete` is additive. The previous code version never deletes, so it still works on the new schema.

## Desired End State

- **In the UI:** a Rejected or Withdrawn application's details page shows "Usuń trwale". After a confirmation that names the company and what is lost, it deletes the application and returns to `/dashboard`, where the row is gone.
- **Active applications:** they show no delete control, and both `DELETE /api/applications/[id]` and the database refuse to delete them.
- **Docs:** PRD and CLAUDE.md state the new rule.

### Key Discoveries:

- The database is the real guard. The RLS delete policy `using (user_id = auth.uid() and status in ('rejected','withdrawn'))` holds even when the API is bypassed. A delete of an active row then affects 0 rows; it does not raise an error.
- Telling "not found" from "not closed" needs one read before the delete. The race is safe: if the status changes in between, RLS still refuses.

## What We're NOT Doing

- No deletion of CV files (FR-013 stays).
- No tombstone or deletion log (owner decision: nothing remains).
- No bulk delete and no delete from the list view; deletion happens on the details page only.
- No undo or trash.
- No change to note removal (`deleted_at` soft delete stays).

## Implementation Approach

1. Guard first, in the database (RLS plus pgTAP).
2. Then the pure rule, the service and the route, with the smoke extended.
3. Then the UI with E2E, and the docs that change the documented rule.

## Phase 1: Database Guard

### Overview

Allow `delete` on `applications` only for the owner's closed rows, and prove it with pgTAP.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261019120000_delete_closed_applications.sql`

**Intent**: The only path to a hard delete, limited to crossed-out applications.

**Contract**: `create policy "applications_delete_own_closed" on public.applications for delete to authenticated using (user_id = (select auth.uid()) and status in ('rejected', 'withdrawn'));`. A comment states the owner decision and the cascade. Grant `delete` to `authenticated` if the table does not already have it (check the existing grants in the migrations or by pgTAP). It must pass `npm run lint` with no allow-markers.

#### 2. pgTAP test

**File**: `supabase/tests/delete_closed_applications.test.sql`

**Intent**: Pin the guard.

**Contract**: as user A (`set local role authenticated` plus a JWT claim, following the existing tests):

- deleting A's withdrawn application removes it and its notes, note versions, status changes and field changes;
- deleting A's rejected application works;
- deleting A's active application (`sent`) affects 0 rows and the row stays;
- deleting B's withdrawn application as A affects 0 rows;
- after deleting an application with a CV attached, its `cv_files` row still exists.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies all migrations cleanly on the local stack
- `npx supabase test db` passes, including `delete_closed_applications.test.sql`
- Removing the status condition from the policy (locally) makes the "active application stays" test fail; restoring makes it pass
- `npm run lint` passes (migration lint: no breaking statements)

---

## Phase 2: Rule, Service and API

### Overview

Add a pure `canDelete` rule, a service call and `DELETE /api/applications/[id]`, and extend the smoke.

### Changes Required:

#### 1. Rule

**File**: `src/lib/domain/status.ts`, `src/lib/domain/status.test.ts`

**Intent**: One named rule the UI and the route share.

**Contract**: `export function canDelete(status: ApplicationStatus): boolean` is true exactly for `CLOSED_STATUSES`. The test covers every status: only `rejected` and `withdrawn` are true.

#### 2. Service

**File**: `src/lib/services/applications.ts`

**Intent**: Delete with a clear outcome.

**Contract**:

- `deleteApplication(supabase, id)` returns `{ ok: true } | { ok: false; code: "not_found" | "not_closed"; message: string }`.
- It reads the row's status first: missing gives `not_found`; `!canDelete` gives `not_closed`.
- It then deletes with `.delete().eq("id", id).select("id")`. Zero rows deleted gives `not_closed` (the status changed in between, and RLS refused).
- Supabase errors go through `toServiceError`.
- Polish messages: "Nie znaleziono aplikacji." and "Usunąć można tylko aplikację odrzuconą lub wycofaną."

#### 3. Route

**File**: `src/pages/api/applications/[id]/index.ts`

**Intent**: The HTTP surface, following `status.ts`.

**Contract**:

- `export const DELETE: APIRoute`: 401 without `locals.user`, then `routeId`.
- Results: 204 on ok, 404 on `not_found`, 409 on `not_closed` (`{ error }`).
- Failures go through `failureResponse` with `op: "application.delete"`.
- `prerender = false` is already present.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: The end-to-end proof that CLAUDE.md requires for each user-facing feature.

**Contract**: new steps:

- an active application gets 409 on `DELETE` and still opens;
- after a move to Withdrawn, `DELETE` gives 204, and its details page gives 404;
- a second `DELETE` gives 404;
- another user's withdrawn application gives 404 (isolation; RLS hides it).

The CLAUDE.md `npm run smoke` description gets "permanent delete of crossed-out applications".

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including the `canDelete` cases
- `npx astro check` passes
- `npm run lint` passes
- `npm run smoke` passes against a local preview (`BASE_URL=http://localhost:4321`, local `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`)

---

## Phase 3: UI, E2E and Docs

### Overview

Show the delete control on crossed-out applications only, prove it in a browser, and change the documented rule.

### Changes Required:

#### 1. Delete control

**File**: `src/components/applications/DeleteApplicationButton.tsx`, `src/pages/applications/[id]/index.astro`

**Intent**: A clear, confirmed, permanent action, on the details page only.

**Contract**:

- A React island rendered only when `canDelete(application.status)`.
- A `Button`, outline variant, with the destructive text token (the rule is: do not use the `destructive` variant as is) and `min-h-10`. Its label is "Usuń trwale".
- `window.confirm` asks `Usunąć trwale aplikację „<company>”? Notatki i historia zmian zostaną usunięte bez możliwości przywrócenia. Plik CV zostanie w bibliotece.`
- On confirm, it calls `apiRequest` with `DELETE` (`op: "application.delete"`). On ok it navigates with `window.location.assign("/dashboard")`. On error it shows `ErrorText`.
- Tokens only: the view stays clean under `check-ui-literals`.

#### 2. Kitchen sink

**File**: `src/pages/dev/ui.astro`

**Intent**: The details view's components are shown in their states.

**Contract**: the delete control appears next to a withdrawn application's sample, and the disabled/pending state is covered.

#### 3. E2E

**File**: `tests/e2e/delete-closed.spec.ts`

**Intent**: The browser-level proof.

**Contract**:

- An active application shows no "Usuń trwale".
- After moving it to Wycofana (withdrawn), the button appears.
- Dismissing the confirm keeps the application.
- Accepting it lands on `/dashboard`, without that company.
- It follows the existing specs' setup (`auth.setup.ts`, `support/`).

#### 4. Docs

**File**: `context/foundation/prd.md`, `CLAUDE.md`

**Intent**: The rule as decided.

**Contract**:

- **PRD:** a dated "Update 2026-10-19" under FR-004: deletion is allowed only for Rejected or Withdrawn, it is permanent, it takes notes and history with it, and CV files stay. The Statuses line in Business Logic mentions it.
- **CLAUDE.md:** the "Nothing is deleted" hard rule becomes "nothing is deleted, except that a crossed-out (Rejected/Withdrawn) application can be deleted permanently from its details page (RLS delete policy limited to those statuses; cascades remove notes and history; CV files stay)".

### Success Criteria:

#### Automated Verification:

- `npx playwright test tests/e2e/delete-closed.spec.ts` passes (local preview, local Supabase)
- `npm run lint` passes (incl. `check-ui-literals`)
- `npx astro check` and `npm test` pass

#### Manual Verification:

- Owner runs `npx supabase db push` (the new migration), then pushes; CI deploys
- In production the owner withdraws one `[TEST]` application, deletes it from its details page, and sees it gone from the list; an active one shows no delete control

---

## Testing Strategy

### Unit Tests:

- `canDelete` covers every status.

### Integration Tests:

- **pgTAP:** the RLS guard, the cascades, the CV kept, and isolation between users.
- **Smoke:** 409, 204, 404, and isolation.

### Manual Testing Steps:

1. Withdraw, then delete, a `[TEST]` application in production.
2. Check that an active one has no delete control.

## Performance Considerations

None. It is one read and one delete by primary key.

## Migration Notes

The change is additive (a new permissive policy), so the previous code version works unchanged on the new schema. The owner runs `npx supabase db push` before `git push`; otherwise the deploy gate blocks.

## References

- Owner decision: `context/changes/delete-closed-applications/change.md`
- PRD FR-004: `context/foundation/prd.md:70-72`
- Patterns: `src/pages/api/applications/[id]/status.ts`, `src/components/applications/StatusControl.tsx`, `src/lib/domain/status.ts:7`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database Guard

#### Automated

- [x] 1.1 `npx supabase db reset` applies all migrations cleanly on the local stack — 5d0de1b
- [x] 1.2 `npx supabase test db` passes, including `delete_closed_applications.test.sql` — 5d0de1b
- [x] 1.3 Removing the status condition from the policy (locally) makes the "active application stays" test fail; restoring makes it pass — 5d0de1b
- [x] 1.4 `npm run lint` passes (migration lint: no breaking statements) — 5d0de1b

### Phase 2: Rule, Service and API

#### Automated

- [x] 2.1 `npm test` passes, including the `canDelete` cases
- [x] 2.2 `npx astro check` passes
- [x] 2.3 `npm run lint` passes
- [x] 2.4 `npm run smoke` passes against a local preview (`BASE_URL=http://localhost:4321`, local `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`)

### Phase 3: UI, E2E and Docs

#### Automated

- [ ] 3.1 `npx playwright test tests/e2e/delete-closed.spec.ts` passes (local preview, local Supabase)
- [ ] 3.2 `npm run lint` passes (incl. `check-ui-literals`)
- [ ] 3.3 `npx astro check` and `npm test` pass

#### Manual

- [ ] 3.4 Owner runs `npx supabase db push` (the new migration), then pushes; CI deploys
- [ ] 3.5 In production the owner withdraws one `[TEST]` application, deletes it from its details page, and sees it gone from the list; an active one shows no delete control
