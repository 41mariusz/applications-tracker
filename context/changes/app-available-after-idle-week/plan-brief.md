# Keep the App Working After a Week Without Use — Plan Brief

> Full plan: `context/changes/app-available-after-idle-week/plan.md`

## What & Why

The free Supabase project pauses after about a week of too little database activity, and a paused project answers every request with HTTP 540 — so after a quiet week the app is dead exactly when a recruiter calls. This change keeps the database awake, warns the owner when that fails, and explains the situation clearly if it happens anyway. Roadmap S-01, the north star of milestone M-1 "Ready for real use".

## Starting Point

Nothing touches the database unless the owner uses the app; there are no scheduled jobs, no health check and no alerting. When the project is paused, the app silently treats the owner as signed out and sign-in fails with a generic error.

## Desired End State

The Worker writes a heartbeat every 6 hours on its own. A public `/api/health` reports whether the database answers and the heartbeat is fresh, and a daily GitHub Actions probe emails the owner when it isn't. If the database is paused anyway, the owner lands on a Polish page saying so, with a link to restore it in a few minutes.

## Key Decisions Made

| Decision         | Choice                                                     | Why (1 sentence)                                                                                            | Source          |
| ---------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------- |
| Approach         | Free keep-alive + detection, not Supabase Pro ($25/month)  | $0 and the owner learns about a failure before it matters; Pro stays the fallback.                          | Plan            |
| Ping             | Write through a SQL function, Worker cron every 6 h        | A daily read-only ping was reported as not enough; a real write 4× a day matches "a few requests each day". | Research + Plan |
| Scheduler        | Cloudflare Cron Trigger in the same Worker                 | Free, no 60-day auto-disable, and the app already runs there.                                               | Research        |
| Detection        | Public `/api/health` + daily GitHub Actions probe (email)  | No new service; independent of the Worker, so it also catches a cron that stopped.                          | Plan            |
| Health threshold | Healthy if the database answers and the ping is ≤ 24 h old | Tolerates three missed 6-hour pings before alarming, far inside the one-week pause window.                  | Plan            |
| Auto-restore     | Not done                                                   | It needs an account-wide Supabase token in the Worker, against the "publishable key only" rule.             | Plan            |
| Paused UX        | Polish `/paused` page; API answers 503                     | During a call the owner immediately knows what happened and what to do.                                     | Plan            |

## Scope

**In scope:** heartbeat table + two `security definer` functions; custom Worker entry with a scheduled handler; `/api/health`; daily health workflow; pause detection in middleware, sign-in and health; `/paused` page; tests (pgTAP, Vitest, smoke) and doc updates.

**Out of scope:** Supabase Pro; automatic restore; other monitoring or alerting (roadmap F-01); changes to normal sign-in and data flows.

## Architecture / Approach

Cloudflare Cron (every 6 h) → `src/worker.ts` `scheduled` → `keepalive_ping()` in Postgres. GitHub Actions (daily) → `GET /api/health` → `keepalive_status()` → `evaluateHealth` (pure rule) → 200 / 503 → a failed run emails the owner. When Supabase answers 540, `isProjectPaused` lets the middleware and sign-in send the user to `/paused` and the API return 503.

## Phases at a Glance

| Phase                             | What it delivers                                          | Key risk                                                                 |
| --------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Heartbeat ping from the Worker | The database gets a real write every 6 h                  | Migration must be pushed to the cloud before the code (lessons.md)       |
| 2. Health check and daily probe   | `/api/health` + daily email on failure                    | GitHub disables the schedule after 60 days without commits (warns first) |
| 3. Clear message when paused      | `/paused` page; middleware, sign-in and API recognise 540 | How supabase-js surfaces a 540 is unverified — the test pins it first    |

**Prerequisites:** `npx supabase db push` access to the cloud project; GitHub email notifications for failed workflows enabled.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Supabase publishes no activity threshold; 4 writes a day is a judgement, not a guarantee — detection exists for exactly this case.
- Assumes the Worker's `scheduled` handler can read the same `SUPABASE_URL` / `SUPABASE_KEY` secrets from `env` (not via `astro:env`).
- The optional live pause test takes production down for a few minutes.

## Success Criteria (Summary)

- After a week or more without use, the owner opens the app and searches normally.
- If the keep-alive ever fails, the owner gets an email within a day, not a surprise during a call.
- If the database is paused anyway, the app says so in plain Polish and shows where to fix it.
