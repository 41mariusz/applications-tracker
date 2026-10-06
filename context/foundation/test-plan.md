# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-05 (Phase 2 complete)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/` (migrations, tests), `scripts/` — last 30 days (28 commits), excluding `context/`, `.claude/`, `node_modules`, `dist`, lockfiles, docs.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                                         | Impact | Likelihood | Source (evidence — not anchor)                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | During an unexpected HR call, searching by phone number (or name/company) does not show the right application, because the number is stored or typed in another format or the live in-browser search misbehaves | High   | Medium     | PRD FR-005, Success Criteria (primary, "< 10 s"); interview Q1, Q4                                                                   |
| 2   | A migration that passes locally breaks production: the cloud database lacks a migration the deployed code needs, or a rollback runs old code on a newer schema                                                  | High   | Medium     | interview Q2; `context/foundation/lessons.md` (db push before push); roadmap S-03; `infrastructure.md` risk register (rollback)      |
| 3   | A change to the status rules accepts a forbidden transition, reverts a closed status without confirmation, or breaks the importance ordering of the list                                                        | High   | Medium     | PRD Business Logic, FR-007, FR-011; interview Q3; hot-spot dir `src/components/applications` (22 commits/30d), `src/lib/domain` (12) |
| 4   | A change is saved without its history entry, or a note disappears, so an agreement is lost                                                                                                                      | High   | Low        | PRD guardrail "no lost agreements", FR-003, FR-010, FR-012                                                                           |
| 5   | Abuse: one account reads or changes another account's applications, notes or CVs, or a sign-in link redirects to another site                                                                                   | High   | Low        | PRD Access Control; archive `2026-10-05-fast-details-on-phone` (return path `next=`)                                                 |
| 6   | A change to sign-in or request routing locks the owner out (redirect loop, lost session, wrong redirect) exactly when the app is needed                                                                         | High   | Medium     | hot-spot dirs `src/pages/api` (21 commits/30d), `src/pages/auth` (8), middleware (7); archives `2026-10-04-*` (paused handling)      |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                         | Must challenge                                                             | Context `/10x-research` must ground                                                                                                                                     | Likely cheapest layer                                                   | Anti-pattern to avoid                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| #1   | Typing a phone number in a different format than stored (+48 / spaces / dashes / no prefix) shows the right application, live, in a real browser, and opening it shows salary range and quoted rate | "`/dashboard?q=` works over HTTP, so live typing in the browser works too" | how numbers are normalised and stored, partial/prefixed numbers while typing (server/client drift ruled out — one shared rule), live-filter behaviour, seed data source | unit (format matrix) + one e2e for the call scenario                    | expected matches copied from the normaliser's own logic instead of from PRD FR-005 examples |
| #2   | Deploy stops when the cloud database is missing a migration from the repo; the previous code version still works on the new schema                                                                  | "migrations applied to the local/CI database prove production is migrated" | how CI applies migrations, how production migration state can be read, which migrations are additive                                                                    | CI gate (deploy job) + compatibility smoke                              | a check that only ever looks at the local database                                          |
| #3   | Every transition in the PRD table is allowed or refused exactly as specified; a closed-status revert needs confirmation and leaves a trace; list order follows the PRD rule                         | "the domain unit tests cover it, so the API and UI enforce it too"         | where transitions are enforced (UI, API, SQL), how confirmation is passed, how ordering is computed for the list                                                        | unit (oracle = PRD table) + integration (API → SQL)                     | expected transitions copied from the code's own transition table                            |
| #4   | Every edit, status change and note change produces its history row in the same transaction; a removed note stays visible                                                                            | "pgTAP covers atomicity, so every write path goes through it"              | which UI/API writes bypass the SQL functions, what existing pgTAP and smoke steps already assert                                                                        | integration (existing pgTAP + smoke) — fill gaps only                   | duplicating pgTAP coverage at the e2e layer                                                 |
| #5   | A second account gets 404/401 for every read and write of the first account's data; a sign-in `next` pointing off-site lands on the dashboard                                                       | "RLS is on, so every endpoint is safe"                                     | which endpoints use the user's session vs elevated access, existing isolation steps in the smoke test                                                                   | integration (smoke isolation steps) — fill gaps only                    | testing only the happy path of the owner                                                    |
| #6   | Signing in from any protected link works, survives a reload, and a paused database or bad link leads to a clear page instead of a loop                                                              | "the unit tests of the redirect helper prove the whole sign-in flow"       | middleware order (paused check, protection, `next`), cookie/session behaviour in the built Worker, sign-in input typed before hydration being reset (browser-only)      | e2e (one sign-in flow) reusing the Phase 1 setup + existing smoke steps | asserting only the redirect `Location` header and never the page the user actually lands on |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                   | Goal (one line)                                                                                                              | Risks covered | Test types                                  | Status      | Change folder                                                 |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------- | ----------- | ------------------------------------------------------------- |
| 1   | Call scenario in the browser | Prove the owner can sign in, find an offer by a differently formatted phone number and read the call info, in a real browser | #1, #6        | unit (format matrix) + e2e (Playwright)     | complete    | `context/archive/2026-10-05-testing-call-scenario-browser/`   |
| 2   | Status rules end to end      | Prove every PRD transition, revert confirmation, trace and list ordering from the PRD, not from the code                     | #3, #4        | unit + integration                          | complete    | `context/archive/2026-10-05-testing-status-rules-end-to-end/` |
| 3   | Safe migrations              | Prove production is migrated before deploy and old code survives the new schema                                              | #2            | CI gate + compatibility smoke               | planned     | `context/changes/testing-safe-migrations/`                    |
| 4   | Quality-gates wiring         | Run the cheap checks automatically while the agent works and keep the e2e floor in CI                                        | cross-cutting | post-edit hook, end-of-turn check, CI gates | not started | —                                                             |

Risk #5 is largely covered today (smoke isolation steps, `safeNextPath` unit tests); Phase 1 and Phase 2 research must list any gap they find rather than open a separate phase. Phase 2 closed the gaps it found: the smoke note-edit isolation step now targets an active note (it used to pass because the note was already removed), and a second user is also refused removing that note and changing the first user's status; pgTAP shows another user cannot act through any trace function.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session.

Test-base profile: **sparse by count, layered in practice** — Vitest with 10 test files (8 in `src/lib/domain/`, 1 in `src/lib/`, 1 in `scripts/lib/` for CI tooling), 4 pgTAP files, and one dependency-free HTTP smoke test (~79 steps) run in CI against the production build; three Playwright browser tests (risks #1, #3, #6) since Phase 2; no component tests.

| Layer                     | Tool                                              | Version     | Notes                                               |
| ------------------------- | ------------------------------------------------- | ----------- | --------------------------------------------------- |
| unit                      | Vitest                                            | 5.0.2       | pure domain rules in `src/lib/domain/`              |
| database (atomicity, RLS) | pgTAP via Supabase CLI (`npx supabase test db`)   | CLI 2.117.0 | local Supabase in CI                                |
| end-to-end over HTTP      | `scripts/smoke.mjs` (dependency-free)             | n/a         | runs against `astro preview` + local Supabase in CI |
| e2e in a browser          | Playwright (`@playwright/test`), Chromium         | 1.63.0      | production build + local Supabase; CI `smoke` job   |
| UI contract               | `scripts/check-ui-literals.mjs` in `npm run lint` | n/a         | literal colours in views already on tokens          |
| agent hooks               | none yet — see Phase 4                            | —           | `/10x-configure-hook` (course M3L3)                 |

**Stack grounding tools (current session):**

- Docs: none — no Context7 or framework-docs MCP exposed in this session; recommendations rely on local manifests and configs; checked: 2026-10-05
- Search: generic web search/fetch only (no Exa.ai MCP) — not used for this plan; checked: 2026-10-05
- Runtime/browser: no Playwright MCP; a scratchpad Playwright install was used ad hoc for UI screenshots in earlier changes, not part of the repo; checked: 2026-10-05
- Provider/platform: none (no GitHub/Cloudflare/Supabase MCP); Cloudflare Observability API and GitHub check-runs API were queried directly in earlier changes; checked: 2026-10-05

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                                  | Where                  | Required?                    | Catches                                              |
| ------------------------------------- | ---------------------- | ---------------------------- | ---------------------------------------------------- |
| lint + typecheck + UI-literal scan    | local + CI             | required (in place)          | syntax, type drift, literal colours in token views   |
| unit (Vitest)                         | local + CI             | required (in place)          | domain rule regressions                              |
| pgTAP                                 | CI (local Supabase)    | required (in place)          | atomic writes, RLS through functions                 |
| HTTP smoke                            | CI on production build | required (in place)          | broken flows, isolation, entry behaviour             |
| e2e in a browser on the call scenario | CI on production build | required after §3 Phase 1    | live search / sign-in failures HTTP smoke cannot see |
| migration state before deploy         | CI deploy job          | required (in place)          | code deployed ahead of the cloud schema              |
| migration lint + compatibility smoke  | local + CI             | required (in place)          | migrations that break the previous code version      |
| post-edit / end-of-turn agent hooks   | local (agent loop)     | recommended after §3 Phase 4 | regressions at edit time                             |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- **Location**: next to the rule in `src/lib/domain/`, named `<module>.test.ts`.
- **Reference test**: `src/lib/domain/status.test.ts`.
- **Run locally**: `npm test`.
- **Oracle**: expected values come from the PRD or the change's plan, never from the implementation under test.

### 6.2 Adding a database test

- **Location**: `supabase/tests/<area>.test.sql` (pgTAP).
- **Reference test**: `supabase/tests/atomic_writes.test.sql`.
- **Run locally**: `npx supabase test db` (local Supabase running).

### 6.3 Adding an e2e test (browser)

- **When**: only for a risk that crosses auth/routing/SSR/DB or lives in the rendered UI; format and rule cases stay unit tests (e.g. `src/lib/domain/search.test.ts`).
- **Location**: `tests/e2e/<risk>.spec.ts`, one test per risk, header comment naming the risk (`// risk: #N (test-plan.md) — …`).
- **Reference tests**: `tests/e2e/call-phone-search.spec.ts` (signed in via the `setup` project's `storageState`; data created through the app API with the app's `Origin`; unique letters-only tag; asserted cleanup in `afterEach` via `tests/e2e/support/local-admin.ts`, local Supabase only); `tests/e2e/seed.spec.ts` for a signed-out flow (`test.use({ storageState: { cookies: [], origins: [] } })`).
- **Local-backend guards**: locally `playwright.config.ts` refuses to run without a `.dev.vars.e2e` pointing at `127.0.0.1`/`localhost` (otherwise the `CLOUDFLARE_ENV=e2e` build falls back to `.env` — production), and `auth.setup.ts` refuses to save a session whose cookie belongs to a non-local Supabase project (also catches a reused server on the E2E port).
- **Sign-in through the UI**: the form is a React island — retry fill + submit inside `expect(...).toPass()` (input typed before hydration is lost), as in `tests/e2e/auth.setup.ts`.
- **Run locally**: local Supabase running; secrets in gitignored `.env.e2e` (`E2E_USERNAME`, `E2E_PASSWORD`, `E2E_SUPABASE_URL`, `E2E_SUPABASE_SERVICE_ROLE_KEY`) and `.dev.vars.e2e` (Worker env, `CLOUDFLARE_ENV=e2e`) — never `.env`. `npx playwright test tests/e2e/<name>.spec.ts`; commands and ports in `context/foundation/test-stack.md`.
- **Prove it protects**: break the behaviour the risk targets, confirm the spec goes red on the risk's assertion, revert; check no test data is left after both runs.
- **CI**: the `smoke` job stops the smoke preview (Astro 7 runs one preview per project), then runs `npx playwright test` against a fresh build with a local-only test user; on failure the HTML report is uploaded as the `playwright-report` artifact. A retried test's trace in that report can include the cleanup's `Authorization` header — the job's throwaway local service-role key; never point E2E cleanup at a real project's key.

### 6.4 Adding a smoke step (HTTP)

- **Location**: `scripts/smoke.mjs` `steps` list; dependency-free; extend it with every user-facing feature (CLAUDE.md).
- **Run locally**: `npm run build && npm run preview`, then `BASE_URL=… SUPABASE_URL=<local> SUPABASE_SERVICE_ROLE_KEY=<local> npm run smoke` — previews against local Supabase use `.dev.vars` only, never a swapped `.env`.

### 6.5 Testing a status-rule change

- **Oracle**: the PRD (`context/foundation/prd.md` Business Logic, incl. the `Update 2026-10-05` notes), never `status.ts`. The exhaustive 7×7 matrix in `src/lib/domain/status.test.ts` is typed by hand (`F`/`C`/`R`/`-`); a rule change edits the PRD first, then that literal row, then the code.
- **Where each part is proven**:
  - transition rule and list order (stage, recency, closed interleave, tie → newer `created_at`, then `id`): unit, `status.test.ts`;
  - history rows and `last_activity_at` (bumped only by a status change or a saved note; field, note-edit, note-removal and CV changes leave it alone), plus another user shut out of every trace function: pgTAP, `supabase/tests/history_traces.test.sql`;
  - each transition kind's HTTP code, the `(cofnięcie)` marker on the details page, and the dashboard order on a clean account: smoke (`scripts/smoke.mjs`);
  - the revert dialog (cancel sends nothing, accept reverts and records it): `tests/e2e/status-revert.spec.ts`.
- **Gotcha (pgTAP)**: a test file is one transaction, so `now()` is constant. To assert a bump, first set `last_activity_at` to a fixed past value, then compare with `now()`.
- **Gotcha (smoke)**: later steps rely on the main application ending at `offer` (status filter counts); a new transition step must restore it.
- **Scope of the guarantee**: these tests prove the rule for writes through the app's API routes. The database does not enforce transitions or traces by itself (see §7).

### 6.6 Per-rollout-phase notes

- **Phase 1** (`testing-call-scenario-browser`): the phone search rule keeps an offer listed at every keystroke (a phone-only query with fewer than 3 national digits shows everything; `48` without "+" is read both ways); unit matrix in `search.test.ts`, key-by-key e2e in `call-phone-search.spec.ts`; e2e is a required CI gate. Accepted trade-off (impl review F1): a digit-only query with fewer than 3 national digits (`12`, `485`) shows every application, even when meant as text.
- **Phase 2** (`testing-status-rules-end-to-end`): oracle = PRD; decisions recorded as PRD updates — Accepted is a forward move from any active status, activity is the moment a note or status change is saved, closed statuses interleave by activity, ties go to the newer application (the only code change: tie-break in `sortApplications`). Every new check was shown red on a deliberate break (transition, stage rank, `created_at` tie-break, revert flag, `edit_note` revision, `add_note` bump, bypassed `window.confirm`). pgTAP mutants are run inside the test transaction (`create or replace` before the assertions, rolled back), never with `db reset`.
- **Phase 3** (`testing-safe-migrations`): risk #2 split in two — code ahead of the cloud (deploy gate over the anon `applied_migrations()` RPC; no new CI secret; fails closed) and old code on a new schema (migration lint + compatibility smoke of the base commit). Also closes roadmap S-03: deploys carry the git SHA; cron/health hazards of rolling back to very old versions are in the infrastructure runbook. Shown red on deliberate breaks: `drop` rule, `max()`-only comparison, gate missing-branch, invoker instead of definer RPC, an edited applied migration.

### 6.7 Adding a migration

- **Rule**: additive and backward-compatible with the previous code version (CLAUDE.md hard rule, `lessons.md`). The previous code runs on the new schema between `db push` and deploy, and after a rollback.
- **Lint**: `npm run lint` runs `scripts/check-migrations.mjs` over migrations newer than `20261004120000`; rules live in `scripts/lib/migrations.mjs` (tests in `scripts/lib/migrations.test.mjs`). Intentional break: `-- migration-lint: allow <rule> — <reason>` on or above the statement, plus a two-step rollout.
- **New RPC**: pgTAP next to it in `supabase/tests/`; reference `supabase/tests/applied_migrations.test.sql` / `keepalive.test.sql` for anon-callable security-definer functions.
- **Order**: `npx supabase migration up` locally → commit → `npx supabase db push` (cloud) → `git push`.
- **CI**: the `smoke` job builds the previous commit and runs its own `scripts/smoke.mjs` on the new local schema when `supabase/migrations/` changed, and fails if an applied migration was edited, renamed or deleted; the `deploy` job blocks before `wrangler deploy` when the cloud lacks a repo migration or its state cannot be read (`scripts/check-cloud-migrations.mjs`).
- **Not covered** (review): semantic breaks — new enum values old code cannot render, redefined functions that write columns old code doesn't send.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Screenshot tests of every page** — the look keeps changing and such tests would break constantly. UI changes use the dev-only kitchen sink `/dev/ui` as manual visual evidence instead. Re-evaluate if a visual regression reaches production twice. (Source: Phase 2 interview Q5.)
- **`scripts/demo-data.mjs`** — a manual, owner-run tool for test data, not product behaviour. Re-evaluate if it becomes part of CI.
- **Owner-level bypass of the app's rules through Supabase directly** — the `authenticated` role keeps Supabase's default table grants and the RLS update/insert policies check only ownership, so the signed-in owner, with their own session token, could change status, fields or notes, or insert history rows, through PostgREST or a direct RPC call, skipping the transition rule and the trace. Accepted for a single-user app: only the owner holds a token for their data, the app's key stays on the server, and RLS still blocks every other account (tested in pgTAP and smoke). Re-evaluate if a second user, a shared account or a client-side Supabase call appears. (Source: Phase 2 plan decision.)
- **CV upload CPU limit** — measured in production (16–25 ms, all ok) and accepted by the owner; belongs to monitoring (roadmap F-01), not a test.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-05
- Stack versions last verified: 2026-10-05
- AI-native tool references last verified: 2026-10-05

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
