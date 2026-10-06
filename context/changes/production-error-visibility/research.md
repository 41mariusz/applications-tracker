---
date: 2026-10-06T08:42:29+00:00
researcher: Claude (Opus 5.5) for Mariusz Michalak
git_commit: 2e63fb46df45e8cec95fb6a37a99cfc5ee0ed33d
branch: main
repository: 10xdevs
topic: "Roadmap F-01 — how production errors should reach the owner: notifier, central server hook, Auth/session failures, client error channel"
tags: [research, observability, cloudflare-workers, astro, supabase-auth, sentry, workers-issues]
status: complete
last_updated: 2026-10-06
last_updated_by: Claude (Opus 5.5)
---

# Research: Production errors reach the owner (F-01)

**Date**: 2026-10-06T08:42:29+00:00
**Researcher**: Claude (Opus 5.5) for Mariusz Michalak
**Git Commit**: 2e63fb46df45e8cec95fb6a37a99cfc5ee0ed33d
**Branch**: main
**Repository**: 10xdevs

## Research Question

Input: `context/audits/observability/2026-10-06_call-time-read-agreement-writes-cv-upload.md`, fix order 1–6. The owner reads no logs.

1. **Notifier.** Which mechanism pushes a production failure (5xx, uncaught exception, CPU-limit kill, client error) to the owner on Workers Free?
2. **Central server hook.** How should one be built in Astro 7 middleware, and what can it see?
3. **Auth/session.** How do we stop Auth and session failures from looking like "signed out" (audit R1, R2, R6)?
4. **Client.** What error channel should the browser have (audit C1–C3, W3, R9, P6, W11)?
5. **Tests.** Which existing tests pin behaviour these fixes would change?

## Summary

- **Cloudflare has a built-in error tracker, Workers Issues.** It changes the notifier choice.
  - **What it records:** "When a Worker throws an uncaught exception, fails an invocation, returns a `5xx` response, or logs an error, Issues records the failure as an occurrence." Source: https://developers.cloudflare.com/workers/observability/issues/, fetched and confirmed 2026-10-06.
  - **Cost:** "available to all Workers accounts in open beta… free to use during the beta period."
  - **Enabling it:** set `observability.issues.enabled: true`. This needs Wrangler ≥ 4.134.0; the repo has 4.131.1 (`package.json` `^4.131.1`).
  - **How it differs from an SDK:** it runs on the platform, so it adds no CPU or bundle cost and it sees `exceededCpu` kills, which no in-process SDK can.
  - **Destinations:** coding agent, generic webhook, chat (Slack, Discord, Google Chat, Teams), incident tools. **No plain email** (agent report from https://developers.cloudflare.com/workers/observability/issues/automations/; the overview page confirms webhook/chat and lists no email).
- **Three ways to reach the owner** (comparison in §1):
  - (a) Issues plus a chat or webhook destination: minutes, no new vendor.
  - (b) Issues plus a webhook into this app, which records the event so `/api/health` fails: the existing GitHub email, within the probe interval.
  - (c) Sentry: email within minutes, but a new vendor, PII collected by default, and an unmeasured per-request CPU cost against the 10 ms Free limit. Sentry cannot see `exceededCpu`.
- **Central hook.**
  - **What it sees:** a page or endpoint throw makes `await next()` reject in our middleware. The `next` in `callMiddleware` returns the render promise without a catch (`node_modules/astro/dist/core/middleware/callMiddleware.js:5-8`), and the page handler rethrows (`astro/dist/core/pages/handler.js`, case "page"). So a try/catch around `next()` sees every throw that happens before the response starts.
  - **What it misses:** errors after the first streamed byte. Streaming defaults to true (`astro/dist/core/app/base.js:73`), and our pages render their layout bodies lazily.
- **Auth.** `getUser()` errors are distinguishable. "No session" is `AuthSessionMissingError` and should stay quiet. Network failures and 5xx are `AuthRetryableFetchError`, and a non-JSON reply is `AuthUnknownError`; both should be logged and answered with 503.
- **Stale cookies (audit R2).** Confirmed and worse than the audit said:
  - The page client re-refreshes with the original request cookies (`src/lib/supabase.ts:14-15`).
  - Outside Supabase's refresh-token reuse window, that refresh fails. supabase-js then removes the session and writes cookie deletions over the middleware's fresh cookies, so the user is actually signed out.
  - Fix: reuse the middleware client via `locals.supabase` in the 14 request-path callers.
- **Client.** Eight fetch sites share two patterns. There is no error boundary. Astro dispatches an `astro:hydration-error` DOM event. `Layout.astro` is shared by all 10 pages and is the place for global handlers and a beacon.
- **Tests.** No test asserts "Brak połączenia", `database_paused`, or a 200 on a failed read. Smoke's anonymous-redirect and wrong-password steps keep passing if "no session" stays quiet and only `invalid_credentials` maps to "wrong password".

## Detailed Findings

### 1. Notifier options (the owner reads no logs; Workers Free; 10 ms CPU limit)

| Option                                                                           | Time to owner                                                                | New deps / secrets                                                       | CPU / bundle on Free                                                                                                                          | Sees CPU kill (1102)       | Client errors                                               | PII                                                                                                             | Status                                                                               |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Workers Issues + chat or webhook automation**                                  | minutes (phone app)                                                          | none, plus a wrangler bump                                               | none (platform)                                                                                                                               | yes                        | yes, via a beacon route that logs at error level (inferred) | stays in Cloudflare                                                                                             | open beta, free during beta                                                          |
| **Workers Issues + webhook → app records it → `/api/health` 503 → GitHub email** | ≤ 24 h with the daily cron (`.github/workflows/health.yml`), ≤ 1 h if hourly | webhook secret (`cf-webhook-auth`), one migration (table + SQL function) | none                                                                                                                                          | yes                        | yes                                                         | stays in Cloudflare and Supabase                                                                                | beta, plus our own code                                                              |
| **`@sentry/cloudflare` + `@sentry/astro` 11.4.0**                                | minutes (email)                                                              | 2 deps, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` for source maps                | ~178 KiB minified (~58 KiB gzip) for `withSentry` alone (agent measurement); per-request CPU not published, estimated 1–3 ms (**unverified**) | no (the isolate is killed) | yes, with a separate client SDK                             | IP, cookies, headers and request bodies collected by default (docs) unless `dataCollection`/`beforeSend` is set | GA; free plan 1 user, 5k errors/month                                                |
| Classic Cloudflare Notifications                                                 | —                                                                            | —                                                                        | —                                                                                                                                             | —                          | —                                                           | —                                                                                                               | no Workers error alert types (agent check of the notifications list)                 |
| Workers Logs query alerts, Tail Workers, Logpush                                 | —                                                                            | —                                                                        | —                                                                                                                                             | —                          | —                                                           | —                                                                                                               | no query alerts; Tail Workers and Logpush are Paid-only (docs)                       |
| `send_email` binding                                                             | minutes                                                                      | a domain on Cloudflare with Email Routing                                | small                                                                                                                                         | n/a                        | n/a                                                         | —                                                                                                               | not usable on `workers.dev` without a custom domain                                  |
| GitHub issue created from the Worker                                             | —                                                                            | write token as a Worker secret                                           | small                                                                                                                                         | n/a                        | n/a                                                         | —                                                                                                               | probably does not email the owner about their own action (inferred); not recommended |

Sources:

- https://developers.cloudflare.com/workers/observability/issues/ (confirmed)
- `…/issues/investigate/`, `…/issues/automations/`
- https://developers.cloudflare.com/workers/observability/logs/tail-workers/
- `…/logs/logpush/`
- https://docs.sentry.io/platforms/javascript/guides/cloudflare/frameworks/astro/
- `…/data-management/data-collected/`
- https://sentry.io/pricing/

Retention: Workers Logs on Free keep 3 days today and move to 7 days from 2026-12-01 (agent report). Issues occurrences keep 7 days (agent report).

Whatever the notifier, every handled failure must still reach the platform as an error-level log or a 5xx. For an in-process SDK, it must reach the SDK. That is the central hook (§2).

### 2. Central server hook in `src/middleware.ts`

- **A throw from a page or endpoint makes `next()` reject.** `callMiddleware.js:5-8` returns `responseFunction(...)` unwrapped. The page handler catches only to set `result.cancelled` and rethrows (`pages/handler.js`, case "page"). Our own middleware's throws reach `astro/dist/core/routing/handler.js:101-107`, which logs `err.stack` and renders a 500.
- **The final status.** Middleware sees statuses the pages set themselves (404, 500 via `Astro.response.status`). It does not see the error page that replaces a throw, because that happens outside the middleware, in `routing/handler.js`.
  - Recommended: log in the catch, then rethrow, so Astro renders `src/pages/500.astro` with `Astro.props.error`.
  - Astro still writes its own stack line, a duplicate we accept.
- **Error pages run the middleware again.** `renderDefaultError` (`astro/dist/core/errors/default-handler.js:64-76`) re-enters the middleware for `/404` or `/500` with the same `locals`, which can double-log.
  - Dedupe with `context.routePattern` being `/500` or `/404`, or with a `locals` flag.
  - Skip a second `getUser()` when `locals.user` is already set.
- **Streaming.**
  - Errors thrown while rendering slot content after the response started cannot change the status. Neither middleware nor Astro's catch sees them, and `500.astro` does not render for them.
  - This affects the audit's R7 throws in `applications/[id]/index.astro`: date and label formatting inside `<Layout>`.
  - Options:
    - wrap `response.body` in a pass-through stream that logs read errors;
    - move risky formatting into the page frontmatter;
    - render without streaming via our own `createApp({ streaming: false })` in `src/worker.ts` (heavier).
- **Release/version.**
  - Add `"version_metadata": { "binding": "CF_VERSION_METADATA" }` and optionally `"upload_source_maps": true` to `wrangler.jsonc` (both in `node_modules/wrangler/config-schema.json`).
  - Read the binding with `import { env } from "cloudflare:workers"`, which the adapter itself uses (`@astrojs/cloudflare/dist/utils/handler.js:1`), with a fallback such as `?? "dev"`.
  - Keep that import out of `src/lib/domain/` and out of anything Vitest imports.
  - Workers Issues shows the Worker version on its own (agent report).
- **`waitUntil`.** Available as `context.locals.cfContext.waitUntil` (`@astrojs/cloudflare/dist/utils/cf-helpers.js:23-26`). It is needed only if the hook calls something asynchronous.
- **Error log shape (proposed contract).** One line per failure, written by the hook:

  ```
  {level:"error", op, route, method, path (no query), status, userId, version,
   error:{name, message, code?, status?, details?, hint?, stack?, cause?}}
  ```

  - Never log email, note bodies, form values or file contents.
  - How workerd serialises `Error.cause` in `console.error` is **unknown**, so serialise explicitly.
  - PostgREST errors are plain objects whose HTTP status lives on the result, not on `error` (`@supabase/postgrest-js/dist/index.mjs:510-526`). Services should wrap them as `new Error(\`${op}: ${message}\`, { cause: {...error, status} })`.

- **Current catch sites.**
  - 12 request-path catches; only `api/health.ts:20` and `api/auth/signin.ts:25` check `isProjectPaused`.
  - Three pages answer 200 on a failed read: `dashboard.astro:18-21`, `cv.astro:26-28`, `applications/[id]/edit.astro:19-21`.
  - `formData()` runs outside `try` in 8 routes:
    - `api/applications/index.ts:12`
    - `[id]/index.ts:13`
    - `[id]/notes.ts:13`
    - `[id]/status.ts:14`
    - `[id]/cv.ts:16`
    - `api/notes/[id].ts:32`
    - `api/cv/index.ts:18`
    - `api/auth/signin.ts:7`

### 3. Auth/session failures (audit R1, R2, R6)

| Situation                                                                         | `getUser()` error (`@supabase/auth-js` 2.116.0) | Action                                           |
| --------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| No cookie, or session revoked                                                     | `AuthSessionMissingError` (status 400)          | stay quiet; redirect to sign-in / 401 (as today) |
| Network failure or abort                                                          | `AuthRetryableFetchError` (status 0)            | log + 503 / error page                           |
| Auth 5xx (520–530)                                                                | `AuthRetryableFetchError` (5xx)                 | log + 503                                        |
| Non-JSON, non-5xx reply                                                           | `AuthUnknownError`                              | log + 503                                        |
| Bad or expired JWT, refresh rejected (`refresh_token_already_used`, `bad_jwt`, …) | `AuthApiError` 400/401/403 + `code`             | log at warn level (no PII), then sign-in         |
| Paused project                                                                    | `AuthApiError` 540 (`withPauseDetection`)       | `/paused` (unchanged)                            |

All of these are returned, not thrown (`GoTrueClient.js:2673-2727`). Guards: `isAuthSessionMissingError`, `isAuthRetryableFetchError` and `isAuthApiError` from `@supabase/supabase-js`.

- **Stale cookies (R2).** Each `createClient` reads the original request `Cookie` header (`src/lib/supabase.ts:14-15`). After the middleware's refresh rotates tokens, a page client refreshes again with the used refresh token.
  - Inside the reuse window this costs an extra round trip.
  - Outside it, the refresh fails. `_callRefreshToken` calls `_removeSession()` (`GoTrueClient.js:4290-4311`), and the ssr client's `setAll` overwrites the fresh cookies with deletions. The user is signed out, and the page shows anon/RLS-empty data.
  - `AstroCookies.get` does read cookies set in this request (`astro/dist/core/cookies/cookies.js:67-75`), but there is no `getAll`, and Supabase uses chunked cookie names. So merging in `getAll` would be fragile.
  - **Minimal fix:** the middleware stores its client in `context.locals.supabase` (typed in `src/env.d.ts`). The 14 request-path callers reuse it:
    - 4 pages: `dashboard.astro:12`, `cv.astro:10`, `applications/[id]/index.astro:21`, `applications/[id]/edit.astro:10`;
    - 10 API routes: `api/applications/index.ts:17`, `[id]/index.ts:21`, `[id]/cv.ts:22`, `[id]/notes.ts:19`, `[id]/status.ts:24`, `api/notes/[id].ts:11`, `api/cv/index.ts:23`, `api/cv/[id].ts:13`, `api/auth/signin.ts:19`, `api/auth/signout.ts:5`.
    - `api/health.ts:14` (public, anon) may stay as it is. `src/worker.ts:26` (cron) stays.
- **Missing env (R6).** `createClient` returns `null` (`src/lib/supabase.ts:7-9`), and the env vars are `optional: true` (`astro.config.mjs:19-20`). The middleware's `else` branch (`src/middleware.ts:27-29`) should:
  - log once per isolate;
  - answer 503 `misconfigured` for `/api/*` (except health);
  - show an error page instead of the sign-in redirect;
  - have health report `misconfigured` instead of `db_unreachable`.

### 4. Client error channel (audit C1–C3, W3, R9, P6, W11)

- **8 fetch sites.** Seven follow pattern A (`json()` even when not ok, then a bindingless catch, then "Brak połączenia"):
  - `ApplicationForm.tsx:61-76` (the audit's `:457-461` was wrong);
  - `NotesPanel.tsx:23-32`, used 3 times;
  - `StatusControl.tsx:31-40`;
  - `CvPanel.tsx:23` (attach) and `:80` (upload);
  - `CvLibrary.tsx:121`.

  One follows pattern B: `CvPreview.tsx:25` (fetch, then `arrayBuffer`, then dynamic import, then render, all in one bare catch). The only inline script, `dashboard.astro:148-199`, does not fetch and has no try/catch.

- **Proposed helper.**
  - `src/lib/api-client.ts` exposes `apiRequest(url, init & {op})`, which returns a discriminated result: `ok`, `http` (JSON error body), `paused` (503 `database_paused`), `server` (non-JSON, e.g. a Cloudflare 1101/1102 HTML page or an empty 500), `network`, or `aborted`.
  - It checks content-type before parsing. A `bytes` variant serves CvPreview.
  - Pure classification and Polish message mapping go in `src/lib/domain/client-errors.ts` with tests (node environment, global `Response`).
  - Success reload/redirect stays in the callers.
- **Error boundary.** No dependency is needed: React is 19.3, and `react-error-boundary` is not installed. A small class `ErrorBoundary` wraps the `<Suspense>` around the lazy CvPreview in `CvPanel.tsx:135-137` and `CvLibrary.tsx:57-59`. Its fallback is a reload plus an "open file" link.
- **Hydration.** `@astrojs/react` passes no `onUncaughtError`/`onRecoverableError` (`@astrojs/react/dist/client.js:71-110`). `astro-island.js:62-90` retries an island import once and then dispatches a cancelable `astro:hydration-error` event (`detail {error, componentUrl}`).
- **Global handlers and beacon.**
  - A script in `src/layouts/Layout.astro` (used by all 10 pages) listens to `window` `error` and `unhandledrejection` and to `document` `astro:hydration-error`.
  - It ignores ResizeObserver loops, `AbortError`, extensions and cross-origin "Script error.".
  - It dedupes per page and caps at about 5 reports.
  - It sends `navigator.sendBeacon("/api/client-error", …)`, falling back to `fetch` with `keepalive`.
  - The payload is `{op, kind, status?, name, message≤300, path without query, componentUrl?, release?}`.
  - The route validates with zod, refuses bodies over ~4 KB early, answers 204, and logs one error-level line, which is how Workers Issues picks it up.
  - Requiring a session follows CLAUDE.md but loses reports from the sign-in and paused pages (open decision).
- **UI.** `src/components/ui/alert.tsx` (`destructive` variant) is used in islands. There is no toast component. `/dev/ui` has error examples (`src/pages/dev/ui.astro:283-288`); new states (server error with status, the paused link, the boundary fallback) belong there too. `ApplicationForm`, `CvLibrary` and `CvPreview` still use literal colours and are not on the UI contract; touching their error text invites migrating them.

### 5. Tests that pin current behaviour

- **Unchanged if "no session" stays quiet:**
  - `scripts/smoke.mjs:232`, `:477-478`: anonymous `/dashboard` and `/cv` redirect to sign-in.
  - `scripts/smoke.mjs:448`: an anonymous details page redirects with `?next=`.
- **Unchanged if only `code === "invalid_credentials"` maps to the wrong-password message:** `scripts/smoke.mjs:235-238` (wrong password → `?error=Nieprawid`). It breaks if zod rejects the 5-character test password with a different message.
- **Unchanged if the 401 check stays before body parsing:** `scripts/smoke.mjs:479-482` (anonymous POST → 401).
- **Unchanged if health still answers without cookies:** `scripts/smoke.mjs:230`, `:52` (`/api/health` 200 `"status":"ok"`).
- **Guard for the `locals.supabase` change:** `tests/e2e/auth.setup.ts:14-24` and `tests/e2e/seed.spec.ts:8-27` (sign-in, then reload, survives).
- **No assertions** on "Brak połączenia", `database_paused` or a 200 on a failed read, so changing these breaks nothing.
- **Template for a client-error E2E** (`page.route` answering HTML 503): `tests/e2e/status-revert.spec.ts:43-93` already observes requests.

## Code References

- `src/middleware.ts:8-44`: user resolution; pause handling (`:12-26`); null client (`:27-29`); no wrap of `next()`.
- `src/lib/supabase.ts:6-25`: `createClient`, `getAll` from the request `Cookie` header (`:14-15`).
- `src/layouts/Layout.astro`: shared by every page; no script today.
- `src/components/applications/{ApplicationForm,NotesPanel,StatusControl,CvPanel,CvLibrary,CvPreview}.tsx`: fetch sites listed in §4.
- `wrangler.jsonc:16-18`: `observability.enabled` (add `issues`, `version_metadata`, `upload_source_maps`).
- `node_modules/astro/dist/core/middleware/callMiddleware.js:5-8`, `pages/handler.js`, `routing/handler.js:101-107`, `errors/default-handler.js:64-105`, `cookies/cookies.js:67-75`, `app/base.js:73`.
- `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:2673-2727,4290-4311`; `lib/errors.js`, `lib/fetch.js`.
- `node_modules/@astrojs/cloudflare/dist/utils/handler.js:1,32,77`, `cf-helpers.js:23-26`.
- `node_modules/@astrojs/react/dist/client.js:71-110`.
- `.github/workflows/health.yml`: daily probe, the existing email path.

## Architecture Insights

- **Wiring.** The cheapest wide fix is one middleware hook, writing one structured error line, plus a platform tracker that already watches 5xx and error logs. Workers Issues makes the notifier a configuration and code-hygiene problem rather than an SDK integration. The remaining design question is how the owner gets the push: chat, or email through the health probe.
- **Session.** The session bug and the observability bug have one root: per-call clients built from request headers. Reusing the middleware client fixes the false sign-outs and gives every caller one place where Auth errors are classified.
- **Client.** The client fixes are independent of the notifier. They turn "Brak połączenia" into correct messages and feed the same error-level log through `/api/client-error`.

## Historical Context (from prior changes)

- `context/foundation/roadmap.md` F-01 asks whether built-in observability is enough or a separate tracker is needed (owner: user), and warns against over-building monitoring for a single-user app.
- `context/foundation/infrastructure.md` risk register: "Silent errors with nobody watching logs", M/M, mitigation "consider an error tracker later". Still accurate.
- `context/archive/2026-10-04-cv-upload-5mb-in-production/`: CPU 16–25 ms measured; the owner stays on Free and wants to switch at the first `exceededCpu`. Workers Issues makes that event visible, which the audit (C1) showed the code cannot.
- `context/archive/2026-10-06-testing-safe-migrations/`: the deploy gate now prevents the "code ahead of schema" write failures the audit's W1 mentioned.

## Related Research

- `context/audits/observability/2026-10-06_call-time-read-agreement-writes-cv-upload.md`: the input audit.

## Open Questions (decisions for /10x-plan)

1. **Notifier.** Workers Issues with a chat destination (minutes, phone app such as Discord), or Issues with a webhook to the app and the health probe (GitHub email, ≤ 24 h or hourly), or Sentry (email in minutes; new vendor, PII settings, CPU unmeasured)? Is depending on a **beta** feature acceptable?
2. **Health cadence.** If email goes through health: daily or hourly `health.yml`? How does the owner acknowledge an error (an `acknowledged_at` stamp, never a delete)?
3. **Beacon auth.** Should `/api/client-error` require a session (CLAUDE.md rule; loses sign-in and paused-page errors) or accept anonymous reports with stricter limits?
4. **Streaming errors.** Wrap the response body stream, move risky formatting into frontmatter, or accept the gap?
5. **Scope split.** Fix order items 1–6 in one change, or the server hook plus notifier first and the client channel second? Agreement-loss guards stay out of scope (separate change).
6. **Not verified:**
   - Sentry's per-request CPU;
   - whether Issues treats `exceededCpu` as a "failed invocation" (inferred yes);
   - workerd serialisation of `Error.cause`;
   - `version_metadata` values in `astro dev`;
   - this project's refresh-token reuse interval.
