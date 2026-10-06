# Production Errors Reach the Owner (F-01) — Plan Brief

> Full plan: `context/changes/production-error-visibility/plan.md`
> Research: `context/changes/production-error-visibility/research.md`
> Input audit: `context/audits/observability/2026-10-06_call-time-read-agreement-writes-cv-upload.md`

## What & Why

The owner never reads logs, so today a production failure reaches nobody. Every failure should end up as a Telegram message within minutes:

- a 5xx response;
- an uncaught exception;
- a CPU-limit kill;
- a browser error.

This plan also stops the code from hiding failures:

- Auth trouble that looks like "signed out";
- server errors shown as "Brak połączenia";
- failed reads that return 200.

## Starting Point

- **No error tracker.** There are 15 `console.error` lines, and Astro turns a thrown error into an empty 500. The only push signal is the daily database health probe.
- **Middleware.** It treats every Auth error except "paused" as signed out. Each page or route creates a second Supabase client from stale cookies, which can really sign the user out.
- **Client.** It parses JSON inside a bindingless catch, so any non-JSON server reply becomes "Brak połączenia". No error boundary exists.

## Desired End State

- **Server.** Every server failure, including errors raised after streaming started and CPU kills, becomes a Cloudflare Workers Issues occurrence tagged with the release.
- **Delivery.** The owner's Issues automation calls a small app endpoint, which sends a Polish message through the owner's Telegram bot.
- **One log line per failure.** It is a structured, PII-free line written by one middleware hook. Thrown errors render a proper 500 page.
- **Auth.** Outages and misconfiguration show an error page or a 503 and are logged. "No session" still redirects quietly.
- **Browser.** It tells network errors from server errors and from the paused state, survives a failed preview chunk, and reports client failures.
- **Proof.** A signed-in test report from the browser console reaches Telegram.

## Key Decisions Made

| Decision              | Choice                                                                                                                                                  | Why (1 sentence)                                                                                                               | Source          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| Detector              | Cloudflare Workers Issues (open beta, free)                                                                                                             | Platform-side, so no SDK or CPU cost on the 10 ms Free limit; it also sees CPU kills                                           | Research + Plan |
| Delivery              | Issues automation (threshold 1) → generic webhook → `/api/alerts/issue` → Telegram bot                                                                  | Issues has no Telegram or email destination and the owner does not use Discord; one small endpoint, free, minutes on the phone | Plan            |
| Alert endpoint safety | Secret in `cf-webhook-auth` checked in constant time; never 5xx and never error-level logs                                                              | A failing alert endpoint must not create new issues that call it again                                                         | Plan            |
| Beacon auth           | `/api/client-error` for signed-in users only                                                                                                            | No public spam into Telegram; follows the CLAUDE.md API rule                                                                   | Plan            |
| Streaming errors      | Middleware wraps the HTML body stream and logs read errors                                                                                              | One place catches post-first-byte errors without touching pages                                                                | Plan            |
| Scope                 | Fix order 1–6 from the audit, in 5 phases                                                                                                               | Closes F-01 fully; each phase deploys on its own                                                                               | Plan            |
| UI tokens             | Error elements only, on `Alert` / `text-destructive`                                                                                                    | Consistent messages without a full view migration                                                                              | Plan            |
| Production proof      | Signed-in `kind: "test"` report from the console                                                                                                        | No extra route; repeatable after any change                                                                                    | Plan            |
| Session fix           | Reuse the middleware client via `locals.supabase`                                                                                                       | Removes the stale-cookie double refresh that signs users out                                                                   | Research        |
| Log line              | One JSON line `{op, route, method, status, userId, version, error{…, cause}}`, no PII, written by `logError`; the hook dedupes via `locals.errorLogged` | Explicit serialisation; how workerd serialises `cause` is unknown                                                              | Research + Plan |

## Scope

**In scope:**

- Wrangler bump; `observability.issues`, `version_metadata`, `upload_source_maps`.
- `/api/alerts/issue` (webhook secret, Polish Telegram message) and three new Worker secrets.
- Error-line formatter and `logError`.
- Middleware hook with the stream observer; `500.astro`.
- Auth classifier, `locals.supabase` in 14 callers, misconfiguration handling, sign-in and sign-out logging.
- In routes and pages: `toServiceError`, parsing inside `try`, paused handling, 500 statuses, split catches.
- Client: classifier, `apiRequest`, 8 fetch sites, ErrorBoundary, global listeners, `/api/client-error`.
- `/dev/ui` states.
- Smoke, E2E and unit tests.
- Docs and lessons.

**Out of scope:**

- Agreement-loss guards (audit W5, W6, W8–W10): a separate change.
- Sentry or other vendors; email or Discord delivery.
- Anonymous client reports.
- Full token migration of ApplicationForm, CvLibrary and CvPreview.
- SQL `false` codes, CV orphan states, `isUuid` on `/api/cv/[id]`, the cron missing-env throw.
- Paid Cloudflare features.

## Architecture / Approach

The server has one hook in `src/middleware.ts`:

- it catches every throw and every 5xx, and observes the HTML body stream;
- it writes one JSON error line through `logError` (a pure formatter in `src/lib/domain/error-log.ts`);
- Workers Issues turns those lines, plus platform failures, into issues;
- an Issues automation calls `/api/alerts/issue`, which sends a Polish Telegram message (a pure formatter in `src/lib/domain/issue-alert.ts`).

Auth errors go through a pure classifier, and the request's single Supabase client lives on `locals`.

The browser has one `apiRequest` helper backed by a pure classifier. Reports go to `/api/client-error`, which uses the same `logError` path.

## Phases at a Glance

| Phase               | What it delivers                                                                              | Key risk                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. Detection floor  | Issues on, release tags, central hook, stream observer, `500.astro`, Telegram alert endpoint  | Wrangler bump and flag must ship together; no duplicate lines; no alert loop |
| 2. Session and Auth | `locals.supabase`, Auth classifier, 503 / misconfigured, sign-in logging                      | Changing 14 callers; smoke and E2E guard sign-in and redirects               |
| 3. Honest responses | Parsing inside `try`, paused handling, 500 on failed reads, `toServiceError`, contextual logs | Keeping happy-path bodies byte-identical for smoke                           |
| 4. Browser channel  | `apiRequest`, ErrorBoundary, global listeners, `/api/client-error`, E2E                       | Beacon noise; message regressions in islands                                 |
| 5. Docs and proof   | CLAUDE.md, runbook, lesson, a Telegram message in production                                  | Beta feature behaviour                                                       |

**Prerequisites:**

- Local Supabase for smoke and E2E.
- After the Phase 1 deploy the owner:
  1. creates a Telegram bot with @BotFather and reads the chat id;
  2. sets three Worker secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ISSUES_WEBHOOK_SECRET`);
  3. creates the Issues automation (generic webhook to `/api/alerts/issue`, "Save and Test").
- No migration, so no `db push`.

**Estimated effort:** about 3–4 sessions across 5 phases.

## Open Risks & Assumptions

- Workers Issues is a beta. Its behaviour or pricing may change, and this is recorded in the risk register.
- It is inferred, not verified, that Issues treats a CPU kill as a failed invocation.
- The exact `data` fields in an Issues webhook event are not documented. The Telegram message relies on `name`/`text`/`alert_type`/`ts` and tolerates anything missing; the first real event shows what Issues sends.
- How workerd serialises `Error.cause` is unknown. The formatter serialises explicitly, so this does not matter.
- Errors on the sign-in and `/paused` pages are not reported from the browser (by decision). Server-side failures there are still caught.

## Success Criteria (Summary)

- A deliberate server failure in production shows up in Telegram within minutes, and the issue in Cloudflare shows the deploy version and what broke.
- A Supabase Auth outage no longer looks like "signed out"; a server error no longer looks like "no connection".
- Smoke, E2E and unit suites stay green, with new checks proven by deliberate breaks.
