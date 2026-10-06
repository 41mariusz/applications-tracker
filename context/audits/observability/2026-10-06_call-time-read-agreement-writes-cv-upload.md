---
type: observability-audit
date: 2026-10-06 08:24
mode: audit
commit: 69b43cb
branch: main
dirty_tree: false
areas: [call-time-read, agreement-writes, cv-upload]
area_source: user
runtime_proof: not-run
error_tracker: none (Cloudflare Workers Observability logs only)
previous_report: null
findings: { critical: 5, high: 14, medium: 15, low: 8 }
---

# Observability audit — call-time read, agreement writes, CV upload (2026-10-06)

## 1. TL;DR

- **Nothing notifies.** Every server failure ends in a `console.error` line, or in Astro's own logger, inside Workers logs that the owner never reads (confirmed by the owner). There is no error tracker, and no code path turns a failure into an alert. The only push signal is the daily `/api/health` probe, which checks DB reachability and keepalive age, never a user flow.
- **Astro swallows exceptions before the runtime sees them.** An uncaught throw in a page, endpoint or middleware becomes a returned 500 with an empty body, because there is no `500.astro`. The Workers invocation outcome stays `ok`, and nothing in the repo sees every 5xx. Some read failures even return **200**.
- **Supabase `{ error }` results are handled ad hoc.**
  - Auth failures in middleware are dropped, so an Auth outage looks like "signed out" (a redirect to sign-in or a 401) and leaves no log.
  - Sign-in errors are flattened into "wrong password".
  - The page-level client silently falls back to the anon key, so a session failure looks like "no applications" or a 404.
- **The browser has no failure channel.** A bindingless `catch {}` around `response.json()` turns every non-JSON reply into "Brak połączenia", including Astro's empty 500 and Cloudflare's 1102 CPU-limit page. No global handler, no error boundary, no report endpoint.
- **Most important consequence.** The two failures the roadmap cares about cannot reach the owner today:
  - a CPU-limit kill on CV upload (the user sees "no connection", and the code records nothing);
  - an Auth or session outage during a call (the user is silently "logged out", or sees an empty list or a 404).

## 2. Capture model

- **Runtime.** Cloudflare Worker with a custom entry `src/worker.ts:42-46`: `fetch: handle` from `@astrojs/cloudflare/handler`, plus a `scheduled` cron for the keepalive. Full SSR.
- **Request path.** `handle()` (`@astrojs/cloudflare/dist/utils/handler.js:79`) → Astro `render()`. A single `try` (`astro/dist/core/routing/handler.js:101-107`) wraps the middleware, endpoints and pages. On a throw it logs `err.stack || err.message` through the production console logger and renders a 500. There is no `src/pages/500.astro`, so the body is empty (`astro/dist/core/errors/default-handler.js:105`). Production request logging is a no-op (`astro/dist/core/app/app.js:7`).
- **Error tracker.** None. No SDK in `package.json` or `src/`.
- **Logging.**
  - 15 `console.error("<op> failed", e)` sites: 9 API routes, 4 pages, `api/health.ts:22`, and `worker.ts:23/35`. No structured logger.
  - Services rethrow Supabase PostgREST errors as **plain objects** `{code, details, hint, message}` (`@supabase/postgrest-js/dist/index.mjs:520-526`), with no stack and no HTTP status.
- **Middleware.** `src/middleware.ts:8-44` resolves the user and handles the Supabase pause (HTTP 540, `src/lib/supabase-paused.ts`). Nothing wraps `next()`.
- **Client.** React islands in `src/components/**` and an inline script in `dashboard.astro`. No `window.onerror`/`unhandledrejection` handler, no error boundary, no reporting.
- **Background work.** The keepalive cron logs and rethrows (`src/worker.ts:33-38`). Missing env logs and returns normally (`:21-25`).
- **Detection path in the repo.** `.github/workflows/health.yml` (daily curl) → `src/pages/api/health.ts` → `src/lib/domain/keepalive.ts:21-29`.
- **Deploy identity.** `wrangler deploy --message $GITHUB_SHA --tag <sha7>` (`.github/workflows/ci.yml`). No `version_metadata` binding and no `upload_source_maps` (`wrangler.jsonc`).

**Assumptions (outside the repo, not findings):**

- Workers Observability retains `console.*` output and invocation outcomes. Unconfirmed; logs are enabled in `wrangler.jsonc:16-18`.
- No Cloudflare alert or notification rules on errors or 5xx. Effectively confirmed by the owner ("I don't look at the logs").
- Whether Workers log events carry the script version id, which would map to the deploy SHA tag. Unconfirmed.
- Whether a rejected `ctx.waitUntil` in `scheduled` marks the cron run as failed in Cron history. Unconfirmed.
- GitHub failure emails for `health.yml` reach the owner. Confirmed earlier in the project.

## 3. What reaches the owner (static-only, no runtime probes)

| Failure shape                             | Response                                        | Platform logs                          | Notification              | Verdict        |
| ----------------------------------------- | ----------------------------------------------- | -------------------------------------- | ------------------------- | -------------- |
| Supabase read fails on `/dashboard`       | 200 + inline error                              | `listApplications failed` + object     | none                      | missed         |
| Supabase write fails (note, status, edit) | 500 JSON                                        | `<op> failed` + object, no ids         | none                      | poor           |
| Uncaught throw in a page or endpoint      | empty 500 (no `500.astro`)                      | Astro `[ERROR]` stack string, no route | none                      | poor           |
| Auth `getUser` error (not paused)         | 302 to sign-in / 401                            | nothing                                | none                      | missed         |
| Session refresh fails in the page client  | 200 "no applications" / 404                     | nothing                                | none                      | missed         |
| CPU-limit kill on `POST /api/cv`          | Cloudflare HTML 503 → client "Brak połączenia"  | outcome `exceededCpu` only             | none                      | missed         |
| Preview chunk or render failure (browser) | blank island / "Nie udało się pokazać podglądu" | nothing                                | none                      | missed         |
| Keepalive cron failure                    | —                                               | `keepalive: ping failed` + error       | health probe within ~48 h | good (delayed) |
| DB unreachable or paused                  | 503 / `/paused`                                 | health logs                            | health probe (daily)      | good           |

## 4. Systemic root causes

1. **No code path from an error to a human.**
   - **Mechanism.** All server error handling stops at `console.error`, either in the 15 route/page sites or in Astro's `logger.error` at `astro/dist/core/routing/handler.js:102`. Nothing wraps `next()` in `src/middleware.ts:44`, so no single place sees every 5xx. The only push channel checks DB health, not requests.
   - **Why.** It was enough during development, when someone was watching.
   - **Explains:** P1, P2, P3, W1, W2, R4, C8.
2. **Supabase's "return `{error}`" contract is handled case by case.**
   - **Where errors are dropped.** Errors that are not rethrown are dropped or flattened:
     - middleware `getUser` errors, unless the project is paused (`src/middleware.ts:12-16`);
     - sign-in errors (`src/pages/api/auth/signin.ts:39-43`);
     - sign-out (`signout.ts:7`).
   - **Where rethrown errors lose detail.** Rethrown errors are plain objects without stack or status (`src/lib/services/*.ts`, ~20 sites).
   - **The page client.** It reads the original request cookies (`src/lib/supabase.ts:14-15`). supabase-js falls back to the anon key when there is no session (`@supabase/supabase-js/dist/index.mjs` `_getAccessToken`), so RLS returns empty results instead of an error.
   - **Explains:** R1, R2, R3, R6, P5, W8.
3. **The client has no failure channel.**
   - **Mechanism.** The fetch, then `response.json()`, then bindingless `catch {}` pattern appears in `NotesPanel.tsx:29`, `StatusControl.tsx:31-40`, `ApplicationForm.tsx:72`, `CvPanel.tsx:53`, `CvLibrary.tsx:131` and `CvPreview.tsx:32`. It relabels every non-JSON server reply as a network problem and reports nothing. `lazy(() => import("./CvPreview"))` has no error boundary.
   - **Why.** It was a reasonable default for a happy-path UI.
   - **Explains:** C1, C2, C3, W3, P6, R9.
4. **Log-and-render without status or context.**
   - **Wrong status.** Pages render an inline error but keep status 200: `dashboard.astro:17-22`, `cv.astro:25-29`, `applications/[id]/edit.astro:19-23`.
   - **Missing context.** Log lines carry an op label but no route, method, user, entity id, step or error code. Several reads share one catch with the wrong label (`applications/[id]/index.astro:29-33`, `services/notes.ts:111-113`).
   - **Explains:** R4, R5, W2, C5, C8, P4.
5. **Ambiguous negative results.** SQL functions return a boolean `false` for "not found", "not visible (RLS)", "removed" and "conflict" (`supabase/migrations/20260930150000_atomic_writes.sql:7,101`). Services map that to 404/409 and never log it (`services/notes.ts:58`, `services/applications.ts:124,179`). A persistent RLS or auth bug therefore looks like normal user conflicts.
   - **Explains:** W5, W6, W7.

## 5. Findings by area

### Call-time read (sign-in → dashboard/search → details)

| #   | Location                                                                                                                        | Category                                 | Severity               | What happens in production                                                                                                                                                                                                                          | Fix direction                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| R1  | `src/middleware.ts:12-16,21`                                                                                                    | swallowed / flattened-response           | critical               | Auth 5xx, timeout or JWT error → `user = null` → protected pages redirect to sign-in and the API returns 401, with no log. The owner is "logged out" during a call and may loop sign-in → bounce. Health stays green because it never touches Auth. | Log non-session errors (`name`, `status`, `code`, path) and answer 503 / an error page instead of the sign-in redirect     |
| R2  | `src/lib/supabase.ts:14-15`; `dashboard.astro:31-36`; `applications/[id]/index.astro:21-29`                                     | missing-throw / flattened-response       | critical (static-only) | The page client reads stale request cookies. If its token refresh fails, supabase-js uses the anon key, RLS returns 0 rows, and the owner sees "Nie masz jeszcze żadnych aplikacji" or 404 "Nie znaleziono". No error, no log.                      | Reuse the middleware's client or user via `locals`, or read `context.cookies`; fail loudly when the session is missing     |
| R3  | `src/pages/api/auth/signin.ts:28-43,108-110`                                                                                    | swallowed / flattened-response           | high                   | Every non-credential Auth error (429, 5xx, `email_not_confirmed`, `validation_failed`) shows as "Nieprawidłowy e-mail lub hasło" or a generic message. Nothing is logged. `formData()` and `as string` run without validation.                      | Log `{op:"signin", code, status}` (never the email); map only `invalid_credentials` to "wrong password"; validate with zod |
| R4  | `src/pages/dashboard.astro:17-22`                                                                                               | flattened-response / logged-not-captured | high                   | A failed list read returns **200** with a banner. Status-based checks never see it, and the log has no user or query context.                                                                                                                       | `Astro.response.status = 500` (or redirect to `/paused` when paused); add context to the log                               |
| R5  | `src/pages/applications/[id]/index.astro:29-33`                                                                                 | missing-context / identity-lost          | high                   | One catch covers `getApplicationDetails` and `listCvFiles`. A `cv_files` failure takes down the whole call-time page under the wrong label, with no application id.                                                                                 | Separate catches and labels with `{op, applicationId}`; degrade only the CV panel                                          |
| R6  | `src/lib/supabase.ts:7-9`; `astro.config.mjs:19-20` (`optional: true`)                                                          | config / swallowed                       | high                   | Missing Worker secrets → `null` client → everyone is "signed out", pages show empty or 404, and health reports `db_unreachable`. No log.                                                                                                            | Log loudly once and answer 503 `misconfigured`; consider making the env required                                           |
| R7  | no `src/pages/500.astro`; unguarded render code (`applications/[id]/index.astro:44,115,166,177,182`; `src/lib/format.ts:21-28`) | coverage-gap                             | medium                 | A malformed date or row throws during render. The owner gets an empty 500, and the log has a stack but no route or id.                                                                                                                              | Add `500.astro`; central logging (see P2)                                                                                  |
| R8  | `dashboard.astro` catches, `applications/[id]/index.astro:30-33`                                                                | flattened-response                       | medium                 | A pause (540) that starts after the middleware check shows a generic error instead of `/paused`.                                                                                                                                                    | `isProjectPaused(e)` → redirect to `/paused`                                                                               |
| R9  | `src/pages/dashboard.astro:148-217` (inline script)                                                                             | coverage-gap                             | medium                 | If the live-search script throws (bad `data-search`, normalisation bug), typing filters nothing, and only the browser console knows.                                                                                                                | try/catch with a visible fallback; client error beacon (see C-fix)                                                         |
| R10 | `applications/[id]/index.astro:45`                                                                                              | swallowed                                | low                    | `cv_file_id` set but not in the library → "Nie dołączono CV.", with no log.                                                                                                                                                                         | Log a warning when an attached CV is not resolved                                                                          |
| R11 | `src/lib/domain/changes.ts:66-67`; label lookups `applications/[id]/index.astro:50-51,168-170`                                  | swallowed (latent)                       | low                    | An unknown history field or enum value silently disappears or renders blank.                                                                                                                                                                        | Render unknown values generically and count dropped ones                                                                   |

### Agreement writes (notes, status, edit, create)

| #   | Location                                                                                                                                | Category                    | Severity | What happens in production                                                                                                                                                                                                                                                                                                 | Fix direction                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| W1  | `src/pages/api/applications/index.ts:27`, `[id]/index.ts:35`, `[id]/status.ts:40`, `[id]/notes.ts:30`, `src/pages/api/notes/[id].ts:22` | logged-not-captured         | critical | Every write failure is only a log line, and health never exercises writes. The owner learns about a broken write path while recording a phone-call agreement, with no history of how long it has failed. (The deploy-before-migration case is now blocked by the CI migration gate; RLS, Auth or Supabase faults are not.) | Central 5xx hook that notifies (see fix order 1–2)                                                 |
| W2  | `src/pages/api/notes/[id].ts:22`; all write routes                                                                                      | missing-context             | high     | `"note update failed"` covers both edit and remove. No route logs the application or note id, method, user or target status.                                                                                                                                                                                               | Structured `{op, noteId, applicationId, userId, code}`                                             |
| W3  | `NotesPanel.tsx:27-30`, `StatusControl.tsx:31-40`, `ApplicationForm.tsx:457-461`                                                        | flattened-response          | high     | A server 500 (empty body), 1101/1102 or HTML 502 makes `json()` throw. The owner sees "Brak połączenia", retries, and nobody captures the status.                                                                                                                                                                          | Check `content-type`/`ok` before `json()`; show "Błąd serwera (<status>)"                          |
| W4  | `formData()` before `try`: `applications/index.ts:12`, `[id]/index.ts:13`, `[id]/notes.ts:13`, `[id]/status.ts:14`, `notes/[id].ts:32`  | coverage-gap                | high     | A truncated or malformed body throws past the route's catch. The result is an empty Astro 500, the client shows "Brak połączenia", and there is no op log.                                                                                                                                                                 | Parse inside the try; answer 400 with a log                                                        |
| W5  | `src/pages/api/applications/[id]/index.ts:19`; `src/lib/services/applications.ts:159-165`                                               | swallowed (agreement lost)  | high     | The rate-change note is truncated to 2000 characters silently. It is also dropped silently when the server diff finds no `quoted_rate` change. Both return 200.                                                                                                                                                            | Validate with zod (max length, clear error); warn or 409 when a sent note was not saved            |
| W6  | `src/lib/services/applications.ts:99-121,150-158,172`                                                                                   | missing-throw (correctness) | high     | The concurrency guards compare against the server's own fresh read, not what the user saw. A stale tab silently overwrites a newer value with 200, and the change log records it as a fresh change.                                                                                                                        | Send `updated_at` / the shown status from the client and compare against that                      |
| W7  | `services/notes.ts:58`; `applications.ts:124,179`; routes map `!ok` → 404/409                                                           | flattened-response          | medium   | A boolean `false` (RLS / not visible / removed / conflict) becomes an unlogged 404/409, so a persistent permission bug looks like normal conflicts.                                                                                                                                                                        | Log every unexpected `false` with ids; distinct codes                                              |
| W8  | `src/lib/services/notes.ts:68`                                                                                                          | swallowed                   | medium   | Note removal is a direct update with no row count. If 0 rows change (RLS, race), the route returns 200, the note is not crossed out, and nothing is logged.                                                                                                                                                                | `remove_note()` SQL function returning boolean, or `.select("id")` with 0 rows treated as an error |
| W9  | `applications.ts:125,180` ("Odśwież stronę"); 401 "Zaloguj się ponownie"                                                                | swallowed (data loss)       | medium   | Following the error advice (refresh or sign in again) discards the typed note or edits.                                                                                                                                                                                                                                    | Keep drafts in `sessionStorage`, or change the advice                                              |
| W10 | `NotesPanel.tsx:29-30`, `ApplicationForm.tsx:460-461`                                                                                   | identity-lost               | medium   | A lost response after commit → "Brak połączenia" → retry → a duplicate note or application (nothing can be deleted).                                                                                                                                                                                                       | Idempotency key on POSTs                                                                           |
| W11 | `middleware.ts:23` + clients showing `data.error`                                                                                       | flattened-response          | low      | The user sees the raw code `database_paused` with no link to `/paused`.                                                                                                                                                                                                                                                    | Map known codes to Polish text and a link                                                          |
| W12 | `StatusControl.tsx:38-39`; `status.ts:7,33`                                                                                             | flattened-response          | low      | A 409 `requiresConfirmation` (status changed in another tab) cannot be confirmed from the UI.                                                                                                                                                                                                                              | Honour the flag and show the dialog                                                                |

### CV upload and preview

| #   | Location                                                                                         | Category                             | Severity | What happens in production                                                                                                                                                                                                    | Fix direction                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| C1  | `CvPanel.tsx:53-54,80-81`; `CvLibrary.tsx:121-122,131-132`; `src/pages/api/cv/index.ts:18,28-36` | coverage-gap / flattened-response    | critical | A CPU-limit kill (1102/503 HTML) → `json()` throws → "Brak połączenia". The route catch never runs and there is no size breadcrumb. The owner's plan to "switch at the first `exceededCpu`" (roadmap F-01) can never trigger. | Check `ok`/content type; a specific message plus a report for a non-JSON 5xx; log the file size before parsing |
| C2  | `CvPanel.tsx:12,135-137`; `CvLibrary.tsx:10,56-60`                                               | coverage-gap                         | critical | A failed `lazy(import("./CvPreview"))` (stale chunk after a deploy, flaky phone network) has no error boundary and unmounts the whole island. The CV panel or library vanishes, and only the browser console knows.           | ErrorBoundary with a reload fallback and a report                                                              |
| C3  | `src/components/applications/CvPreview.tsx:32-34`                                                | swallowed                            | high     | One bare `catch {}` covers 404, 500, 503 paused, a failed `cv-render` import and a pdf.js/docx render error. The owner sees "Nie udało się pokazać podglądu" and nobody gets the cause.                                       | `catch (e)`, tell causes apart, report with `cvId` and mime                                                    |
| C4  | `src/pages/cv.astro:13,25-30`                                                                    | flattened-response / config          | high     | A failed library read returns 200. A null client shows "Biblioteka jest pusta", which looks like data loss.                                                                                                                   | Status 500; a logged 500 for a missing client                                                                  |
| C5  | `src/lib/services/cv.ts:24-47`; `api/cv/index.ts:32-35`                                          | missing-context / coverage-gap       | high     | Storage upload succeeds but the `cv_files` insert fails: an orphan object. The log says only `uploadCv failed`, with no step, path or sha.                                                                                    | Log `{step, path, sha256, size}`; log the "healed orphan" branch                                               |
| C6  | `src/lib/services/cv.ts:29`                                                                      | swallowed / noise                    | medium   | The duplicate path is decided by regex on the message (`/exists\|duplicate/`), not `statusCode 409`. A future message could be swallowed, and the heal is never logged.                                                       | Check `statusCode`; log the branch                                                                             |
| C7  | `services/cv.ts:94-95`; `api/cv/[id].ts:19-20,31-34`                                             | missing-context / flattened-response | medium   | A missing storage object (row without file) → 500, the same as a transient error, with no `cvFileId` or path.                                                                                                                 | A distinct logged `orphan_row` state → 404/410                                                                 |
| C8  | `api/cv/index.ts:34`, `api/cv/[id].ts:33`, `api/applications/[id]/cv.ts:32`                      | missing-context                      | medium   | Logs have no user, file, size, mime, sha, id or step, and no Supabase `code`/`statusCode`.                                                                                                                                    | Structured log object                                                                                          |
| C9  | `api/cv/index.ts:18`; `api/applications/[id]/cv.ts:16`                                           | coverage-gap                         | medium   | `formData()` outside `try`: a truncated upload → empty 500 → "Brak połączenia", with no op log.                                                                                                                               | Parse inside the try (`step: "parse"`), answer 400                                                             |
| C10 | `api/cv/[id].ts:14-16,19,33`                                                                     | noise                                | low      | A non-UUID id → 22P02 logged as an error and answered 500; `!id` says "Supabase nie jest skonfigurowany".                                                                                                                     | `isUuid` → 404; correct message                                                                                |

### Platform / plumbing

| #   | Location                                                                                     | Category                             | Severity | What happens in production                                                                                                                        | Fix direction                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | `src/middleware.ts:44` (no wrap of `next()`); `astro/dist/core/app/app.js:7`                 | coverage-gap                         | high     | No single place sees every 5xx or throw, and there is no request log in production.                                                               | Wrap `next()`: try/catch plus `status >= 500` → one structured line                                                                       |
| P2  | nothing besides `.github/workflows/health.yml`                                               | coverage-gap                         | high     | Request-level failures never reach the owner.                                                                                                     | Send the P1 hook's events to a notifier (error tracker such as `@sentry/cloudflare`, or a Workers Observability alert); post-deploy probe |
| P3  | no `src/pages/500.astro`; `astro/dist/core/routing/handler.js:102`; `default-handler.js:105` | flattened-response / missing-context | medium   | An uncaught error gives an empty 500. For plain-object errors the log keeps only the message (code, details and hint are lost).                   | `500.astro`; log the full object via P1                                                                                                   |
| P4  | `src/lib/services/*.ts` (`throw error`, ~20 sites)                                           | identity-lost                        | medium   | PostgREST errors rethrown as plain objects: no stack, no HTTP status, no indication of which parallel query failed (`services/notes.ts:111-113`). | `new Error("<op>: <msg>", { cause: error })`, keeping code, details, hint and status                                                      |
| P5  | `src/worker.ts:21-25,42-45`                                                                  | missing-throw                        | medium   | Missing secrets → the cron logs and returns normally, so the run looks successful. The rejection semantics of `waitUntil` are unverified.         | Throw on missing env; make `scheduled` async and `await`                                                                                  |
| P6  | client catches (see root cause 3)                                                            | coverage-gap                         | medium   | No `window.onerror`/`unhandledrejection` handler and no report endpoint: browser failures never reach the server.                                 | Small `/api/client-error` beacon (path, message, no PII) logged through P1                                                                |
| P7  | `wrangler.jsonc` (no `upload_source_maps`, no `version_metadata`)                            | config / identity-lost               | low      | Stacks point at bundled chunks, and logs are not tied to the deploy SHA in code.                                                                  | Enable source maps; `version_metadata` binding in the P1 log line                                                                         |
| P8  | `.github/workflows/ci.yml` deploy (no post-deploy check)                                     | coverage-gap                         | low      | A broken deploy is noticed at the next 07:23 UTC probe, or never if only routes break.                                                            | curl `/api/health` (plus one route) after `wrangler deploy`                                                                               |
| P9  | `src/pages/api/health.ts:15`; `src/pages/api/auth/signout.ts:7`                              | missing-context / swallowed          | low      | A null client → 503 with no log; a failed server-side sign-out revoke is ignored.                                                                 | Log the reasons                                                                                                                           |

## 6. Recommended fix order

1. **Central server hook in `src/middleware.ts`.** Wrap `next()`: catch and log any throw, and log any response with `status >= 500`. Write one structured JSON line `{route, method, status, userId, version, error: {name, message, code, details, hint, stack}}`, with no PII (user id only, never email or note text). Add `500.astro`.
   - **Closes or improves:** P1, P3, R7, part of P4.
   - **Constraint:** routes that already `console.error` would log twice. Have the hook own the error line and keep route logs as context, or drop the route logs.
2. **A notifier for that one line.** The owner reads no logs, so the hook must push. Options: an error tracker (`@sentry/cloudflare` with a Workers integration), or a Cloudflare Workers Observability alert on error-level logs or 5xx. This is the F-01 decision.
   - **Closes:** P2, W1 and the "nothing notifies" half of R4, C4 and C5.
   - **Constraint:** keep scrubbing (no note bodies, emails or CV contents); tag the release with the deploy SHA (P7).
3. **Stop treating Auth/session failures as "signed out".** Middleware logs non-session `getUser` errors and answers 503 or an error page. Page clients reuse the middleware's session. Sign-in logs non-credential errors.
   - **Closes:** R1, R2, R3, R6.
   - **Constraint:** keep "no session" (missing cookie) quiet; it is normal.
4. **One `fetchJson` client helper plus an error boundary and beacon.** It checks `ok` and content type, distinguishes network errors from server errors (showing the status), and sends a small `/api/client-error` report for a non-JSON 5xx and for caught render or chunk errors. Wrap the lazy CvPreview in an ErrorBoundary.
   - **Closes:** C1, C2, C3, W3, R9, P6, W11.
   - **Constraint:** beacon payload is path, op, status and error name/message only.
5. **Right status and context on read failures.** `dashboard.astro`, `cv.astro` and `edit.astro` return 500 (or `/paused`). Use separate catches and labels on the details page, and wrap rethrown PostgREST errors with `cause`.
   - **Closes:** R4, R5, R8, C4, P4, C8, W2.
6. **Parse request bodies inside the try** in all write and upload routes, with zod for sign-in.
   - **Closes:** W4, C9, part of R3.
7. **Agreement-loss guards** (correctness more than observability):
   - validate and confirm the rate-change note;
   - concurrency against the version the user saw;
   - `remove_note()` with a row check;
   - draft preservation;
   - idempotency keys.
   - **Closes:** W5, W6, W8, W9, W10. Each is its own small change; W5 and W6 come first.
8. **Polish:** C6, C7, C10, R10, R11, W7, W12, P5, P8, P9.

## 7. Changes since last audit

First run, no previous report.

## 8. Method and limits

- **Agents.** Four read-only auditors in parallel: call-time read, agreement writes, CV upload and preview, and cross-cutting plumbing (which read Astro 7.3.2, @astrojs/cloudflare 14.3.1 and postgrest-js 2.116.0 sources).
- **Spot-checked by hand.**
  - `src/middleware.ts:12-16`: a `getUser` error is checked only by `isProjectPaused`.
  - `astro/dist/core/routing/handler.js:101-107`: a throw becomes a rendered 500 plus a `logger.error` string.
  - `src/pages/dashboard.astro:17-22`: no status set on failure, while `applications/[id]/index.astro:38` does set 500.
  - `StatusControl.tsx:31-40`: `json()` inside a bindingless catch → "Brak połączenia".
  - `src/lib/supabase.ts:14-15`: `getAll` reads the request `Cookie` header.
  - supabase-js `_getAccessToken` falls back to `supabaseKey`.
- **Adjusted.**
  - The writes auditor's "deploy before `db push` breaks every write invisibly" is now blocked by the CI migration gate (archive `2026-10-06-testing-safe-migrations`). W1 is kept for the other causes (Auth, RLS, Supabase faults).
  - W6 is a correctness issue surfaced by this audit, kept because it produces a silent wrong success.
  - R2's refresh-failure path is **static-only**. It depends on Supabase refresh-token reuse timing.
- **Repo-wide sweep (src).**
  - 6 bindingless client catches;
  - 0 server-side catch-and-swallow;
  - 15 `console.error`;
  - ~20 rethrown plain PostgREST objects;
  - 3 ignored `{error}` results (middleware, sign-in, sign-out);
  - 3 `new Error` without cause (acceptable).
- **Runtime proof: not run.** Production log rendering of `console.error(str, obj)` and the cron/`waitUntil` outcome were not verified. A probe harness can be added in verify mode after the first fixes: run the app locally against local Supabase, inject failure shapes, and point a fake ingest (`.claude/skills/10x-observability-audit/scripts/fake-ingest.mjs`) at the notifier from fix 2.
