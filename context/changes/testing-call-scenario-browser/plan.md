# Call scenario in the browser (test rollout Phase 1) — Implementation Plan

## Overview

Finish rollout Phase 1 of `context/foundation/test-plan.md` (risks #1 and #6). Playwright and two browser tests already exist. This plan adds the phone-format test matrix with PRD FR-005 as the oracle, fixes the two search gaps that matrix exposes (a number typed with 48 but no "+", and the transient "Brak wyników" while only a prefix is typed), makes the risk #1 E2E type one key at a time, runs E2E in CI and updates the test plan.

## Current State Analysis

- **Already done since the research (`326e84d`):** `376b511` set up Playwright: `playwright.config.ts` runs build + preview with `CLOUDFLARE_ENV=e2e` (Worker env from the gitignored `.dev.vars.e2e`, i.e. local Supabase), the `setup` project signs in once (`tests/e2e/auth.setup.ts`), and `tests/e2e/seed.spec.ts` protects risk #6 (signing in from `/cv` lands on that page and survives a reload). `9cbc00e` added `tests/e2e/call-phone-search.spec.ts` for risk #1: it fills `+48 5xx xxx xxx` in one go, against an offer stored as `5xx-xxx-xxx` plus a decoy, and asserts the salary range and quoted rate on the details page. Cleanup goes through `tests/e2e/support/local-admin.ts`, which uses the local service-role key and refuses non-local hosts.
- **Search rule** (`src/lib/domain/search.ts:25-59`), shared by the server (`?q=`) and the live filter (`src/pages/dashboard.astro:148-199`):
  - `normalizePhone` removes a leading `+48`/`0048`, keeps only digits, and drops a leading `48` only when there are exactly 11 digits.
  - A phone-only query needs at least 3 digits and matches as a substring.
  - Result: `48 600 1` finds nothing until all 11 digits are typed, and `+48`, `+48 6`, `0048`, `004` and `60` show 0 results plus "Brak wyników" (`dashboard.astro:99-101`).
- **Unit tests** (`src/lib/domain/search.test.ts:50-61`) cover one stored format (`+48 600 100 200`) typed six ways, and assert `matchesQuery(acme, "60") === false`, which the agreed behaviour reverses.
- **CI** (`.github/workflows/ci.yml:24-62`): the `smoke` job runs local Supabase, `supabase test db`, a build, preview on 4321 in the background, and `npm run smoke`. No E2E step. Test plan §5 makes "e2e in a browser on the call scenario" a required CI gate after Phase 1.
- **Test plan:** §6.3 "Adding an e2e test" is TBD. The §4 stack row says "none yet". §3 shows Phase 1 as `researched`. The research's Open Question 3 asks for corrections to the §2 risk guidance.

## Desired End State

- While the owner types an offer's HR number in any format allowed by FR-005 (spaces, dashes, parentheses, `+48`, `0048`, or `48` without "+"), the offer stays on the list **after every keystroke**. "Brak wyników" appears only once the typed number is long enough and genuinely matches nothing.
- The unit matrix proves this for every stored format × every typed format × every prefix of the typed number. Expected results come from FR-005 and this plan, not from `normalizePhone`.
- The risk #1 E2E proves the same live, key by key, in Chromium against the production build.
- CI runs the whole E2E suite (`setup`, `seed`, `call-phone-search`) in the `smoke` job, so a failing E2E blocks deploy.
- `test-plan.md` explains how to add an E2E test (§6.3), lists Playwright in §4, includes the research corrections in §2, and shows Phase 1 as done once implemented.

### Key Discoveries:

- One function decides matches for both render paths (`dashboard.astro:27-31`, `:150-151`), so unit tests on `matchesQuery` protect the server and the browser. The E2E only has to prove the live wiring (`input` event → `apply()`).
- The "48 without +" gap: `normalizePhone` only drops `48` at exactly 11 digits (`search.ts:34`).
- The E2E company labels embed the phone digits (`call-phone-search.spec.ts:26-27`). Word matching also searches company names (`search.ts:53-59`), so the visible result today partly depends on the random digits.
- The decoy in the E2E uses `digits + 1`, so it shares every prefix except the last digit. It stays visible until the final key, which is a natural check that filtering really happens at the end.
- The smoke step starts `npm run preview -- --port 4321 &` and never stops it (`ci.yml:54`). In CI Playwright's `webServer` does not reuse an existing server (`reuseExistingServer: !process.env.CI`), so the two would clash on 4321.
- The sign-in form's email regex rejects domains without a dot (`SignInForm.tsx:24`), so the CI E2E user needs an address like `e2e@example.com`.

## What We're NOT Doing

- No change to how phones are stored (they stay raw), and no data migration.
- No change to word queries or mixed queries (`acme 60`). The "show all" rule applies only to queries made entirely of phone characters.
- No E2E for search combined with the status filter (FR-008). It isn't part of risk #1.
- No E2E for a paused database or for `?next=//evil.com`. Both are covered by the smoke test and `safeNextPath` unit tests (risk #5/#6 headers).
- No unit test for the pre-hydration reset of the sign-in inputs. The `auth.setup.ts`/`seed.spec.ts` retry guard already handles it; it only goes into the §2 notes.
- No agent hooks or E2E on every edit. That's test-plan Phase 4.
- No dedicated CI job for E2E. It reuses the `smoke` job's local Supabase.

## Implementation Approach

Phase 1 is test-first (`/10x-tdd`). Write the FR-005 matrix and the prefix (keystroke) cases, watch the two gap groups fail, then change the rule as little as possible. Phase 2 (`/10x-e2e`) turns the existing spec into a key-by-key check of the same rule in a real browser. Phase 3 (`/10x-implement`) wires the suite into CI and updates the test plan. Order matters: the key-by-key E2E fails without Phase 1's fix, and CI must run green tests.

## Critical Implementation Details

**The rule as a decision, with a boundary case.** For a query made only of phone characters (`PHONE_QUERY`):

- The **national reading** is the typed digits after removing a leading `+48`, a leading `0048`, or a leading `48` typed without "+". A query whose digits are only a beginning of `0048` (`0`, `00`, `004`) has an empty national reading.
- If the national reading has fewer than 3 digits, the query is **not a search yet**: every application matches.
- Otherwise an application matches if its normalised phone contains the national reading or, when `48` was dropped without "+", the full typed digits. (`486001` therefore finds both `600 1…` and a number containing `486001`.)

Boundary cases: `+48 60` → all; `+48 600` → only numbers containing `600`; `48 60` → all; `48 600` → numbers containing `600` or `48600`; `004` → all; `0048 6` → all; `60` → all; `700 100 200` → not `600 100 200`. Applications without a phone are included in "all" and never in a real phone match.

---

## Phase 1: Search rule and format matrix (unit, test-first)

### Overview

Prove FR-005 at the unit layer for stored × typed formats and for every keystroke, then fix the two gaps in `search.ts`.

### Changes Required:

#### 1. Format matrix and keystroke tests

**File**: `src/lib/domain/search.test.ts`

**Intent**: Replace the single-format case with a matrix whose expected results come from FR-005 and the rule above: every stored format of `600 100 200` is found by every typed format, and every prefix of each typed format keeps that application in the results. Rewrite the `"60"` assertion to the new behaviour and keep the real negatives.

**Contract**:

- Stored formats: `600 100 200`, `600-100-200`, `600100200`, `+48 600 100 200`, `+48600100200`, `0048 600 100 200`, `48600100200`, `(+48) 600 100 200`.
- Typed formats: `600 100 200`, `600-100-200`, `600100200`, `+48 600 100 200`, `+48600100200`, `0048 600 100 200`, `48 600 100 200`, `48600100200`.
- Keystrokes: for each typed format, each non-empty prefix matches.
- "Not a search yet": `+48`, `+48 6`, `0048`, `004`, `48`, `60` match an application without a phone too.
- Negatives at ≥ 3 national digits: `700 100 200`, `+48 700`, `48 700 1` do not match `600 100 200`; `600` does not match an application without a phone.
- Existing word and mixed cases (`tech 345`, `acme junior`) stay unchanged.

#### 2. Search rule

**File**: `src/lib/domain/search.ts`

**Intent**: Change only the phone-only branch of `matchesQuery`: work out the national reading, treat a short reading as "matches everything", and accept a match on the national reading or on the full digits. Update the rule comment to describe the keystroke guarantee.

**Contract**: The signatures of `matchesQuery(item, query)`, `normalizePhone` and `filterApplications` stay the same, so `dashboard.astro` (server and `<script>`) needs no edits. `normalizePhone` behaviour on stored values does not change.

### Success Criteria:

#### Automated Verification:

- Before the rule change, the new matrix fails only on the `48`-without-"+" prefixes and the "not a search yet" cases (red run recorded)
- `npm test` passes
- `npm run lint` passes
- `npx astro check` passes

#### Manual Verification:

- On local `/dashboard`, typing `+48`, then `004`, shows the full list without "Brak wyników"; typing `48 600 1` for a stored `600-100-200` keeps that offer visible

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Risk #1 E2E — typing key by key

### Overview

Prove the live filter on every `input` event in a real browser, using the 48-without-"+" format the call scenario uses.

### Changes Required:

#### 1. Key-by-key typing in the call spec

**File**: `tests/e2e/call-phone-search.spec.ts`

**Intent**: Type the number one key at a time instead of filling it, as `48 5xx xxx xxx` (no "+"), and after every key check that the offer is visible and "Brak wyników" is not. After the last key keep the current end checks: the decoy is hidden, `search-count` is `1`, and the details page shows the salary range and quoted rate. Update the header comment to say the spec protects the in-between states as well.

**Contract**: Same cleanup (`deleteApplication`) and seed pattern as now. The company labels of the offer and the decoy carry a per-run tag **without digits** (today they embed the phone digits, `[E2E] Call ${digits}`). Word matching searches company names, so digits in the labels would let both the offer and the decoy match by name and make the result depend on the random number. Each keystroke uses `pressSequentially` (or `press` per character) on `getByRole("searchbox", { name: "Szukaj" })`, followed by web-first assertions (no fixed waits). "Brak wyników" is located by its visible text.

### Success Criteria:

#### Automated Verification:

- `npx playwright test tests/e2e/call-phone-search.spec.ts` passes against local Supabase
- With Phase 1's rule change temporarily reverted, the spec fails at the first `48 5xx` keystroke (red check recorded, revert undone)
- `npx playwright test` (setup + seed + call) passes
- `npm run lint` passes

#### Manual Verification:

- The Playwright trace/HTML report for the call spec shows the keystrokes and the list staying populated

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: E2E in CI and test-plan update

### Overview

Make the browser tests a required CI gate (test plan §5) and record what this phase established in `test-plan.md`.

### Changes Required:

#### 1. E2E steps in the `smoke` job

**File**: `.github/workflows/ci.yml`

**Intent**: After the smoke step, stop the smoke preview so port 4321 is free, then prepare and run the E2E suite against the same local Supabase. On failure, upload the Playwright report.

**Contract**:

- **Secrets:** write `.dev.vars.e2e` (`SUPABASE_URL`/`SUPABASE_KEY` = local `API_URL`/`ANON_KEY`).
- **User:** create the E2E user through the local admin API (`/auth/v1/admin/users`, `email_confirm: true`, dotted domain such as `e2e@example.com`), as `scripts/smoke.mjs:24-35` does.
- **Browser:** `npx playwright install --with-deps chromium`.
- **Run:** `npx playwright test` with `CI=true`, `E2E_USERNAME`, `E2E_PASSWORD`, `E2E_SUPABASE_URL=$API_URL` and `E2E_SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY` set as step env. Nothing is written to `.env`/`.dev.vars`, and the key never goes into the app's env.
- **Report:** `actions/upload-artifact` with `playwright-report/` on `failure()`.
- **Order:** the existing `supabase stop` (`if: always()`) stays last. `deploy` still `needs: [ci, smoke]`, so E2E now blocks deploy.

#### 2. Test plan

**File**: `context/foundation/test-plan.md`

**Intent**: Record the E2E setup and the research corrections.

**Contract**:

- §6.3: location `tests/e2e/<risk>.spec.ts`; reference spec `tests/e2e/call-phone-search.spec.ts` (data through the app API, cleanup via `support/local-admin.ts`); `seed.spec.ts` for the signed-out pattern; run commands from `context/foundation/test-stack.md`; local secrets in `.env.e2e`/`.dev.vars.e2e`; CI in the `smoke` job; the hydration retry guard for sign-in.
- §4: the "e2e in a browser" row becomes Playwright 1.63.0.
- §2 Risk Response Guidance: #1 "must ground" note gets "partial/prefixed numbers while typing (server/client drift ruled out — one shared rule)"; #6 gets the pre-hydration input reset as a browser-only failure mode.
- §3: Phase 1 status `done` (or the orchestrator's next value).
- "Last updated" date.

### Success Criteria:

#### Automated Verification:

- The CI `smoke` job on the PR runs `npx playwright test` and passes (setup, seed, call-phone-search)
- `npm run lint` and Prettier (lint-staged) pass on the changed files

#### Manual Verification:

- On a deliberately broken commit (e.g. the call spec expecting a wrong rate), the CI run fails at the E2E step and the Playwright report artifact is attached; the commit is then dropped
- `test-plan.md` §6.3 is enough for writing the next E2E test without reading this plan

---

## Testing Strategy

### Unit Tests:

- FR-005 matrix (stored × typed), every keystroke prefix, "not a search yet" queries, negatives at ≥ 3 national digits, unchanged word/mixed cases.

### Integration Tests:

- Existing HTTP smoke stays as is: server `?q=` for one format, and the sign-in `Location` headers.
- E2E: `seed.spec.ts` (#6) unchanged; `call-phone-search.spec.ts` (#1) key by key.

### Manual Testing Steps:

1. Local `/dashboard` with demo data: type `+48`, `004`, `48 6`; the list stays full and "Brak wyników" never appears.
2. Type the full number of one offer in another format; only that offer remains.
3. Type a number that isn't in the data (≥ 3 digits); "Brak wyników" appears.

## Performance Considerations

None. The rule still runs over a few hundred items per keystroke in the browser.

## Migration Notes

None. No schema or stored-data change.

## References

- Research: `context/changes/testing-call-scenario-browser/research.md`
- Test plan: `context/foundation/test-plan.md` §2, §3, §5, §6.3
- Test stack: `context/foundation/test-stack.md`
- Rule: `src/lib/domain/search.ts:25-59`; live filter `src/pages/dashboard.astro:148-199`
- E2E pattern: `tests/e2e/call-phone-search.spec.ts`, `tests/e2e/seed.spec.ts`, `tests/e2e/support/local-admin.ts`
- Admin user creation: `scripts/smoke.mjs:24-35`; CI smoke job `.github/workflows/ci.yml:24-62`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Search rule and format matrix (unit, test-first)

#### Automated

- [x] 1.1 Before the rule change, the new matrix fails only on the `48`-without-"+" prefixes and the "not a search yet" cases (red run recorded) — 90e36b1
- [x] 1.2 `npm test` passes — 90e36b1
- [x] 1.3 `npm run lint` passes — 90e36b1
- [x] 1.4 `npx astro check` passes — 90e36b1

#### Manual

- [x] 1.5 On local `/dashboard`, typing `+48`, then `004`, shows the full list without "Brak wyników"; typing `48 600 1` for a stored `600-100-200` keeps that offer visible — 90e36b1

### Phase 2: Risk #1 E2E — typing key by key

#### Automated

- [x] 2.1 `npx playwright test tests/e2e/call-phone-search.spec.ts` passes against local Supabase
- [x] 2.2 With Phase 1's rule change temporarily reverted, the spec fails at the first `48 5xx` keystroke (red check recorded, revert undone)
- [x] 2.3 `npx playwright test` (setup + seed + call) passes
- [x] 2.4 `npm run lint` passes

#### Manual

- [ ] 2.5 The Playwright trace/HTML report for the call spec shows the keystrokes and the list staying populated

### Phase 3: E2E in CI and test-plan update

#### Automated

- [ ] 3.1 The CI `smoke` job on the PR runs `npx playwright test` and passes (setup, seed, call-phone-search)
- [ ] 3.2 `npm run lint` and Prettier (lint-staged) pass on the changed files

#### Manual

- [ ] 3.3 On a deliberately broken commit (e.g. the call spec expecting a wrong rate), the CI run fails at the E2E step and the Playwright report artifact is attached; the commit is then dropped
- [ ] 3.4 `test-plan.md` §6.3 is enough for writing the next E2E test without reading this plan
