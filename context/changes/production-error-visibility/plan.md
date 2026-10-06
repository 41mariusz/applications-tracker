# Production Errors Reach the Owner (F-01) Implementation Plan

## Overview

Make every production failure reach the owner within minutes, even though they never read logs. The failures in scope are:

- a 5xx response;
- an uncaught exception, including one thrown after a page started streaming;
- a CPU-limit kill;
- a browser error.

Stop the code from hiding failures:

- Auth trouble that looks like "signed out";
- server errors shown as "Brak połączenia";
- failed reads answered with 200;
- log lines that carry no context.

Detection uses Cloudflare **Workers Issues** (open beta, free on all plans; it runs on the platform, so there is no SDK and no CPU cost). Delivery: an Issues automation sends a **generic webhook** to a small app endpoint (`/api/alerts/issue`), which forwards a Polish summary to the owner's **Telegram** through a bot. (Issues has no Telegram or email destination; Discord was declined because the owner does not use it.)

## Current State Analysis

From `context/changes/production-error-visibility/research.md` and the input audit `context/audits/observability/2026-10-06_call-time-read-agreement-writes-cv-upload.md`:

- **Nothing reaches the owner today.**
  - There is no error tracker.
  - 15 failure sites write `console.error("<op> failed", e)`.
  - Astro turns thrown errors into an empty 500 (`node_modules/astro/dist/core/routing/handler.js:101-107`; there is no `500.astro`).
  - The only push signal is the daily `/api/health` probe, which covers database health only.
- **Workers Issues** records "an uncaught exception, fails an invocation, returns a `5xx` response, or logs an error". It needs `observability.issues.enabled` and Wrangler ≥ 4.134.0. The repo has `wrangler ^4.131.1` (`package.json`) and `observability.enabled: true` (`wrangler.jsonc:16-18`). Automations deliver to a coding agent, a generic webhook, chat (Slack, Discord, Google Chat, Teams) or incident tools; email and Telegram are not destinations (https://developers.cloudflare.com/workers/observability/issues/automations/). The generic webhook sends the standard Notifications payload (`name`, `text`, `data`, `ts`, `alert_type`, …) with the secret in the `cf-webhook-auth` header (https://developers.cloudflare.com/notifications/reference/webhook-payload-schema/, `…/get-started/configure-webhooks/`).
- **The middleware can see thrown errors.** A page or endpoint throw makes `await next()` reject: `callMiddleware.js:5-8` returns the render promise unwrapped, and the page handler rethrows. Error pages run the middleware again with the same `locals` (`errors/default-handler.js:64-76`).
- **Streaming errors are invisible.** Rendering streams by default (`app/base.js:73`). An error raised after the first byte is invisible to both the middleware and Astro.
- **Auth.** `getUser()` returns these errors, never throws them:
  - `AuthSessionMissingError` means no session (normal);
  - `AuthRetryableFetchError` means a network failure or a 5xx;
  - `AuthUnknownError` means a non-JSON reply;
  - `AuthApiError` means a bad or rotated token (status 540 means paused).

  `src/middleware.ts:12-16` treats every one of them except "paused" as signed out.

- **Stale cookies.** Each `createClient` reads the original request `Cookie` header (`src/lib/supabase.ts:14-15`). After the middleware refreshes the session, a second client in a page or route refreshes again with the already-used token. That can really sign the user out, and RLS then returns empty data. There are 14 request-path callers (research §3).
- **Missing configuration is silent.** `createClient` returns `null` and logs nothing (`src/lib/supabase.ts:7-9`; env is `optional: true`).
- **Request handling.**
  - `formData()` runs outside `try` in 8 routes.
  - Three pages answer **200** when a read fails: `dashboard.astro:18-21`, `cv.astro:26-28`, `applications/[id]/edit.astro:19-21`.
  - The details page has one catch for two reads (`applications/[id]/index.astro:29-33`).
  - Services rethrow PostgREST errors as plain objects with no stack and no status.
- **Client.**
  - 8 fetch sites call `response.json()` inside a bindingless `catch {}` that shows "Brak połączenia": ApplicationForm, NotesPanel (×3), StatusControl, CvPanel (×2), CvLibrary. CvPreview has its own bare catch.
  - No error boundary exists.
  - Astro emits `astro:hydration-error`.
  - `src/layouts/Layout.astro` is shared by all 10 pages.
- **Tests that pin behaviour.** Smoke's anonymous-redirect and wrong-password steps pass as long as "no session" stays quiet and only `invalid_credentials` maps to "wrong password". The e2e sign-in-and-reload test guards the session change. No test asserts "Brak połączenia" or a 200 on a failed read.

## Desired End State

- **Server failures reach Telegram.** Every server failure in production becomes a Workers Issues occurrence: a thrown error, a 5xx, a CPU-limit kill, or an error raised after streaming started. Each is tied to a release. The owner's Issues automation (occurrence threshold 1) calls `/api/alerts/issue`, which checks the webhook secret and sends a Polish Telegram message through the owner's bot.
- **One structured error line per failure** (JSON with op, route, method, status, userId, version, error name/message/code/details/hint/stack/cause, no PII) is written by one hook. A thrown error renders a proper `500.astro`.
- **Auth outages are not sign-outs.**
  - An Auth outage or misconfiguration answers 503 or shows an error page, and is logged.
  - "No session" still redirects quietly.
  - Pages and routes reuse the middleware's Supabase client, so they never refresh a used token.
  - Sign-in shows "wrong password" only for `invalid_credentials` and logs other failures.
- **Responses tell the truth.**
  - Failed reads return 500, or `/paused` when the project is paused.
  - Request bodies are parsed inside error handling.
  - Logs name the operation, the entity id and the step.
- **The browser distinguishes failures.** It tells network errors from server errors (showing the status) and from the paused state (linking to `/paused`).
  - Client errors (non-JSON 5xx, render or chunk failures, uncaught errors, hydration errors) reach the server through `/api/client-error` (signed-in users only) and from there Issues.
  - A failed CV preview chunk no longer blanks its panel.
- **The chain is proven in production.** A signed-in test report (`kind: "test"`) sent from the browser console reaches Telegram. The runbook documents this check.

Verify with `npm test`, `npm run lint`, `npx astro check`, `npm run smoke` (local), `npx playwright test`, plus the production test report in Telegram.

### Key Discoveries:

- **Logging policy that avoids duplicate issues.**
  - The hook owns the error line for thrown errors and for 5xx responses.
  - Routes that catch an error set `locals.errorLogged = true` after calling `logError` with their context, so the hook does not log the same failure twice.
  - Error-page renders are skipped (`context.routePattern` is `/500` or `/404`, or the flag is already set).
- **Version.** Read it from the `version_metadata` binding via `import { env } from "cloudflare:workers"` (the adapter itself imports it: `@astrojs/cloudflare/dist/utils/handler.js:1`). Keep that import out of `src/lib/domain/` and out of anything Vitest imports; fall back to `"dev"`.
- **How `console.error` serialises `Error.cause` on workerd is unknown.** So the formatter serialises explicitly, and the log is one `console.error(JSON.stringify(line))`.
- **Auth classifier.** Use `isAuthSessionMissingError`, `isAuthRetryableFetchError` and `isAuthApiError`, all re-exported by `@supabase/supabase-js`. Keep `isProjectPaused` first.
- **Paused-mode exemption.** `/api/client-error` must not be in `PAUSED_PASSTHROUGH` (`src/middleware.ts:6`): a paused project answers 503 there, which is fine. `/api/alerts/issue` **must** be in it: it does not touch the database, and alerts matter most while Supabase is paused.
- **No alert loop.** Issues records any 5xx the Worker returns and any error-level log. If the alert endpoint answered 5xx or logged at error level when Telegram fails, that would create a new occurrence that calls the same endpoint again. So the endpoint never returns 5xx and logs delivery failures with `console.warn` only. A wrong or missing secret answers 401 (4xx is not recorded).

## What We're NOT Doing

- **Agreement-loss guards** from the audit (W5 rate-note truncation and drop, W6 concurrency against the user's version, W8 `remove_note()` row check, W9 drafts, W10 idempotency keys). They go in a separate change.
- **A vendor SDK** (Sentry). **Email, Discord or other channels**: Telegram was chosen. **Acknowledgement and health-probe bridging.**
- **Anonymous client reports.** Errors on the sign-in and `/paused` pages are not reported from the browser (decision).
- **Full token migration** of ApplicationForm, CvLibrary and CvPreview. Only their error elements move to tokens/`Alert` (decision), and these files are not added to `check-ui-literals`.
- **Changing what counts as "no session".** Missing or revoked sessions still redirect quietly.
- **Distinct 404/409 codes for SQL `false` results** (audit W7), **CV orphan-row states** (C6, C7), the **`isUuid` check on `/api/cv/[id]`** (C10) and the **cron env throw** (P5). These are polish for a later change. P5 is noted in the runbook.
- **Paid Cloudflare features** (Tail Workers, Logpush). **Pinning the runner OS.**

## Implementation Approach

Server detection comes first, so value arrives after Phase 1: every 5xx and every throw already reaches Telegram once the owner adds the bot secrets and the automation. Next comes the session and auth fix, which removes the most harmful false signal (false sign-outs). Then responses are made honest. The client channel follows. Docs and the production proof come last.

Pure rules each get a `.test.ts` per CLAUDE.md conventions:

- the error-line formatter;
- the auth-error classifier;
- the client response classifier;
- message mapping;
- the beacon payload and noise filter.

Side effects stay in thin wrappers. Every new check is shown to protect by a deliberate break.

## Critical Implementation Details

- **Order of the Issues flag.** `observability.issues.enabled` only takes effect when deployed with Wrangler ≥ 4.134.0. CI runs `npx wrangler deploy` from the lockfile (`.github/workflows/ci.yml` deploy job), so the dependency bump must land in the same commit as the flag. Per Cloudflare's docs, deploying with an older Wrangler would turn Issues off again.
- **Rethrow after logging.** The hook must rethrow after logging a thrown error, so that Astro renders `500.astro` with `Astro.props.error`. Returning its own empty 500 would reroute with `props.error = null`. Astro's own stack line remains as a known duplicate in the raw logs. It does not create a second issue, because Issues groups occurrences by error.
- **Cross-origin POST check.** Astro's `security.checkOrigin` answers 403 to cross-site POSTs with form-like content types (a production `curl -X POST` without `Origin` to a non-existent route got 403 on 2026-10-06). Cloudflare's webhook sends `application/json` without an app `Origin`, so `/api/alerts/issue` must be reachable for exactly that request; the smoke steps send it without an `Origin` header and with `content-type: application/json`. If Astro still blocks it, exempt this one route explicitly rather than turning the check off.
- **Stream wrapper.** It must pass bytes through untouched and only observe read errors. It applies to `text/html` responses only, never to file downloads (`/api/cv/[id]`), so it adds no buffering.

## Phase 1: Detection floor — Issues, release identity, central hook, 500 page, Telegram alerts

### Overview

Turn on platform error tracking, tag releases, give the server one place that logs every failure in a structured, PII-free line, and deliver each new issue to the owner's Telegram.

### Changes Required:

#### 1. Wrangler and Worker config

**File**: `package.json`, `package-lock.json`, `wrangler.jsonc`

**Intent**: Bump `wrangler` to a version ≥ 4.134.0. Enable Issues, add the version metadata binding, and upload source maps so stacks point at source.

**Contract**:

- `observability: { enabled: true, issues: { enabled: true } }`;
- `version_metadata: { binding: "CF_VERSION_METADATA" }`;
- `upload_source_maps: true`.

`npx wrangler deploy --dry-run` validates the config.

#### 2. Error-line formatter (pure)

**File**: `src/lib/domain/error-log.ts` + `src/lib/domain/error-log.test.ts` (new)

**Intent**: Build the one structured error line from a request context and an unknown error. It serialises Errors, PostgREST-style plain objects and `cause` chains explicitly, and it never includes PII.

**Contract**: `formatErrorLine(input: { op?: string; route: string; method: string; path: string; status?: number; userId?: string | null; version: string; step?: string; entityId?: string; error?: unknown }) → Record<string, unknown>`. The output includes `level: "error"`, and `error: {name, message, code?, status?, details?, hint?, stack?, cause?}`.

- `path` excludes the query string.
- Strings are truncated: message to 500 characters, stack to 2000.

Tests cover:

- an `Error` with `cause`;
- a PostgREST plain object;
- a string;
- `undefined`;
- the query string stripped;
- truncation;
- no `email` field even when the error carries one in `details`, where `details` is truncated but not scrubbed. **Rule:** the formatter never reads `ctx.locals.user.email`.

#### 3. Logging wrapper

**File**: `src/lib/log.ts` (new)

**Intent**: The thin side-effecting wrapper. It reads the version from `cloudflare:workers` `env.CF_VERSION_METADATA?.id` (with a `?? "dev"` fallback), builds the line, writes `console.error(JSON.stringify(line))`, and marks `locals.errorLogged = true`.

**Contract**: `logError(context: APIContext, error: unknown, extra?: { op?: string; status?: number; step?: string; entityId?: string })`.

- Add a local `declare module "cloudflare:workers"` and extend `App.Locals` with `errorLogged?: boolean` in `src/env.d.ts`.
- Add eslint-disable comments for `no-console`, as in `src/worker.ts:22`.

#### 4. Central hook in middleware

**File**: `src/middleware.ts`

**Intent**: Wrap the whole `onRequest` body.

- **Thrown error:** if not already logged and this is not an error-page render, `logError(ctx, e, {status: 500})`, then rethrow.
- **5xx response without a log line:** `logError(ctx, undefined, {status})`.
- **`text/html` response:** wrap the body in a pass-through stream that calls `logError(..., {step: "stream"})` when a read errors.

**Contract**:

- Error-page renders are skipped (`context.routePattern` is `/500` or `/404`).
- Existing auth, paused and redirect behaviour is unchanged in this phase.
- The stream wrapper is a pure helper `observeStream(body, onError)` in `src/lib/stream-observer.ts` (new) with a unit test (`src/lib/stream-observer.test.ts`): bytes pass through, and `onError` is called once when the source errors.

#### 5. 500 page

**File**: `src/pages/500.astro` (new)

**Intent**: A Polish error page in the app shell ("Coś poszło nie tak", a link back to the list, the time). It does not show error details to the user. It uses tokens, and it is added to `scripts/check-ui-literals.mjs`.

**Contract**: Uses `Layout`. Receives `Astro.props.error` but does not render it.

#### 6. Telegram alert message (pure)

**File**: `src/lib/domain/issue-alert.ts` + `src/lib/domain/issue-alert.test.ts` (new)

**Intent**: Turn a Cloudflare Notifications webhook payload into one short Polish Telegram message, and check the webhook secret in constant time. Fields are optional; a missing `text` still produces a useful message.

**Contract**:

- `formatIssueAlert(payload: unknown, appUrl: string) → string`: a plain-text message (no Markdown parse mode, so nothing needs escaping) that starts with "Błąd w aplikacji" and includes `name`/`policy_name`, `text`, `alert_type`, `alert_event`, the time from `ts` in `Europe/Warsaw` and a link to the app. The result is truncated to 3500 characters (Telegram's limit is 4096).
- `secretMatches(received: string | null, expected: string) → boolean`: constant-time comparison; false for null or empty values.

Tests use literal payloads: the docs' example, a payload without `text`, an unknown shape, an oversized `text`, and the "Save and Test" request. Secret cases: equal, different, different length, null, empty expected.

#### 7. Alert endpoint

**File**: `src/pages/api/alerts/issue.ts` (new), `src/middleware.ts` (`PAUSED_PASSTHROUGH`), `astro.config.mjs` (`env.schema`), `.env.example`, `.github/workflows/ci.yml` (smoke `.dev.vars`)

**Intent**: `POST /api/alerts/issue`, called by Cloudflare, not by a signed-in user, so it does not check `locals.user`.

- Refuse bodies over 16 KB before parsing (413).
- Check `cf-webhook-auth` against `ISSUES_WEBHOOK_SECRET` with `secretMatches`; on mismatch answer 401.
- Parse the JSON; on failure answer 400.
- Send `formatIssueAlert(...)` with `fetch("https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage", { chat_id: TELEGRAM_CHAT_ID, text })`, with a 5-second timeout.
- Answer 200 `{delivered: true}`. When Telegram fails, or the bot secrets are missing, answer 200 `{delivered: false, reason}` and `console.warn` (never error level, never 5xx — see "No alert loop").
- Never log the token, the chat id or the secret.

**Contract**:

- `prerender = false`.
- New server secrets in `astro.config.mjs` `env.schema` (`optional: true`, `access: "secret"`): `ISSUES_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Placeholders go in `.env.example`.
- Production values are set with `npx wrangler secret put` (owner). In CI, the smoke job's `.dev.vars` gets a fixed `ISSUES_WEBHOOK_SECRET=smoke-webhook-secret` and no Telegram secrets.

#### 8. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Add steps for `/api/alerts/issue`:

- no header → 401;
- a wrong secret → 401;
- the right secret with the docs' example payload → 200 with `"delivered":false` (no Telegram secrets locally or in CI);
- an invalid JSON body with the right secret → 400.

The smoke reads the secret from `ISSUES_WEBHOOK_SECRET` (default `smoke-webhook-secret`).

### Success Criteria:

#### Automated Verification:

- Unit tests pass (formatter, stream observer, alert message, secret check): `npm test`
- Lint and UI contract pass: `npm run lint`
- Types pass: `npx astro check`
- Wrangler accepts the config: `npx wrangler deploy --dry-run --outdir /tmp/wrangler-dry`
- Smoke passes against a local preview, including the `/api/alerts/issue` steps: `npm run smoke`

#### Manual Verification:

- Locally, a temporary throw in a page renders `500.astro`, and the preview log shows exactly one JSON error line with `route`, `status: 500` and the error stack. A temporary throw after the first byte (in the layout slot) logs one line with `step: "stream"`. Both are reverted.
- Deliberate break: make `secretMatches` return true for any value → the smoke "wrong secret → 401" step goes red. Reverted.
- Owner setup after the Phase 1 deploy (the runbook in Phase 5 records the same steps):
  1. In Telegram, create a bot with @BotFather (`/newbot`) and copy the token; send `/start` to the bot; read the chat id from `https://api.telegram.org/bot<token>/getUpdates`.
  2. `npx wrangler secret put TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `ISSUES_WEBHOOK_SECRET` (a long random string).
  3. Cloudflare dashboard → Workers → applications-tracker → Issues → Automations: occurrence threshold 1 → Generic webhook `https://applications-tracker.41mariusz.workers.dev/api/alerts/issue` with the same secret → "Save and Test".
  4. The test message arrives in Telegram.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Session and Auth — no more false "signed out"

### Overview

Reuse one Supabase client per request, classify Auth errors, and make outages and misconfiguration visible instead of looking like a sign-out.

### Changes Required:

#### 1. Auth error classifier (pure)

**File**: `src/lib/domain/auth-errors.ts` + `.test.ts` (new)

**Intent**: Map a `getUser()` or `signInWithPassword()` error to one of these kinds:

- `none`;
- `no-session` (quiet);
- `paused`;
- `rejected` (bad, expired or rotated token: log at warn, then sign-in);
- `outage` (retryable/network/5xx/unknown: log, then 503).

For sign-in it also returns whether the error is `invalid_credentials`.

**Contract**:

- `classifyAuthError(error: unknown) → "none" | "no-session" | "paused" | "rejected" | "outage"`;
- `isInvalidCredentials(error: unknown) → boolean`.

Tests are built from literal error shapes that copy the auth-js classes:

- `AuthSessionMissingError` (status 400);
- `AuthRetryableFetchError` (status 0 and 503);
- `AuthUnknownError`;
- `AuthApiError` 401 `bad_jwt`;
- `AuthApiError` 400 `refresh_token_already_used`;
- `AuthApiError` 540;
- `AuthApiError` 400 `invalid_credentials`;
- `null`.

#### 2. One client per request

**File**: `src/middleware.ts`, `src/env.d.ts`, the 14 request-path callers listed in research §3

**Intent**: The middleware stores its client in `context.locals.supabase`. The 4 pages and 10 API routes use it instead of calling `createClient` again; `api/health.ts` and `src/worker.ts` stay as they are.

The middleware then acts on the classifier:

- `outage`: `logError` with `op: "auth.getUser"`, then 503 JSON for `/api/*` or a redirect to `/500` for pages;
- `rejected`: a warn-level log (no PII) and the normal sign-in path;
- `no-session`: unchanged.

**Contract**: `App.Locals.supabase: SupabaseClient | null`. Pages and routes read `Astro.locals.supabase` / `context.locals.supabase`.

#### 3. Missing configuration

**File**: `src/middleware.ts`, `src/pages/api/health.ts`, `src/lib/domain/keepalive.ts` (+ test)

**Intent**: When `createClient` returns `null`:

- log once per isolate (module flag) with `op: "config"`;
- answer 503 `{error: "misconfigured"}` for `/api/*` except `/api/health`;
- send protected pages to `/500` instead of `/auth/signin`.

Health reports `reason: "misconfigured"` instead of `db_unreachable`.

**Contract**: A new health reason `misconfigured` in `src/lib/domain/keepalive.ts` (and its unit test).

#### 4. Sign-in

**File**: `src/pages/api/auth/signin.ts`

**Intent**:

- Parse the form inside `try`, validated with zod: email and password as strings; a missing value gives the generic message.
- Map only `isInvalidCredentials` to "Nieprawidłowy e-mail lub hasło".
- Log every other failure with `op: "auth.signIn"`. Never log the email or password.
- The paused handling stays.

**Contract**: The redirect URLs and messages smoke relies on stay the same (`scripts/smoke.mjs:235-238`).

#### 5. Sign-out

**File**: `src/pages/api/auth/signout.ts`

**Intent**: Log a failed `signOut()` (`op: "auth.signOut"`) and still clear the session and redirect.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (auth classifier, health reason): `npm test`
- Lint and types pass: `npm run lint`, `npx astro check`
- Smoke passes (anonymous redirects, wrong password, isolation, sign-out): `npm run smoke`
- E2E passes (sign-in survives a reload; status revert; phone search): `npx playwright test`

#### Manual Verification:

- Locally, temporarily make the classifier treat every error as `outage`: a protected page goes to `/500` and logs one `auth.getUser` line, instead of redirecting to sign-in. Reverted.
- Locally, with a temporary empty `SUPABASE_URL` in the preview env: `/api/health` reports `misconfigured`, an API call answers 503 `misconfigured`, and one `config` log line appears. Restored.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Server responses tell the truth

### Overview

Every catch keeps the cause, returns the right status, recognises the paused project, and logs with operation and entity context.

### Changes Required:

#### 1. PostgREST error wrapping

**File**: `src/lib/services/applications.ts`, `notes.ts`, `cv.ts` (the `throw error` / `throw result.error` sites)

**Intent**: Rethrow as `new Error("<op>: <message>", { cause: { ...error, status } })`, so the stack, code, details, hint and HTTP status survive. Add the step to multi-query services, e.g. `getApplicationDetails` names the failing query.

**Contract**: A small helper `toServiceError(op, result)` in `src/lib/services/errors.ts` (new). The callers' behaviour is otherwise unchanged.

#### 2. API routes

**File**:

- `src/pages/api/applications/index.ts`, `[id]/index.ts`, `[id]/status.ts`, `[id]/notes.ts`, `[id]/cv.ts`;
- `src/pages/api/notes/[id].ts`;
- `src/pages/api/cv/index.ts`, `[id].ts`.

**Intent**:

- Move `formData()` inside `try`. A malformed body answers 400 and logs with `step: "parse"`.
- In each catch:
  - `isProjectPaused(e)` answers 503 `{error: "database_paused"}`;
  - otherwise `logError(ctx, e, {op, entityId, step})`, then the existing 500 message.
- Split `"note update failed"` into `note.edit` and `note.remove`.
- Log the file size before upload parsing, as context.

**Contract**:

- Response bodies and statuses for the happy paths and the 400/401/404/409/413 paths stay the same; smoke asserts them.
- A shared `jsonError(status, message)` helper lives in `src/lib/http.ts` (new).

#### 3. Pages

**File**: `src/pages/dashboard.astro`, `cv.astro`, `applications/[id]/index.astro`, `applications/[id]/edit.astro`

**Intent**:

- A failed read sets `Astro.response.status = 500` and keeps the inline Polish message. A paused error redirects to `/paused`.
- The details page uses separate catches: a `listCvFiles` failure degrades only the CV panel (logged as `cv.list`), while a details failure stays 500 (logged as `application.details` with the id).
- Log a warning when an attached `cv_file_id` does not resolve.

**Contract**: The happy-path HTML and the smoke `bodyIncludes` strings are unchanged.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Add a step that sends a malformed body to a write route (e.g. a `multipart` header with no boundary to `POST /api/applications/<id>/notes`) and expects 400, not an empty 500.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (incl. `toServiceError`): `npm test`
- Lint and types pass: `npm run lint`, `npx astro check`
- Smoke passes, including the new malformed-body step: `npm run smoke`
- E2E passes: `npx playwright test`

#### Manual Verification:

- Locally, temporarily break a query (wrong column in `listApplications`): `/dashboard` returns 500 with the inline message, and one JSON line shows `op: "applications.list"`, `cause.code` and the stack. Reverted.
- The deliberate break of the malformed-body handling (moving `formData()` back outside `try`) turns the new smoke step red. Reverted.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 4.

---

## Phase 4: Browser failure channel

### Overview

The browser tells network errors from server errors and from the paused state, survives a failed preview chunk, and reports client failures to the server.

### Changes Required:

#### 1. Client response classifier and messages (pure)

**File**: `src/lib/domain/client-errors.ts` + `.test.ts` (new)

**Intent**:

- Classify a fetch outcome (Response or thrown error) into one of: `ok`, `http` (JSON error body), `paused` (503 `database_paused`), `server` (non-JSON or unparsable, e.g. Cloudflare 1101/1102 HTML or an empty 500), `network`, `aborted`.
- Map each kind to a Polish message:
  - `network`: "Brak połączenia. Spróbuj ponownie."
  - `server`: "Błąd serwera (<status>). Spróbuj ponownie za chwilę."
  - `paused`: text plus `href: "/paused"`
  - `http`: `data.error ?? fallback`
- Also hold the beacon rules: the noise filter (ResizeObserver, AbortError, extension or cross-origin "Script error."), payload building (message ≤ 300 characters, path without query, no form values) and dedupe.

**Contract**:

- `classifyResponse(res: Response): Promise<ClientResult>`;
- `errorMessage(result, fallback): { text: string; href?: string }`;
- `isNoise(event)`;
- `buildReport(input) → ClientErrorReport`.

Tests run in the node environment with the global `Response`.

#### 2. Fetch helper and beacon

**File**: `src/lib/api-client.ts` (new)

**Intent**: `apiRequest(url, init & { op })` performs the fetch with network and abort handling, classifies the result, and sends a report for `server` results. It supports `parse: "json" | "bytes"` for CvPreview. `reportClientError(report)` sends with `navigator.sendBeacon`, falling back to `fetch` with `keepalive`, capped at 5 reports per page load.

**Contract**: Returns the `ClientResult` discriminated union from item 1. Reloads and redirects on success stay in the callers.

#### 3. Call sites

**File**:

- `src/components/applications/ApplicationForm.tsx:61-76`;
- `NotesPanel.tsx:23-32`;
- `StatusControl.tsx:31-40`;
- `CvPanel.tsx:23,80`;
- `CvLibrary.tsx:121`;
- `CvPreview.tsx:25-34`.

**Intent**: Replace each fetch + `json()` + bindingless catch with `apiRequest` + `errorMessage`.

- CvPreview distinguishes fetch, import and render failures and reports import or render errors with `cvId` and the mime type.
- Error elements in ApplicationForm, CvLibrary and CvPreview use `Alert` / `text-destructive` tokens (decision: error elements only).
- The paused message renders a link to `/paused`.

**Contract**: The visible success flows (reload, redirect, "reused" info) are unchanged.

#### 4. Error boundary

**File**: `src/components/ErrorBoundary.tsx` (new), `CvPanel.tsx:135-137`, `CvLibrary.tsx:57-59`

**Intent**: A small class boundary with no new dependency. `componentDidCatch` sends a report. The fallback shows "Nie udało się wczytać podglądu" with "Odśwież stronę" and an "Otwórz plik" link. It wraps the `<Suspense>` around the lazy CvPreview.

#### 5. Global handlers

**File**: `src/layouts/Layout.astro` (a bundled `<script>` importing `src/lib/client-error-listeners.ts`, new)

**Intent**: Listen to `window` `error`, `unhandledrejection` and `document` `astro:hydration-error`. Filter noise, dedupe, and send reports through `reportClientError`.

#### 6. Report endpoint

**File**: `src/pages/api/client-error.ts` (new)

**Intent**:

- 401 without `locals.user`.
- 413 when `Content-Length` > 4096, before parsing.
- zod validation: `kind` (`server` | `boundary` | `error` | `rejection` | `hydration` | `test`), `op`, `status?`, `name`, `message`, `path`, `componentUrl?`.
- A valid report produces one `logError` line with `op: "client.<kind>"` and answers 204.

The `test` kind is the production proof path.

**Contract**: `prerender = false`. It is not added to `PAUSED_PASSTHROUGH`.

#### 7. Kitchen sink

**File**: `src/pages/dev/ui.astro`

**Intent**: Add static examples: the server-error Alert with a status, the paused message with a link, and the boundary fallback (exported as its own presentational component).

#### 8. Tests

**File**: `tests/e2e/client-errors.spec.ts` (new), `scripts/smoke.mjs`

**Intent**:

- **E2E** (pattern of `status-revert.spec.ts`): `page.route` answers the status POST with an HTML 503. The UI shows "Błąd serwera (503)", not "Brak połączenia", and a POST to `/api/client-error` is observed.
- **Smoke:** `/api/client-error` gives 401 without a session, 204 with a valid report when signed in, 413 for an oversized body, and 400 for an invalid kind.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (classifier, messages, noise filter, report builder): `npm test`
- Lint, UI contract and types pass: `npm run lint`, `npx astro check`
- Smoke passes, including the `/api/client-error` steps: `npm run smoke`
- E2E passes, including `client-errors.spec.ts`: `npx playwright test`

#### Manual Verification:

- Deliberate break: map `server` results to the network message → the e2e spec goes red. Reverted.
- In a local preview, blocking the CvPreview chunk in DevTools shows the boundary fallback instead of a vanished panel, and a `client.boundary` line appears in the preview log.
- `/dev/ui` shows the three new error states.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 5.

---

## Phase 5: Docs and production proof

### Overview

Document the error path for future agents and the owner, then prove in production that a failure reaches Telegram.

### Changes Required:

#### 1. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Under Architecture, add a short "Errors and observability" bullet:

- Workers Issues → generic webhook → `/api/alerts/issue` → Telegram (no 5xx and no error-level logs in that endpoint, to avoid alert loops);
- `logError` and the middleware hook own the error line; routes use `logError` with `op`/`entityId`, never bare `console.error`;
- `locals.supabase` is the only request client;
- `apiRequest` is the only client fetch path;
- `/api/client-error`;
- no PII in logs.

Update the API-routes convention: parse bodies inside `try`; check paused errors in catches.

#### 2. Infrastructure runbook

**File**: `context/foundation/infrastructure.md`

**Intent**:

- Logs bullet: Issues, the automation to the alert endpoint, the Telegram bot setup (BotFather, `getUpdates`, the three `wrangler secret put` values), how to rotate the secret, and how to read an issue.
- New runbook step: "prove the error path" (signed-in browser console: `navigator.sendBeacon('/api/client-error', JSON.stringify({kind:"test", …}))` → Telegram within minutes).
- Risk register "Silent errors with nobody watching logs": mitigation now in place, with remaining gaps (beta dependency, sign-in and paused pages not reported from the browser, cron missing-env P5).

#### 3. Lessons

**File**: `context/foundation/lessons.md`

**Intent**: Append "Errors must leave a signal, not just a message". Context: route, page and island catches. Rule: use `logError`/`apiRequest`, never bindingless catch or a 200 on failure.

### Success Criteria:

#### Automated Verification:

- Prettier passes on the edited docs: `npx prettier --check CLAUDE.md context/foundation/infrastructure.md context/foundation/lessons.md`

#### Manual Verification:

- After deploy: the Cloudflare dashboard shows Issues enabled for `applications-tracker`, and the Worker version matches the deploy SHA tag.
- The owner sends the test report from the browser console while signed in, and a Telegram message arrives within minutes naming the new issue (`client.test`).

---

## Testing Strategy

### Unit Tests:

- **Formatter:** Error with cause, PostgREST object, string, undefined, query stripped, truncation.
- **Stream observer:** passthrough, and one error callback.
- **Telegram alert:** message from the docs' example payload, missing `text`, unknown shape, truncation; constant-time secret check.
- **Auth classifier:** every auth-js error shape, including 540 and `invalid_credentials`.
- **Health reason:** `misconfigured`.
- **`toServiceError`:** keeps code, details, hint, status and the stack.
- **Client classifier:** JSON error, HTML 503, empty 500, `database_paused`, network, abort.
- **Client messages,** the noise filter and the report builder (no query, truncation).

### Integration Tests:

- **Smoke:** a malformed body gets 400; `/api/client-error` 401/204/413/400; all existing steps unchanged.
- **E2E:** an HTML 503 shows the server message and sends a beacon; sign-in survives a reload (session reuse).

### Manual Testing Steps:

1. A local throw renders `500.astro` with one JSON line; a stream error gives one `step: "stream"` line.
2. Auth outage simulation gives `/500` plus a log, not sign-in.
3. Misconfiguration gives 503 `misconfigured` and the health reason.
4. A blocked CvPreview chunk shows the boundary fallback and a `client.boundary` log.
5. In production, the test report reaches Telegram.

## Performance Considerations

- No SDK and no extra network calls on the server; logging is one `console.error`.
- The stream observer only passes chunks through, so the CPU cost is negligible.
- One fewer Supabase client and Auth refresh per request, which saves a round trip.
- Client beacons are capped at 5 per page load.

## Migration Notes

- No database migration.
- Wrangler bump and `observability.issues` in the same commit (see Critical Implementation Details).
- Owner action after the Phase 1 deploy: create the Telegram bot, set the three Worker secrets, and create the Issues automation (generic webhook to `/api/alerts/issue`). None of these values are in the repo.
- Workers Issues is in beta (free during beta); pricing after the beta is unknown and is recorded in the risk register.

## References

- Research: `context/changes/production-error-visibility/research.md`
- Audit: `context/audits/observability/2026-10-06_call-time-read-agreement-writes-cv-upload.md`
- Cloudflare Workers Issues: https://developers.cloudflare.com/workers/observability/issues/
- Roadmap F-01: `context/foundation/roadmap.md`
- Patterns:
  - `src/lib/supabase-paused.ts` + `.test.ts`;
  - `src/lib/domain/keepalive.ts`;
  - `tests/e2e/status-revert.spec.ts`;
  - `scripts/smoke.mjs`;
  - `scripts/check-ui-literals.mjs`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Detection floor — Issues, release identity, central hook, 500 page, Telegram alerts

#### Automated

- [x] 1.1 Unit tests pass (formatter, stream observer, alert message, secret check): `npm test` — 6abec3e
- [x] 1.2 Lint and UI contract pass: `npm run lint` — 6abec3e
- [x] 1.3 Types pass: `npx astro check` — 6abec3e
- [x] 1.4 Wrangler accepts the config (dry run) — 6abec3e
- [x] 1.5 Smoke passes against a local preview incl. /api/alerts/issue steps — 6abec3e

#### Manual

- [x] 1.6 Local throw renders 500.astro with one JSON line; stream error logs step stream; reverted — 6abec3e
- [x] 1.7 secretMatches always true turns the wrong-secret smoke step red; reverted — 6abec3e
- [x] 1.8 Owner sets up the Telegram bot, secrets and Issues automation; the test message arrives — 6abec3e

### Phase 2: Session and Auth — no more false "signed out"

#### Automated

- [x] 2.1 Unit tests pass (auth classifier, health reason): `npm test`
- [x] 2.2 Lint and types pass
- [x] 2.3 Smoke passes
- [x] 2.4 E2E passes

#### Manual

- [x] 2.5 Simulated Auth outage gives /500 and a log instead of sign-in; reverted
- [x] 2.6 Missing SUPABASE_URL gives 503 misconfigured, health reason and one log line; restored

### Phase 3: Server responses tell the truth

#### Automated

- [ ] 3.1 Unit tests pass (incl. toServiceError): `npm test`
- [ ] 3.2 Lint and types pass
- [ ] 3.3 Smoke passes incl. the malformed-body step
- [ ] 3.4 E2E passes

#### Manual

- [ ] 3.5 Broken list query gives 500 and one JSON line with op, cause.code and stack; reverted
- [ ] 3.6 Moving formData outside try turns the malformed-body smoke step red; reverted

### Phase 4: Browser failure channel

#### Automated

- [ ] 4.1 Unit tests pass (classifier, messages, noise filter, report builder): `npm test`
- [ ] 4.2 Lint, UI contract and types pass
- [ ] 4.3 Smoke passes incl. /api/client-error steps
- [ ] 4.4 E2E passes incl. client-errors.spec.ts

#### Manual

- [ ] 4.5 Mapping server results to the network message turns the e2e spec red; reverted
- [ ] 4.6 Blocked CvPreview chunk shows the boundary fallback and a client.boundary log
- [ ] 4.7 /dev/ui shows the three new error states

### Phase 5: Docs and production proof

#### Automated

- [ ] 5.1 Prettier passes on the edited docs

#### Manual

- [ ] 5.2 Cloudflare shows Issues enabled and the version matches the deploy SHA tag
- [ ] 5.3 A signed-in test report reaches Telegram within minutes
