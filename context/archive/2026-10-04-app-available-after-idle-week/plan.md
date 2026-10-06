# Keep the App Working After a Week Without Use — Implementation Plan

## Overview

The Supabase free project pauses after about a week of too little database activity; while paused, every request gets HTTP 540 and the app is useless — exactly when a recruiter calls after a quiet week. This plan keeps the project awake with a scheduled ping from the Worker, detects when that is not enough (public health check + a daily GitHub Actions run that emails the owner on failure), and replaces the confusing failure with a clear Polish "database is paused" page.

Roadmap: S-01 `app-available-after-idle-week` (north star of milestone M-1). Risk register: "Supabase free project pauses after inactivity" (M/H) in `context/foundation/infrastructure.md`.

## Current State Analysis

- Nothing generates database activity unless the owner uses the app. Visiting `/` while signed out does not touch the database: the middleware only calls the auth server when a session cookie exists (`src/middleware.ts:7-15`).
- When the project is paused, a signed-in request fails in `supabase.auth.getUser()` (`src/middleware.ts:10-13`) and the user is silently treated as signed out → redirected to sign-in; signing in then fails with the generic "Nie udało się zalogować" (`src/pages/api/auth/signin.ts:15-21`). Nothing tells the owner the database is asleep.
- No scheduled jobs exist: CI runs only on push/PR (`.github/workflows/ci.yml:3-7`), and the Worker uses the adapter's default entrypoint (`wrangler.jsonc` `main: "@astrojs/cloudflare/entrypoints/server"`).
- No health endpoint, no alerting. Platform observability is on (`wrangler.jsonc` `observability.enabled`).

### Supabase facts (researched 2026-09-30)

- Pause trigger: too little "user database activity over the past week"; no published threshold ("typically a few user requests to the database each day"). Warning email ~1 week before pausing. Paused projects return HTTP 540. Restore: dashboard or Management API, a few minutes. Restore window is now 1 year.
- A single daily anon PostgREST `select` was reported (2026-09-13) as **not** enough; reports also exist of pauses despite daily pings. Hence several writes per day here, plus detection.
- Pro plan ($25/month) removes pausing — not chosen (see brief).

## Desired End State

- The Worker writes a heartbeat to the database every 6 hours, without anyone using the app.
- `GET /api/health` (public) answers 200 when the database responds and the last heartbeat is at most 24 h old, otherwise 503 with a reason (`ping_stale`, `paused`, `db_unreachable`).
- A GitHub Actions workflow calls the production health check once a day; a failed run emails the owner.
- If the database is paused anyway, any page shows a Polish message explaining it and linking to the Supabase dashboard; API routes answer 503 instead of a misleading 401/redirect; sign-in leads to the same page instead of "Nie udało się zalogować".

Verify: `curl https://applications-tracker.41mariusz.workers.dev/api/health` shows a `pingedAt` that advances every ~6 h; the health workflow is green daily.

### Key Discoveries:

- The adapter supports a custom Worker entry: set `main` in `wrangler.jsonc` and export a standard Worker object using `handle` from `@astrojs/cloudflare/handler` (`node_modules/@astrojs/cloudflare/dist/wrangler.js:36` honours `config.main`; `handler` is in the package exports; Astro docs, "Changed: Custom entrypoint API").
- `astro:env/server` is only available in Astro request handling; the `scheduled` handler must read `SUPABASE_URL` / `SUPABASE_KEY` from the Worker `env` argument (same Worker secrets).
- SQL-function pattern with `plpgsql`, `grant execute` and pgTAP tests: `supabase/migrations/20260930150000_atomic_writes.sql:14,135-138`, `supabase/tests/atomic_writes.test.sql`.
- Sign-in error mapping lives in `src/pages/api/auth/signin.ts:15-21`; protected-route redirect in `src/middleware.ts:22-26`.
- Smoke test helpers `request()` / `createUser()` in `scripts/smoke.mjs:24-70`.

## What We're NOT Doing

- Upgrading to Supabase Pro — the owner chose the free keep-alive; Pro stays the fallback if pings prove insufficient.
- Automatic restore through the Supabase Management API — it would put an account-wide access token into the Worker, against the "app holds only the publishable key" rule.
- Any other monitoring/alerting (error tracker, uptime service) — that is roadmap F-01.
- Changing the app's normal sign-in / data flows beyond recognising HTTP 540.
- Read-only pings without a write — reported as insufficient.

## Implementation Approach

Three independently deployable phases: (1) the heartbeat itself, so the risk is reduced as soon as it ships; (2) visibility — a health check plus a daily external probe that emails on failure, which also catches a cron that silently stopped; (3) graceful UX when the database is paused anyway. Pure decision logic (health evaluation, "is this a pause?") goes into small functions with Vitest tests; database access goes through two `security definer` functions, so the heartbeat table needs no direct-access policies.

## Critical Implementation Details

- **Migration before code.** Phase 1 adds a migration that the Worker cron depends on. Per `context/foundation/lessons.md`, run `npx supabase db push` and confirm it applied **before** pushing Phase 1 to `main` (CI auto-deploys).
- **How supabase-js surfaces a 540 is unverified.** The gateway's 540 body is not a normal Auth/PostgREST JSON error. Phase 3 must first pin down, with a stubbed `fetch` returning 540, what `auth.getUser()`, `auth.signInWithPassword()` and `.rpc()` return, and build the "is paused" check on that observed shape — not on an assumed `error.status`.
- **Who gets the GitHub email.** GitHub notifies the user who last modified the `schedule` in the workflow file, if their notification settings allow failed-workflow emails. In a public repo the schedule is disabled after 60 days without repository activity (GitHub emails a warning first).

## Phase 1: Heartbeat ping from the Worker

### Overview

A one-row heartbeat table updated by a `security definer` function, called every 6 hours by a Cloudflare Cron Trigger through a custom Worker entry that still serves the Astro app.

### Changes Required:

#### 1. Heartbeat table and functions

**File**: `supabase/migrations/<timestamp>_keepalive.sql`

**Intent**: Give the Worker a cheap, real database write and give the health check a way to read when it last happened, without exposing a table to direct access.

**Contract**: Table `public.keepalive` — single row (`id` fixed to 1 by a check constraint), `pinged_at timestamptz not null`; the migration inserts the row with `now()`. RLS enabled with **no** policies (deliberate: access only through the functions; say so in a comment, since project convention otherwise asks for per-operation policies). Functions `public.keepalive_ping() returns timestamptz` (sets `pinged_at = now()`, returns it) and `public.keepalive_status() returns timestamptz` (reads it), both `security definer` with an empty `search_path`; `revoke execute ... from public`, `grant execute ... to anon, authenticated`.

#### 2. Database tests

**File**: `supabase/tests/keepalive.test.sql`

**Intent**: Prove the access model: anon can ping and read status; anon cannot select or modify the table directly; a ping moves `pinged_at` forward.

**Contract**: pgTAP, same structure as `supabase/tests/atomic_writes.test.sql`.

#### 3. Ping service

**File**: `src/lib/services/keepalive.ts`

**Intent**: Keep Supabase access in `src/lib/services/` (project convention): one function that calls `keepalive_ping` and one that calls `keepalive_status`, both taking a `SupabaseClient` and throwing on error (mirroring the other services).

**Contract**: `pingKeepalive(supabase): Promise<Date>`; `getKeepaliveStatus(supabase): Promise<Date | null>`.

#### 4. Custom Worker entry with a scheduled handler

**File**: `src/worker.ts`

**Intent**: Serve the Astro app exactly as before and add a `scheduled` handler that creates a plain (cookie-less) Supabase client from the Worker `env` and calls `pingKeepalive`, logging success/failure with `console.log`/`console.error` so it shows in Workers observability.

**Contract**: default export `{ fetch: handle, scheduled(controller, env, ctx) }` with `handle` from `@astrojs/cloudflare/handler`; the ping runs inside `ctx.waitUntil`. Type the `env` bindings it reads (`SUPABASE_URL`, `SUPABASE_KEY`).

#### 5. Wrangler configuration

**File**: `wrangler.jsonc`

**Intent**: Point the Worker at the new entry and schedule the ping.

**Contract**: `"main": "./src/worker.ts"`; `"triggers": { "crons": ["0 */6 * * *"] }`.

#### 6. Agent context

**File**: `CLAUDE.md`

**Intent**: Record the custom entry, the cron, and that `keepalive` is accessed only through its functions.

**Contract**: One bullet under "Domain and data" (or "Environment").

### Success Criteria:

#### Automated Verification:

- Database tests pass, including the new keepalive tests: `npx supabase test db`
- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Production build succeeds and the built Worker still serves the app (smoke test passes against `npm run preview`): `npm run build && npm run smoke`

#### Manual Verification:

- Cloud migration applied before pushing: `npx supabase db push` reports the keepalive migration as applied
- After deploy, the Cloudflare dashboard (Worker → Settings → Triggers) lists the `0 */6 * * *` cron
- Within 6 hours of deploy, `keepalive.pinged_at` in the cloud database has advanced past the migration time (check in the Supabase dashboard or via the Phase 2 health check), and Workers logs show the ping

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Health check and daily external probe

### Overview

A public health endpoint backed by a tested decision rule, covered by the smoke test, and probed daily from GitHub Actions so a failure becomes an email.

### Changes Required:

#### 1. Health decision rule

**File**: `src/lib/domain/keepalive.ts` (+ `src/lib/domain/keepalive.test.ts`)

**Intent**: Decide health from what the endpoint observed, as a pure function.

**Contract**: `evaluateHealth({ pingedAt: Date | null, now: Date, outcome: "ok" | "paused" | "unreachable" })` → `{ healthy: boolean, reason: "ok" | "ping_stale" | "paused" | "db_unreachable" }`; `MAX_PING_AGE_MS = 24 h`. A ping exactly 24 h old is healthy; 24 h + 1 ms is `ping_stale`; `null` is `ping_stale`. Tests cover each reason and the 24 h boundary.

#### 2. Health endpoint

**File**: `src/pages/api/health.ts`

**Intent**: Public, read-only check the probe and the owner can call: reads `keepalive_status` via `getKeepaliveStatus`, maps the result through `evaluateHealth`.

**Contract**: `GET /api/health`, `prerender = false`, no auth. 200 `{ status: "ok", pingedAt }` when healthy, 503 `{ status: <reason>, pingedAt }` otherwise; `Cache-Control: no-store`. Returns nothing but the status and timestamp. Until Phase 3 exists, a database error maps to `db_unreachable`.

#### 3. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Cover the new user-facing endpoint (CLAUDE.md: extend the smoke test with each user-facing feature). On a fresh local database the migration's initial row makes the heartbeat fresh.

**Contract**: `GET /api/health` → 200 and `status === "ok"`, without a session.

#### 4. Daily probe

**File**: `.github/workflows/health.yml`

**Intent**: Call production `/api/health` once a day; a non-2xx response fails the run, and GitHub emails the owner.

**Contract**: `on: schedule` (once daily, off the top of the hour, e.g. `23 7 * * *`) and `workflow_dispatch`; one step: `curl --fail-with-body --retry 2` against `https://applications-tracker.41mariusz.workers.dev/api/health`. No secrets needed.

#### 5. Docs

**Files**: `CLAUDE.md`, `context/foundation/infrastructure.md`

**Intent**: Note `/api/health` and the health workflow (CLAUDE.md commands/CI line, smoke description); in `infrastructure.md` update the Operational Story "Logs" line and the Supabase-pause risk mitigation to what is now in place.

**Contract**: Edit existing lines; no new sections.

### Success Criteria:

#### Automated Verification:

- Health rule unit tests pass, including the 24 h boundary: `npm test`
- Lint and type check pass: `npm run lint && npx astro check`
- Smoke test passes with the new health check: `npm run build && npm run smoke`
- CI is green on the pushed commit (all three jobs)

#### Manual Verification:

- `curl -i https://applications-tracker.41mariusz.workers.dev/api/health` returns 200 with a recent `pingedAt`
- Running the health workflow manually (Actions → Health → Run workflow) succeeds
- GitHub notification settings for the owner have email enabled for failed Actions workflows

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Clear message when the database is paused

### Overview

Recognise a paused project wherever it first shows up and send the user to a Polish explanation page instead of a misleading sign-in failure.

### Changes Required:

#### 1. Pause detection helper

**File**: `src/lib/supabase-paused.ts` (+ `src/lib/supabase-paused.test.ts`)

**Intent**: One place that answers "is this Supabase failure a paused project?". Its test first establishes, with a Supabase client whose `fetch` is stubbed to return HTTP 540, what `auth.getUser()`, `auth.signInWithPassword()` and `.rpc()` actually return — then asserts the helper recognises all three and does not flag ordinary errors (e.g. 400 invalid credentials, network failure).

**Contract**: `isProjectPaused(errorOrResponse): boolean`, built on the observed shape.

#### 2. Paused page

**File**: `src/pages/paused.astro`

**Intent**: Tell the owner, in Polish, that the database is asleep, that restoring takes a few minutes, and where to do it; offer a retry link.

**Contract**: Public route `/paused` using `Layout` and the sign-in page's visual style; link to `https://supabase.com/dashboard/projects`; "Spróbuj ponownie" link to `/dashboard`. Readable at 360 px.

#### 3. Middleware

**File**: `src/middleware.ts`

**Intent**: When `getUser()` fails because the project is paused, redirect pages to `/paused` and answer API routes with 503 JSON, instead of treating the user as signed out.

**Contract**: `/api/*` → 503 `{ error: "database_paused" }`; other paths (except `/paused`) → redirect `/paused`. Behaviour for every other error is unchanged.

#### 4. Sign-in and health

**Files**: `src/pages/api/auth/signin.ts`, `src/pages/api/health.ts`

**Intent**: Sign-in redirects to `/paused` on a paused-project error (other errors keep their current messages); the health endpoint reports `paused` instead of `db_unreachable`.

**Contract**: Uses `isProjectPaused`; existing messages untouched.

#### 5. Docs

**Files**: `CLAUDE.md`, `context/foundation/infrastructure.md`

**Intent**: Mention `/paused` and the 540 handling; in `infrastructure.md` mark the risk-register mitigation as implemented.

**Contract**: Edit existing lines.

### Success Criteria:

#### Automated Verification:

- Pause-detection tests pass for the three stubbed 540 paths and the non-pause errors: `npm test`
- Lint and type check pass: `npm run lint && npx astro check`
- Smoke test still passes (normal sign-in and flows unaffected): `npm run build && npm run smoke`

#### Manual Verification:

- `/paused` reads well on a phone (360 px) and on desktop
- Optional live check (causes a few minutes of downtime): pause the project in the Supabase dashboard, confirm a signed-in page and sign-in both land on `/paused`, `/api/health` returns 503 `paused`, and a manual run of the health workflow fails and emails the owner; then restore the project and confirm `/api/health` returns 200 again

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `evaluateHealth`: healthy, stale at 24 h + 1 ms, healthy at exactly 24 h, `null` ping, `paused`, `unreachable`.
- `isProjectPaused`: 540 via `getUser`, `signInWithPassword`, `.rpc`; not flagged for 400 invalid credentials or a thrown network error.

### Integration Tests:

- pgTAP: anon can execute `keepalive_ping` / `keepalive_status`; direct `select`/`update` on `keepalive` as anon is denied; ping advances `pinged_at`.
- Smoke: `GET /api/health` → 200 `ok` without a session, plus all existing flows.

### Manual Testing Steps:

1. After Phase 1 deploy, wait for the next 6-hour slot and confirm `pingedAt` advanced.
2. Run the Health workflow manually; confirm success.
3. (Optional) Pause → check `/paused`, 503 health, failing workflow email → restore.

## Performance Considerations

Four scheduled invocations a day and one daily probe — negligible against free-plan limits (Workers: 100k requests/day, 10 ms CPU; the ping is network-bound). The middleware gains no extra requests: pause detection reuses the existing `getUser()` result.

## Migration Notes

New table and functions only; existing data untouched. The migration is additive, so rolling back the Worker to a previous version stays safe. Apply with `npx supabase db push` before pushing Phase 1.

## References

- Roadmap item: `context/foundation/roadmap.md` — S-01
- Risk register: `context/foundation/infrastructure.md` — "Supabase free project pauses after inactivity"
- Lesson: `context/foundation/lessons.md` — db push before pushing code with a migration
- SQL function pattern: `supabase/migrations/20260930150000_atomic_writes.sql:135-138`
- Supabase pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Astro Cloudflare custom entrypoint: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- GitHub scheduled workflows: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Heartbeat ping from the Worker

#### Automated

- [x] 1.1 Database tests pass, including the new keepalive tests: `npx supabase test db` — d2bf69e
- [x] 1.2 Unit tests pass: `npm test` — d2bf69e
- [x] 1.3 Lint passes: `npm run lint` — d2bf69e
- [x] 1.4 Type check passes: `npx astro check` — d2bf69e
- [x] 1.5 Production build succeeds and the built Worker still serves the app (smoke test passes against `npm run preview`): `npm run build && npm run smoke` — d2bf69e

#### Manual

- [x] 1.6 Cloud migration applied before pushing: `npx supabase db push` reports the keepalive migration as applied — d2bf69e
- [x] 1.7 After deploy, the Cloudflare dashboard (Worker → Settings → Triggers) lists the `0 */6 * * *` cron
- [x] 1.8 Within 6 hours of deploy, `keepalive.pinged_at` in the cloud database has advanced past the migration time (check in the Supabase dashboard or via the Phase 2 health check), and Workers logs show the ping

### Phase 2: Health check and daily external probe

#### Automated

- [x] 2.1 Health rule unit tests pass, including the 24 h boundary: `npm test` — bb88c7e
- [x] 2.2 Lint and type check pass: `npm run lint && npx astro check` — bb88c7e
- [x] 2.3 Smoke test passes with the new health check: `npm run build && npm run smoke` — bb88c7e
- [x] 2.4 CI is green on the pushed commit (all three jobs) — bb88c7e

#### Manual

- [x] 2.5 `curl -i https://applications-tracker.41mariusz.workers.dev/api/health` returns 200 with a recent `pingedAt`
- [x] 2.6 Running the health workflow manually (Actions → Health → Run workflow) succeeds
- [x] 2.7 GitHub notification settings for the owner have email enabled for failed Actions workflows

### Phase 3: Clear message when the database is paused

#### Automated

- [x] 3.1 Pause-detection tests pass for the three stubbed 540 paths and the non-pause errors: `npm test` — 10525ed
- [x] 3.2 Lint and type check pass: `npm run lint && npx astro check` — 10525ed
- [x] 3.3 Smoke test still passes (normal sign-in and flows unaffected): `npm run build && npm run smoke` — 10525ed

#### Manual

- [x] 3.4 `/paused` reads well on a phone (360 px) and on desktop
- [x] 3.5 Optional live check (causes a few minutes of downtime): pause the project in the Supabase dashboard, confirm a signed-in page and sign-in both land on `/paused`, `/api/health` returns 503 `paused`, and a manual run of the health workflow fails and emails the owner; then restore the project and confirm `/api/health` returns 200 again
