# E2E local guards — Implementation Plan

## Overview

Make the Playwright suite refuse to run unless the app under test talks to the local Supabase, and make the call spec's cleanup unable to leave rows behind. Follow-up F6 from the implementation review of `testing-call-scenario-browser` (`context/archive/2026-10-05-testing-call-scenario-browser/reviews/impl-review.md`, `follow-ups/review-fixes.md`). Done before test-plan Phase 2 adds more data-writing E2E specs.

## Current State Analysis

- **Env lookup of the e2e build (verified in `node_modules/wrangler/wrangler-dist/cli.js:179312-179392`):** with `CLOUDFLARE_ENV=e2e`, wrangler reads `.dev.vars.e2e`, then `.dev.vars`; only if neither exists it falls back to `.env`, `.env.local`, `.env.e2e`, `.env.e2e.local`.
  - Locally there is no `.dev.vars`, and `.env` holds the **production** `SUPABASE_URL`. Without `.dev.vars.e2e` the app under test would therefore use production.
  - In CI both `.dev.vars` and `.dev.vars.e2e` are written from the job's local Supabase (`.github/workflows/ci.yml`, smoke job), so CI is safe.
- **Reused server:** `playwright.config.ts` sets `reuseExistingServer: !process.env.CI`. Locally, a server already listening on 4321 is used as-is, whatever backend it was built against.
- **Existing guards:**
  - `tests/e2e/support/local-admin.ts:5-11` refuses non-local hosts, but only for the **cleanup** URL (`E2E_SUPABASE_URL`).
  - The E2E user exists only in local Supabase, so signing in against production fails. That failure only shows up as a `toPass` timeout in `tests/e2e/auth.setup.ts`.
- **Session cookie:** `@supabase/ssr` names it `sb-<first label of the Supabase host>-auth-token`, optionally chunked as `.0`, `.1`. For local Supabase that is `sb-127-auth-token` (seen in `playwright/.auth/user.json`); for production it is `sb-qtfrxgapmpzxbaotjkze-auth-token`. So the cookie identifies the backend the **running app** actually uses.
- **Cleanup:** `tests/e2e/call-phone-search.spec.ts:12-17` deletes ids one after another.
  - If one delete throws, the following ids are not deleted.
  - When the test fails before both creates, `toHaveLength(2)` adds a second, misleading error.

## Desired End State

- A local `npx playwright test` without `.dev.vars.e2e`, or with a non-local `SUPABASE_URL` in it, stops before the build with a message that names the file and how to fix it.
- If the signed-in app sets a session cookie for any non-local Supabase project, for whatever reason (including a reused server), the `setup` project fails with a clear message and no session is saved, so no spec runs.
- The call spec's cleanup attempts every created id, asserts each delete, and checks the "2 applications" count only when the test body passed. A run that fails mid-way leaves no `[E2E]` rows.
- CI behaves as today and stays green.

### Key Discoveries:

- The fallback order above makes a missing `.dev.vars.e2e` silently mean "production" locally. This is the core risk.
- The cookie prefix is a runtime fact of the app under test, so it covers the reused-server path that a file check cannot.
- Project rule (CLAUDE.md, memory): never swap or overwrite `.env` for tests. Verification renames `.dev.vars.e2e` and restores it by absolute path.

## What We're NOT Doing

- Not changing `reuseExistingServer`. It stays on locally; the cookie check covers it (owner's decision).
- Not changing app code, `.env`, or the CI workflow.
- Not adding an `[env.e2e]` section to `wrangler.jsonc`. The warning is harmless and outside this risk.
- Not guarding `scripts/smoke.mjs` or `scripts/demo-data.mjs`. Different tools with their own rules.
- Not deleting by tag/prefix in bulk. Cleanup stays id-based.

## Implementation Approach

Two small, independent phases, each verified by a deliberate break.

- **Phase 1** adds a fail-fast file check in the Playwright config (local only) and a runtime cookie check at the end of the auth setup.
- **Phase 2** hardens the call spec's `afterEach`.

## Critical Implementation Details

- The config check must be skipped in CI (`process.env.CI`). CI writes `.dev.vars.e2e` in an earlier step, and the check must not depend on file timing there.
- Treat a host as local only when it is exactly `127.0.0.1` or `localhost`, the same predicate as `local-admin.ts`.
- **Cookie rule:**
  - Allowed: every cookie whose name matches `^sb-.+-auth-token(\.\d+)?$` has the ref `127` or `localhost`.
  - Required: at least one such cookie exists after sign-in.
  - Run the check before `storageState({ path })`, so a failing check leaves no session file.

---

## Phase 1: The app under test must use local Supabase

### Overview

Fail fast on a missing or non-local `.dev.vars.e2e` (local runs), and verify the session cookie of the running app after sign-in (all runs).

### Changes Required:

#### 1. Fail-fast file check

**File**: `playwright.config.ts`

**Intent**: Before Playwright builds or reuses a server, refuse a local run whose e2e Worker env would not point at local Supabase. Otherwise wrangler falls back to `.env` (production).

**Contract**:

- When `!process.env.CI`: `.dev.vars.e2e` must exist and its `SUPABASE_URL` host must be `127.0.0.1` or `localhost`.
- Otherwise throw an `Error` naming `.dev.vars.e2e`, the reason (missing, or the host found), and the fix: copy the local `API_URL`/`ANON_KEY` from `npx supabase status`.
- Never print key values.

#### 2. Runtime cookie check

**File**: `tests/e2e/auth.setup.ts` (shared helper in `tests/e2e/support/` if it reads better)

**Intent**: After a successful sign-in, prove the app under test (built fresh or reused) uses local Supabase, before the session is saved for every spec.

**Contract**: The Critical Implementation Details cookie rule. On violation, throw with the offending project ref (never cookie values), before `storageState({ path })`.

#### 3. Docs

**Files**: `context/foundation/test-plan.md` §6.3, `.env.example`

**Intent**: Record the two guards and the env fallback so the next spec author knows why the run stops.

**Contract**:

- §6.3 gets one bullet: the guards, and that without `.dev.vars.e2e` wrangler falls back to `.env` (production).
- `.env.example` lists `E2E_SUPABASE_URL=` and `E2E_SUPABASE_SERVICE_ROLE_KEY=` (local only) next to the existing `E2E_*` lines.

### Success Criteria:

#### Automated Verification:

- `npx playwright test` passes with the current local setup
- With `.dev.vars.e2e` temporarily renamed (restored by absolute path), `npx playwright test` stops before the build with the `.dev.vars.e2e` message
- With the allowed cookie ref temporarily changed so `127` is rejected, the `setup` project fails with the cookie message and `playwright/.auth/user.json` is not rewritten; the change is reverted
- `npm run lint` passes and `npx astro check` reports 0 errors

#### Manual Verification:

- Both error messages are clear enough to fix the setup without reading code

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Cleanup that cannot strand rows

### Overview

Make the call spec's `afterEach` delete every created application independently and report failures honestly.

### Changes Required:

#### 1. Independent, asserted cleanup

**File**: `tests/e2e/call-phone-search.spec.ts`

**Intent**: One failing delete must not skip the others, and a failed test must not get a second, misleading "2 ids" error on top of its real one.

**Contract**:

- Delete all ids with `Promise.allSettled(ids.map(id => deleteApplication(request, id)))`, then assert every result is fulfilled. The message lists failed ids and reasons.
- Assert `ids` has length 2 only when `test.info().status === test.info().expectedStatus` (the body passed).
- `deleteApplication` stays as is: one id, asserts exactly one row.

### Success Criteria:

#### Automated Verification:

- `npx playwright test tests/e2e/call-phone-search.spec.ts` passes
- With a temporary `throw` right after the two creates, the spec fails only with that error (no "2 ids" error), and a lookup in local Supabase finds no `[E2E] Call/Decoy` rows afterwards; the throw is reverted
- `npx playwright test` passes and `npm run lint` passes

#### Manual Verification:

- The CI `smoke` job on the PR passes (E2E step green)

**Implementation Note**: Pause for manual confirmation before closing the change.

---

## Testing Strategy

### Unit Tests:

- None. The guards are test-infrastructure checks proven by deliberate breaks, and Vitest only collects `src/**/*.test.ts`.

### Integration Tests:

- The existing E2E suite (`setup`, `seed`, `call-phone-search`) locally and in CI.

### Manual Testing Steps:

1. Rename `.dev.vars.e2e`, run `npx playwright test`, read the message, then restore the file.
2. Run the suite normally; it passes.

## Performance Considerations

None. A file read at config load and a cookie scan after sign-in.

## Migration Notes

None.

## References

- Review finding F6: `context/archive/2026-10-05-testing-call-scenario-browser/reviews/impl-review.md`, `follow-ups/review-fixes.md`
- Wrangler env lookup: `node_modules/wrangler/wrangler-dist/cli.js:179312-179392`
- Existing guard: `tests/e2e/support/local-admin.ts:5-11`
- Files: `playwright.config.ts`, `tests/e2e/auth.setup.ts`, `tests/e2e/call-phone-search.spec.ts:12-17`
- Test plan: `context/foundation/test-plan.md` §6.3

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: The app under test must use local Supabase

#### Automated

- [x] 1.1 `npx playwright test` passes with the current local setup — 1a0c9d2
- [x] 1.2 With `.dev.vars.e2e` temporarily renamed (restored by absolute path), `npx playwright test` stops before the build with the `.dev.vars.e2e` message — 1a0c9d2
- [x] 1.3 With the allowed cookie ref temporarily changed so `127` is rejected, the `setup` project fails with the cookie message and `playwright/.auth/user.json` is not rewritten; the change is reverted — 1a0c9d2
- [x] 1.4 `npm run lint` passes and `npx astro check` reports 0 errors — 1a0c9d2

#### Manual

- [x] 1.5 Both error messages are clear enough to fix the setup without reading code — 1a0c9d2

### Phase 2: Cleanup that cannot strand rows

#### Automated

- [x] 2.1 `npx playwright test tests/e2e/call-phone-search.spec.ts` passes — 7475121
- [x] 2.2 With a temporary `throw` right after the two creates, the spec fails only with that error (no "2 ids" error), and a lookup in local Supabase finds no `[E2E] Call/Decoy` rows afterwards; the throw is reverted — 7475121
- [x] 2.3 `npx playwright test` passes and `npm run lint` passes — 7475121

#### Manual

- [x] 2.4 The CI `smoke` job on the PR passes (E2E step green) — 7475121
