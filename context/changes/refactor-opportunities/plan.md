# CV and API-route refactors (K2, K5, K1) Implementation Plan

## Overview

Three small refactors from the ranking in `context/changes/refactor-opportunities/research.md`, in ranking order:

1. **K2.** One id guard for every `[id]` API route, so a malformed id answers 404 instead of a logged 500. Since F-01, a logged 500 is a Telegram alert.
2. **K5.** Shared HTTP types and URL helpers for the CV API, so a drift between route and island fails `astro check`.
3. **K1.** CV limits from one source in `src/lib/domain/cv.ts`, with the bucket's copy of them pinned by a pgTAP test.

None needs a migration. Each phase is one deployable commit with no change in behaviour for valid requests.

## Current State Analysis

- **K2.** Seven handlers in six route files read `context.params.id` and check only `!id`:
  - `src/pages/api/cv/[id].ts:14-15` (GET);
  - `src/pages/api/notes/[id].ts:16-17` (PATCH and DELETE through `run()`);
  - `src/pages/api/applications/[id]/index.ts:15,26` (PATCH);
  - `src/pages/api/applications/[id]/status.ts:15,22`, `notes.ts:15,19`, `cv.ts:18,22` (POST).

  Five of them read the form body (`readFormData`) before that check. A non-uuid reaches `.eq("id", …)` or an RPC with a `uuid` parameter, and is inferred to become 22P02 → `toServiceError` → `failureResponse` → `logError` at 500 → Workers issue → Telegram alert. The pages already use `isUuid` (`src/pages/applications/[id]/index.astro:30`, `edit.astro:18`). The smoke covers the page case only (`scripts/smoke.mjs:526`).

- **K5.**
  - The `POST /api/cv` reply `{file, reused}` (`src/pages/api/cv/index.ts:43`) is typed inline twice: `CvPanel.tsx:82`, `CvLibrary.tsx:131`.
  - The attach reply `{id, cv_file_id}` (`src/pages/api/applications/[id]/cv.ts:33`) is untyped.
  - `src/types.ts` holds entities only (`CvFile` at `:104-110`).
  - `/api/cv/${…}` is a string in 7 places: `CvPanel.tsx:135,146`, `CvLibrary.tsx:51,65`, `CvPreview.tsx:49,92`, `src/pages/dev/ui.astro:309`. `/api/applications/${…}/cv` appears in `CvPanel.tsx:27`.
  - `CV_COLUMNS` (`src/lib/services/cv.ts:7`) mirrors `CvFile` by hand.
- **K1.**
  - The TypeScript limits live in `src/lib/domain/cv.ts:3-20` (`MAX_CV_BYTES`, `CV_TYPES`), and `checkCvFile` is already shared by server and islands.
  - Hand-kept copies: `accept=` at `CvPanel.tsx:197` and `CvLibrary.tsx:164`; the label "PDF lub DOCX, do 5 MB" at `CvPanel.tsx:191` and `CvLibrary.tsx:158`; the bucket's `file_size_limit` / `allowed_mime_types` in the applied migration `supabase/migrations/20261001090000_cv_files.sql:6-14`, which is untested.

## Desired End State

- **K2:** every `[id]` API handler answers 404 `{error: "Nie znaleziono."}` for a non-uuid id, without reading the body, querying, or writing a log line. Valid ids behave exactly as today. Smoke proves it for one read and one write route.
- **K5:**
  - both islands and both CV routes use named reply types from `src/types.ts`;
  - every CV file URL comes from one helper;
  - the `CV_COLUMNS` select list is derived from `CvFile`, so adding or renaming a field fails `astro check` until the list matches.
- **K1:**
  - `accept=` and the limits label in both islands come from `src/lib/domain/cv.ts`;
  - a pgTAP test fails if the local `cvs` bucket's size or MIME allow-list drift from those values;
  - CLAUDE.md says where the limits live.

### Key Discoveries:

- `readFormData` and `failureResponse` in `src/lib/http.ts:14-31` set the house pattern: return a ready `Response` or the value, and the route does `if (x instanceof Response) return x`. The id guard follows the same shape.
- `src/lib/http.ts` imports `src/lib/log.ts` (`cloudflare:workers`), so nothing Vitest runs may import it (`http.ts:1`). The pure rule stays `isUuid` in `src/lib/domain/ids.ts:4`, already tested.
- `api/applications/[id]/cv.ts` already uses `z.uuid()` for `cv_file_id` (`:11`). The route id is a separate value, guarded separately.
- A pgTAP file follows the shape of `supabase/tests/keepalive.test.sql` (`begin; … select plan(n); … rollback`).
- ast-grep does not match explicit type arguments in `.tsx` (`research.md`, verification table). Check K5 with `rg 'apiRequest<'`.

## What We're NOT Doing

- **K3** (Storage duplicate by error text): gated by a runtime probe of the real Storage response.
- **K4** (single upload-and-attach request): a domain-operation question, not a refactor.
- **K6** (renderer map) and **K7** (download through `apiRequest`): need a Playwright preview/download test first; K7 is a UX trade-off.
- **K8** (`cv_file_id` owner check, domain D-06): its own change with the migration ritual.
- **Malformed ids:** no log line or `logWarn` for them (decided: bare 404, like pages).
- **Other API changes:** no 400 or a new error kind for malformed ids, and no change to the existing per-route "not found" messages for valid-but-unknown ids.
- **Types:**
  - no change to `CvFile.mime_type` (stays `string`);
  - no `supabase gen types`;
  - no DTOs for non-CV routes.
- **`scripts/demo-data.mjs`:** no change; its own hash/path copy stays.
- **Limits:** no change to the size or type limits; no new migration; the smoke's oversized-file constant (`scripts/smoke.mjs:179`) stays.

## Implementation Approach

Ranking order, smallest blast radius first:

- **Phase 1** changes runtime behaviour only for invalid input and lands with a smoke step that fails before it.
- **Phase 2** is type-level and helper extraction: no behaviour change, guarded by the compiler and the existing smoke.
- **Phase 3** moves literals into the domain module and adds the database pin.

Each phase is committed and can be deployed alone.

## Critical Implementation Details

- **Guard order:** in every handler, keep the 401 check first, then the id guard, then `readFormData`. Unauthenticated callers still get 401 without learning anything about the id, and a malformed id never pays for body parsing. In `api/notes/[id].ts` the guard must run in both `PATCH` (before its `readFormData`) and `DELETE`, not only inside `run()`.
- **pgTAP pin:** it reads `storage.buckets` on the local stack, which the migration created. It does not prove the cloud bucket matches, because the original insert is `on conflict do nothing`. That stays an open item outside this plan.

## Phase 1: Route id guard (K2)

### Overview

One helper turns a non-uuid route id into a 404 before any body parsing or query. All seven `[id]` handlers use it.

### Changes Required:

#### 1. Route-id helper

**File**: `src/lib/http.ts`

**Intent**: Add the shared guard next to `readFormData` and `failureResponse`, so routes stop passing arbitrary strings to Postgres.

**Contract**: `routeId(context: APIContext): string | Response`. It returns `context.params.id` when `isUuid` (from `@/lib/domain/ids`) accepts it; otherwise it returns `jsonError(404, "Nie znaleziono.")`. No logging.

#### 2. Apply to the seven handlers

**Files**: `src/pages/api/cv/[id].ts`, `src/pages/api/notes/[id].ts`, `src/pages/api/applications/[id]/index.ts`, `src/pages/api/applications/[id]/status.ts`, `src/pages/api/applications/[id]/notes.ts`, `src/pages/api/applications/[id]/cv.ts`

**Intent**: Call `routeId` right after the 401 check and return early on a `Response`. Drop the now-redundant `!id` parts of the existing combined checks, keeping their other conditions (`!supabase`, `!parsed.success`) and messages.

**Contract**:

- **Valid ids:** response codes and bodies are unchanged for every existing case.
- **Non-uuid ids:** 404 `{error: "Nie znaleziono."}`. `readFormData` is not reached.
- **`api/notes/[id].ts`:** `run()` receives the guarded id from both `PATCH` and `DELETE`.

#### 3. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Prove the guard on one read and one write route, next to the existing "malformed application link is not found" step.

**Contract**: two steps, signed in:

- `GET /api/cv/not-a-uuid` → 404, body includes "Nie znaleziono";
- `POST /api/applications/not-a-uuid/notes` with a valid note form → 404, body includes "Nie znaleziono".

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint and types pass: `npm run lint` and `npx astro check`
- Smoke passes against a local preview, incl. the two new malformed-id steps: `npm run smoke`
- E2E passes: `npx playwright test`

#### Manual Verification:

- Break check: with the guard removed from `src/pages/api/cv/[id].ts` (worktree only), the smoke step `GET /api/cv/not-a-uuid` goes red with a 500. Restored afterwards.
- Local preview logs show no error-level line for the two malformed-id requests.
- After deploy, signed in to production: opening `/api/cv/abc` shows the 404 JSON and no Telegram alert arrives.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: CV HTTP types and URL helpers (K5)

### Overview

Name the two CV reply shapes, use them on both sides of the HTTP boundary, build CV URLs in one place and derive the CV select list from the entity type. No behaviour change.

### Changes Required:

#### 1. Reply DTOs

**File**: `src/types.ts`

**Intent**: Give the CV API replies names, so route and islands share one definition (CLAUDE.md: DTOs go in `src/types.ts`).

**Contract**:

- `UploadCvResponse { file: CvFile; reused: boolean }` for `POST /api/cv` (200/201).
- `AttachCvResponse { id: string; cv_file_id: string | null }` for `POST /api/applications/[id]/cv` (200).

#### 2. Routes use the DTOs

**Files**: `src/pages/api/cv/index.ts`, `src/pages/api/applications/[id]/cv.ts`

**Intent**: Type the success bodies with `satisfies UploadCvResponse` / `satisfies AttachCvResponse`, so changing the payload without the type fails the build.

**Contract**: response bodies byte-identical to today.

#### 3. Islands use the DTOs and the URL helpers

**Files**: `src/components/applications/CvPanel.tsx`, `src/components/applications/CvLibrary.tsx`, `src/components/applications/CvPreview.tsx`, `src/pages/dev/ui.astro`

**Intent**:

- Replace the two inline `apiRequest<{ file?: CvFile; reused?: boolean } | null>` generics with `apiRequest<UploadCvResponse | null>`.
- Replace every hand-built `/api/cv/${…}` and `/api/applications/${…}/cv` string with the helpers.

**Contract**:

- Rendered `href`s and request URLs are unchanged.
- The attach call in `CvPanel` may type its reply as `AttachCvResponse | null`.

#### 4. URL helpers

**File**: `src/lib/cv-urls.ts` (+ `src/lib/cv-urls.test.ts`)

**Intent**: One place that knows the CV route paths. Pure, so Vitest can test it.

**Contract**:

- `cvFileUrl(id: string, options?: { download?: boolean }): string` returns `/api/cv/<id>`, plus `?download=1` when `download`.
- `applicationCvUrl(applicationId: string): string` returns `/api/applications/<id>/cv`.
- Ids are inserted with `encodeURIComponent`, a no-op for uuids.
- Tests cover both helpers and the download flag.

#### 5. Select list derived from `CvFile`

**File**: `src/lib/services/cv.ts`

**Intent**: Stop keeping `CV_COLUMNS` in step with `CvFile` by hand.

**Contract**:

- The list of selected columns is typed so that every key of `CvFile` must appear and nothing else may, e.g. a `Record<keyof CvFile, true>` whose keys are joined.
- The resulting select string selects the same five columns as today.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, incl. `src/lib/cv-urls.test.ts`: `npm test`
- Lint and types pass: `npm run lint` and `npx astro check`
- No inline CV reply type and no hand-built CV URL left: `rg 'apiRequest<\{' src` and `rg '/api/cv/\$\{|/api/applications/\$\{[^}]*\}/cv' src` return nothing outside `src/lib/cv-urls.ts`
- Smoke passes against a local preview: `npm run smoke`
- E2E passes: `npx playwright test`

#### Manual Verification:

- Break check: renaming `reused` in `UploadCvResponse` (worktree only) makes `npx astro check` fail in the route and both islands. Restored afterwards.
- `/cv` and an application's CV panel: upload, reuse message, attach, preview and download behave as before (local preview).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: CV limits from one source (K1)

### Overview

The islands take `accept=` and the limits label from `src/lib/domain/cv.ts`, and a pgTAP test pins the bucket limits to the same values.

### Changes Required:

#### 1. Derived constants

**File**: `src/lib/domain/cv.ts` (+ `src/lib/domain/cv.test.ts`)

**Intent**: Derive what the islands show from the rules that already exist.

**Contract**:

- `CV_ACCEPT: string` lists every extension in `CV_TYPES` (as `.pdf`, `.docx`) and every MIME key, comma-separated. It equals today's literal `.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- `CV_LIMITS_TEXT: string` is built from the `CV_TYPES` extensions (upper-cased, joined with " lub ") and from `MAX_CV_BYTES` in whole MB. It equals today's "PDF lub DOCX, do 5 MB".
- Tests:
  - both values equal today's strings;
  - every `CV_TYPES` key and extension appears in `CV_ACCEPT`.

#### 2. Islands use them

**Files**: `src/components/applications/CvPanel.tsx`, `src/components/applications/CvLibrary.tsx`

**Intent**: Replace the `accept=` literals and the "PDF lub DOCX, do 5 MB" text with the constants. The surrounding Polish sentences stay as they are.

**Contract**: rendered attributes and text unchanged.

#### 3. Bucket pin

**File**: `supabase/tests/cv_bucket.test.sql` (new)

**Intent**: Make a drift between the bucket and the app's limits fail in CI instead of surfacing as a 500 in production.

**Contract**:

- pgTAP, same shape as `supabase/tests/keepalive.test.sql`.
- Asserts that `storage.buckets` row `cvs`:
  - exists;
  - is not public;
  - has `file_size_limit = 5242880`;
  - has `allowed_mime_types` equal (as a set) to the two MIME types of `CV_TYPES`.
- A comment names `MAX_CV_BYTES` / `CV_TYPES` in `src/lib/domain/cv.ts` as the source these values must match.

#### 4. Docs

**File**: `CLAUDE.md`

**Intent**: Tell the next agent where the limits live and what pins the database copy.

**Contract**: in the **CV files** bullet, one sentence:

- limits and accepted types come from `src/lib/domain/cv.ts` (`MAX_CV_BYTES`, `CV_TYPES`, `CV_ACCEPT`, `CV_LIMITS_TEXT`);
- the bucket's copy is pinned by `supabase/tests/cv_bucket.test.sql`;
- a limit change needs a new migration with `update storage.buckets`. Lower a limit only after the app check is deployed.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, incl. the new `CV_ACCEPT` / `CV_LIMITS_TEXT` cases: `npm test`
- Lint and types pass: `npm run lint` and `npx astro check`
- Database tests pass, incl. `cv_bucket.test.sql`: `npx supabase test db`
- No `accept=` or limits literal left in the islands: `rg 'accept="|PDF lub DOCX, do 5 MB' src/components` returns nothing
- Smoke passes against a local preview: `npm run smoke`
- E2E passes: `npx playwright test`

#### Manual Verification:

- Break check (unit): dropping the `.docx` part from `CV_ACCEPT` (worktree only) turns the unit test red. Restored afterwards.
- Break check (database): with `update storage.buckets set file_size_limit = 1 where id = 'cvs'` run on the local stack, `npx supabase test db` fails on `cv_bucket.test.sql`. The bucket is restored afterwards (`5242880`).
- `/cv` and the CV panel show the same label and file picker filter as before (local preview).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `src/lib/domain/ids.test.ts` (existing) covers `isUuid`.
- New `src/lib/cv-urls.test.ts`: both helpers, the download flag.
- `src/lib/domain/cv.test.ts`: `CV_ACCEPT` and `CV_LIMITS_TEXT` equal today's strings and include every `CV_TYPES` entry.

### Integration Tests:

- Smoke: two malformed-id steps (Phase 1). The existing CV steps (`scripts/smoke.mjs:479-523`) guard that Phases 2–3 change no behaviour.
- pgTAP: `supabase/tests/cv_bucket.test.sql` (Phase 3).
- `astro check` guards the DTOs and the derived select list (Phase 2).

### Manual Testing Steps:

1. Signed in, open `/api/cv/abc`: 404 JSON, no alert.
2. Upload a new CV and the same file again from `/cv` and from an application. Attach, preview and download.
3. Compare the file picker filter and the limits label with the previous build.

## Performance Considerations

None. The guard is a regex check before work the route would otherwise do.

## Migration Notes

No migration. The pgTAP pin reads the bucket the existing migration created.

## References

- Research and ranking: `context/changes/refactor-opportunities/research.md`
- CV flow analysis: `context/changes/cv-flow-analysis/research.md`
- Audit C10: `context/audits/observability/2026-10-06_call-time-read-agreement-writes-cv-upload.md:140`
- Pattern: `src/lib/http.ts:14-31` (`readFormData`, `failureResponse`); `src/pages/applications/[id]/index.astro:30` (`isUuid` on pages)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Route id guard (K2)

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — 022ffbf
- [x] 1.2 Lint and types pass: `npm run lint` and `npx astro check` — 022ffbf
- [x] 1.3 Smoke passes incl. the two malformed-id steps: `npm run smoke` — 022ffbf
- [x] 1.4 E2E passes: `npx playwright test` — 022ffbf

#### Manual

- [x] 1.5 Break check: guard removed from api/cv/[id].ts turns the malformed-id smoke step red; restored — 022ffbf
- [x] 1.6 Local preview logs show no error line for malformed-id requests — 022ffbf
- [x] 1.7 Production: /api/cv/abc shows 404 JSON and no Telegram alert — 022ffbf

### Phase 2: CV HTTP types and URL helpers (K5)

#### Automated

- [x] 2.1 Unit tests pass incl. cv-urls.test.ts: `npm test` — 761cd97
- [x] 2.2 Lint and types pass: `npm run lint` and `npx astro check` — 761cd97
- [x] 2.3 No inline CV reply type or hand-built CV URL left (rg) — 761cd97
- [x] 2.4 Smoke passes: `npm run smoke` — 761cd97
- [x] 2.5 E2E passes: `npx playwright test` — 761cd97

#### Manual

- [x] 2.6 Break check: renaming `reused` in UploadCvResponse fails astro check; restored — 761cd97
- [x] 2.7 Upload, reuse, attach, preview and download behave as before — 761cd97

### Phase 3: CV limits from one source (K1)

#### Automated

- [x] 3.1 Unit tests pass incl. CV_ACCEPT / CV_LIMITS_TEXT: `npm test` — 225fe06
- [x] 3.2 Lint and types pass: `npm run lint` and `npx astro check` — 225fe06
- [x] 3.3 Database tests pass incl. cv_bucket.test.sql: `npx supabase test db` — 225fe06
- [x] 3.4 No accept= or limits literal left in islands (rg) — 225fe06
- [x] 3.5 Smoke passes: `npm run smoke` — 225fe06
- [x] 3.6 E2E passes: `npx playwright test` — 225fe06

#### Manual

- [x] 3.7 Break check (unit): CV_ACCEPT without .docx turns the test red; restored — 225fe06
- [x] 3.8 Break check (database): bucket file_size_limit = 1 fails cv_bucket.test.sql; restored — 225fe06
- [x] 3.9 Label and file picker filter unchanged on /cv and the CV panel — 225fe06
