<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Keep the App Working After a Week Without Use

- **Plan**: context/changes/app-available-after-idle-week/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Automated criteria re-run on 2026-10-04: `npx supabase test db` (18 PASS), `npm test` (81 PASS), `npm run lint` PASS, `npx astro check` 0 errors; production `/api/health` 200, `/paused` 200. Smoke test passed in-phase on the same code (10525ed).

## Findings

### F1 — Health workflow runs with default token permissions

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/health.yml:9
- **Detail**: No `permissions:` block, so the job gets the repository's default GITHUB_TOKEN scope (possibly write) although it never uses the token. `ci.yml` has the same gap.
- **Fix**: Add a top-level `permissions: {}` to `health.yml`.
- **Decision**: FIXED

### F2 — Middleware intercepts /api/health and sign-out while paused

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/middleware.ts:19-24
- **Detail**: Plan: `/api/health` reports `{ status: "paused" }`. With a session cookie, the middleware answers first with 503 `{ error: "database_paused" }`, so the owner checking health from the browser sees a different shape than the probe; `/api/auth/signout` also returns 503 while paused. The cookie-less daily probe is unaffected.
- **Fix**: Exempt `/api/health` and `/api/auth/signout` from the paused short-circuit in the middleware.
  - Strength: Health keeps one response shape for every caller; sign-out still clears cookies during a pause.
  - Tradeoff: Two more path exceptions in the middleware.
  - Confidence: HIGH — both routes already handle the paused case themselves (health) or don't need the database (sign-out clears cookies).
  - Blind spot: Sign-out calls `auth.signOut()`, which may itself hit the 540; it should still clear local cookies.
- **Decision**: FIXED

### F3 — Original 540 response body is never cancelled

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/supabase-paused.ts:15
- **Detail**: The wrapper returns a replacement Response without consuming or cancelling the original body; on Workers an unconsumed body can hold the connection or log a warning.
- **Fix**: `await response.body?.cancel()` before returning the replacement.
- **Decision**: FIXED

### F4 — Anyone with the publishable key can refresh the heartbeat

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261004120000_keepalive.sql:37
- **Detail**: `keepalive_ping` is executable by anon. Abuse only touches one row, but a fresh heartbeat written by someone else would make `/api/health` report `ok` while the Worker cron is broken. The publishable key lives only in the server-side Worker here, so exposure is low.
- **Fix**: Document the trade-off in the migration comment and the infrastructure.md risk row (a stricter path would need the service-role key in the Worker, which project rules forbid).
  - Strength: Makes the accepted limitation explicit for future readers.
  - Tradeoff: The limitation remains.
  - Confidence: HIGH — single-user app, key not shipped to the browser.
  - Blind spot: None significant.
- **Decision**: FIXED (documented in CLAUDE.md and infrastructure.md instead of the already-applied migration)

### F5 — Failed cron ping is reported as a successful run

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/worker.ts:33
- **Detail**: Errors are logged and swallowed, so the Cloudflare dashboard shows every cron run as successful; a broken cron surfaces only through the 24 h staleness rule (up to ~48 h with the daily probe — still well inside the 7-day window).
- **Fix**: Re-throw after logging so failed runs show as failed in the Cloudflare cron history.
- **Decision**: FIXED

### F6 — 60-day schedule auto-disable not recorded in infrastructure.md

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/foundation/infrastructure.md (risk register)
- **Detail**: GitHub disables scheduled workflows in a public repo after 60 days without commits; the plan notes it, infrastructure.md does not. During a long idle stretch the probe would silently stop (GitHub emails a warning first).
- **Fix**: Add the limitation to the Supabase-pause risk row's mitigation text.
- **Decision**: FIXED

### F7 — Docs lists not updated with the new modules

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: CLAUDE.md (Domain and data), context/foundation/infrastructure.md (Logs line)
- **Detail**: CLAUDE.md's service and domain file lists don't mention `keepalive.ts`; infrastructure.md's Logs line lists stale ping and unreachable DB as 503 reasons but not `paused`.
- **Fix**: Add `keepalive.ts` to both lists and `paused` to the Logs line.
- **Decision**: FIXED

### F8 — Two manual checks still open

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 1.8, 3.5
- **Detail**: 1.8 (first cron ping in the cloud) can only be verified after 18:00 UTC on 2026-10-04; 3.5 (live pause test) was skipped by the owner — the code path was verified with a simulated 540 Supabase in workerd instead.
- **Fix**: Check `/api/health` after 18:00 UTC and tick 1.8; leave 3.5 unchecked as an explicit skip.
- **Decision**: PENDING — check 1.8 after 18:00 UTC; 3.5 skipped by the owner
