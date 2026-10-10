---
date: 2026-10-06T18:05:00Z
researcher: Claude (agent) for the repository owner
git_commit: ad94d89
branch: main
repository: applications-tracker
topic: "Which CV-flow debt items are worth refactoring, in what target shape and order"
tags: [research, refactor, cv, api-routes, types, migrations, verified]
status: complete
last_updated: 2026-10-06
last_updated_by: Claude (agent)
verified_at_commit: 75f6f85
last_updated_note: structural claims behind the ranking re-checked with ast-grep 0.45.3; zeros confirmed with grep (section "Weryfikacja twierdzeń (ast-grep)")
---

# Research: refactor opportunities from the CV flow analysis

**Date**: 2026-10-06
**Researcher**: Claude (agent) for the repository owner
**Git Commit**: ad94d89
**Branch**: main
**Repository**: applications-tracker

## Research Question

`context/changes/cv-flow-analysis/research.md` documents the CV flow's technical debt and structural risks. Which of those problems are worth fixing, in what target shape and in what order? Exploration only: no refactor and no decision here. The decision belongs to a separate planning session.

Inputs treated as collected evidence (not re-derived): `context/changes/cv-flow-analysis/research.md` (trace, test gaps, blast radius, Technical debt, ast-grep table), `context/map/repo-map.md`, `context/domain/domain-distillation.md`, `context/audits/observability/2026-10-06_call-time-read-agreement-writes-cv-upload.md`.

Labels: **[E]** evidence (read in code, git or documents this session), **[I]** inference, **[U]** unknown.

## Candidates and classification

Every problem the analysis records, classified. A **candidate** is a problem whose fix would change code structure. The rest are inputs to cost and feasibility.

| #   | Problem (source in `cv-flow-analysis/research.md`)                                                                                                      | Class                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| K1  | CV limits (5 MB, PDF/DOCX) kept by hand in four places — domain, bucket, `accept=` ×2 (Technical debt 1)                                                | candidate                                         |
| K2  | API routes with `[id]` have no `isUuid` guard; malformed id → logged 500 (Technical debt 2; audit C10)                                                  | candidate                                         |
| K3  | Storage duplicate detected by error-message regex (Technical debt 3; audit C6)                                                                          | candidate                                         |
| K4  | Upload then attach as two HTTP requests; upload itself two writes (Technical debt 4; audit C5)                                                          | candidate                                         |
| K5  | String contracts without shared types: inline reply types, URL strings, storage path in `demo-data`, hand-kept `CvFile`/`CV_COLUMNS` (Technical debt 5) | candidate                                         |
| K6  | Preview dispatch: PDF, else DOCX (Technical debt 7)                                                                                                     | candidate (small)                                 |
| K7  | Download via plain link bypasses the client error channel (Technical debt 8)                                                                            | candidate (small)                                 |
| K8  | `applications.cv_file_id` FK without owner check (Technical debt 10; domain D-06)                                                                       | candidate (schema)                                |
| —   | Detach exists only server-side, untested (Technical debt 6)                                                                                             | not a candidate — product question + missing test |
| —   | Browser-only CV code has no automated tests (Technical debt 9)                                                                                          | not a candidate — input to the cost of K6/K7      |
| —   | `Cache-Control` after sign-out; 413 runs after `auth.getUser()` (Technical debt 11)                                                                     | not a candidate — configuration/behaviour         |

**Common origin [E]:** every candidate except K2's page-side half was born in three commits on 2026-09-29 — `02921a8` (upload, library, attach, bucket, FK), `4a902a7` (preview, download), `e089543` (`/cv` page). They predate the `context/changes` workflow (first archived change: 2026-10-04), so no plan records why the original shape was chosen. Reasons come from commit messages, code comments, the PRD note (`context/foundation/prd.md:100-101`) and later plans that consciously deferred items.

## Per-candidate findings

### K1 — CV limits in several hand-kept places

- **Current shape [E].**
  - **The TypeScript source of truth** is `src/lib/domain/cv.ts:3-20`: `MAX_CV_BYTES`, `CV_TOO_LARGE_MESSAGE`, `MAX_CV_REQUEST_BYTES`, `CV_TYPES` and `CvMimeType`.
  - **The check itself is already shared:** `checkCvFile` (`:25-34`) is called by the server (`src/lib/services/cv.ts:15`) and by both islands (`CvPanel.tsx:71`, `CvLibrary.tsx:123`).
  - **Hand-kept copies of the limits:**
    - bucket `file_size_limit` and `allowed_mime_types` (`supabase/migrations/20261001090000_cv_files.sql:11-12`);
    - literal `accept=` in `CvPanel.tsx:197` and `CvLibrary.tsx:164`;
    - the label text "PDF lub DOCX, do 5 MB" (`CvPanel.tsx:191`, `CvLibrary.tsx:158`);
    - smoke size `5 * 1024 * 1024 + 100 * 1024` (`scripts/smoke.mjs:179`);
    - demo-data hardcodes `application/pdf` (`scripts/demo-data.mjs:211,220`).
- **Reusable:** `CV_TYPES` keys and values give the `accept` string; `MAX_CV_BYTES` with `formatFileSize` give the label [I].
- **Intentionality: mixed.**
  - **Deliberate:** layered enforcement — browser, early 413, server `checkCvFile`, bucket. The 5 MB research treats the bucket as its own layer (`context/archive/2026-10-04-cv-upload-5mb-in-production/research.md:44`), and the early 413 was decided in that plan (`plan.md:47,64`) [E].
  - **Accidental:** the literal copies. The `accept=` string was copy-pasted in `e089543` [E].
  - **Forced:** SQL cannot import TypeScript, and the applied migration may not be edited [I].
- **Feasibility.**
  - Steps 1–2 need no migration: export `CV_ACCEPT` from `domain/cv.ts` with a test, then pin the bucket with a pgTAP assertion against the same values.
  - A real limit change later is a new migration with `update storage.buckets …`, which the lint does not flag (`scripts/lib/migrations.mjs:88-146 (raport: 89-150)`) [E].
  - Ordering trap: raising a limit is safe with the bucket first; lowering it needs the app check deployed first [I].
  - Guards: `src/lib/domain/cv.test.ts` (11 tests) and smoke steps `scripts/smoke.mjs:479,484,489`. The bucket limits themselves are untested [E].
  - Size **S**.

### K2 — `[id]` API routes without an `isUuid` guard

- **Current shape [E].**
  - The helper is `src/lib/domain/ids.ts:4`, tested in `ids.test.ts`. Only the pages use it (`src/pages/applications/[id]/index.astro:30`, `edit.astro:18`).
  - 6 route files with 7 handlers check only `!id`:
    - `api/applications/[id]/index.ts` (PATCH);
    - `api/applications/[id]/status.ts`, `notes.ts`, `cv.ts` (POST);
    - `api/notes/[id].ts` (PATCH, DELETE via a shared `run()`);
    - `api/cv/[id].ts` (GET).
  - Each passes the id to `.eq("id", …)` or to an RPC with a `uuid` parameter.
  - `api/applications/[id]/cv.ts:11` validates `cv_file_id` with zod but not the route id.
- **Failure path:** a non-uuid → PostgREST 22P02 [I, standard behaviour, not run] → `toServiceError` (`src/lib/services/errors.ts:11-22`) → `failureResponse` (`src/lib/http.ts:25-31`) → `logError` at 500 [E for this chain]. Since F-01, an error-level line is a Workers issue and a **Telegram alert**, so a typo or truncated link pages the owner [I].
- **Intentionality: accidental, knowingly deferred.**
  - `isUuid` arrived in `3efc183` (2026-10-05) for the details page only. The fast-details plan scoped it to the page (`context/archive/2026-10-05-fast-details-on-phone/plan.md:200-202`) [E].
  - `de1a732` added it to `edit.astro` [E].
  - F-01 deferred the API side: "the `isUuid` check on `/api/cv/[id]` (C10) … These are polish for a later change" (`context/archive/2026-10-06-production-error-visibility/plan.md:94`) [E].
  - The audit rated it low before alerts existed (C10, `audit.md:140`) [E].
- **Feasibility.**
  - Reuse `isUuid`. Add one helper in `src/lib/http.ts` that returns the id or a 404, and apply it handler by handler, after the 401 check and before `readFormData` [I].
  - No migration, no UI change.
  - Guards: `ids.test.ts`. The smoke covers only the page case ("malformed application link is not found", `scripts/smoke.mjs:526`); no test sends a malformed id to an API route [E].
  - Size **S**.

### K3 — Storage duplicate detected by error text

- **Current shape [E].**
  - `src/lib/services/cv.ts:30`: `/exists|duplicate/i.test(uploadError.message)`.
  - The installed `@supabase/storage-js` 2.116.0 builds `StorageApiError` with `status`, `statusCode` and `code` (`node_modules/@supabase/storage-js/dist/index.mjs:320-333`).
  - Its types document `code` values such as `ResourceAlreadyExists` with "use this to branch … rather than parsing the message" (`dist/index.d.mts:37-47`). `isStorageError` exists, and `StorageApiError` is re-exported by supabase-js.
- **Reusable:** `toServiceError` already copies the Storage `status` (`errors.ts:19-21`); `errors.test.ts:27-36` fakes a `StorageApiError` [E].
- **Unknown [U]:** what the local and cloud Storage servers actually return for a duplicate (older servers: HTTP 400, `statusCode "409"`, no `code`).
- **Intentionality: mixed.**
  - **Deliberate:** the self-heal branch, explained by the comment from `02921a8` [E].
  - **Accidental:** matching on message text. No record [I]; audit C6 recommends `statusCode`, and F-01 deferred it (`plan.md:94`) [E].
- **Feasibility.**
  - First probe the real duplicate response locally. Then add a pure predicate (structured code, with the regex kept as a transitional fallback) and a smoke step that pre-places the object with the service-role key and expects 201.
  - No migration. Guards today: none in any layer [E].
  - Size **S**, gated by a runtime probe.

### K4 — Upload, then attach

- **Current shape [E].**
  - `CvPanel.tsx:82` sends `POST /api/cv`, then `attach()` sends `POST /api/applications/:id/cv` (`:90`, `:24-31`).
  - The server writes twice with no transaction: Storage upload (`services/cv.ts:25-27`), then the `cv_files` insert (`:34-44`). It is self-healing through K3 and the `23505` handling (`:46-48`).
  - `CvLibrary` uploads without attaching (`CvLibrary.tsx:131-145`).
- **Intentionality: mixed.**
  - A separate upload operation is deliberate. The PRD makes the library a standalone entity: "one CV per application, chosen from a personal library" (`prd.md:101`), and `e089543` uploads to it without attaching [E].
  - Chaining two requests from the panel without atomicity is undocumented [U].
  - Audit C5 is about the orphan Storage object inside `uploadCv`, not the two client requests [E].
- **Business-concept check:**
  - "add to library" and "attach to application" are separate domain operations;
  - a combined upload-and-attach endpoint would be a **new domain operation**, not a structural refactor;
  - Storage cannot join the Postgres transaction, so true atomicity is unreachable [I].
- **Feasibility.**
  - An optional `application_id` on `POST /api/cv` composing `uploadCv` and `setApplicationCv` would be size M (route contract, island, smoke).
  - The cheaper UX fix (a clearer attach-failure message plus a library refresh) is S [I].
  - Guards: smoke `:489,503,508,598`, pgTAP `history_traces.test.sql:198-301`. No Playwright test [E].

### K5 — String contracts without shared types

- **Current shape [E].**
  - **Inline-typed reply:** the `POST /api/cv` reply `{file, reused}` (`src/pages/api/cv/index.ts:43`) is typed inline twice as `apiRequest<{ file?: CvFile; reused?: boolean } | null>` (`CvPanel.tsx:82`, `CvLibrary.tsx:131`). These are the only `apiRequest<…>` generics in `src/`; other islands read untyped `result.data.errors` (`ApplicationForm.tsx:75-78`, `NotesPanel.tsx:31`).
  - **No HTTP DTO pattern:** `src/types.ts` holds entities only (`CvFile` at `:104-110`) and no request/response DTOs. `UploadCvResult` (`services/cv.ts:9-10`) is a service result, not an HTTP type.
  - **Hand-kept twins:**
    - `CV_COLUMNS` (`services/cv.ts:7`) is matched to `CvFile` by hand;
    - `CvFile.mime_type` is `string`, not `CvMimeType`.
  - **Repeated URL strings:** `/api/cv/${id}` in `CvPanel.tsx:135,146`, `CvLibrary.tsx:51,65`, `CvPreview.tsx:49,92`.
  - **`demo-data` re-implementations:** `scripts/demo-data.mjs` copies `sha256Hex` (`:160`) and the storage path (`:208`).
- **Intentionality: accidental.**
  - The shapes are default hand-written twins from `02921a8`. `b7a1caf` turned a cast into a generic without extracting a type [E].
  - `context/map/repo-map.md:209` names generated types as a possible fix; nothing chose the current state [E].
  - The `demo-data` copy is partly forced, because a plain `.mjs` script cannot import `src/*.ts` [I].
- **Feasibility.** Independent S slices, all reversible and checked by `astro check` in CI:
  1. HTTP DTO types in `src/types.ts` (CLAUDE.md names it as the home for DTOs), used by the route and both islands;
  2. a URL helper for `/api/cv/…`;
  3. `CV_COLUMNS` derived from a typed key list.

  Moving the path and hash into `scripts/lib/` depends on whether `src/` can import `.mjs` [U]. `supabase gen types` would be a new, large abstraction; do not start there [I].
  Size **M** overall, **S** per slice.

### K6 — Preview dispatch PDF / else DOCX

- **Current shape [E].**
  - `CvPreview.tsx:70-72`: `mimeType === "application/pdf"` → `renderPdf`, anything else → `renderDocx` (`cv-render.ts:10,31`).
  - `mime_type` is free `text` in the database (`cv_files.sql:21`), written only from `check.mimeType` (`services/cv.ts:39`) or by demo-data.
- **Intentionality: accidental but sound today.** Introduced in `4a902a7` with exactly two renderers. The ternary relies on the two-type rule enforced upstream, which nothing writes down [I].
- **Feasibility.**
  - A renderer map keyed by `CvMimeType` would make a new type fail `astro check` until it has a renderer (S).
  - The safety net is missing: no Playwright test previews a PDF or a DOCX, and DOCX rendering has never been exercised (`tests/e2e/seed.spec.ts:13-31` only visits `/cv`) [E]. That test is size M (fixture, DOCX file, waiting for render).

### K7 — Download bypasses the client error channel

- **Current shape [E].**
  - Plain `<a href="/api/cv/${id}?download=1">` in `CvPanel.tsx:135` and `CvLibrary.tsx:51`. The same pattern is used deliberately for the fallback links (`CvPreview.tsx:92`, `ErrorBoundary.tsx:61`).
  - `apiRequest` already supports `parse: "bytes"` (`src/lib/api-client.ts:20`).
- **Intentionality: mixed.**
  - The native anchor with server-side `Content-Disposition` is deliberate (`4a902a7`) [E].
  - The F-01 rule "apiRequest is the only client fetch path" (`context/archive/2026-10-06-production-error-visibility/plan.md:578`) covers fetches, not navigation.
  - F-01 kept the plain fallback link on purpose (`plan.md:504`) [E].
  - That downloads fall outside the error channel is an unexamined side effect [I].
- **Feasibility.**
  - A fetch-then-blob hook would buffer up to 5 MB in memory and lose the browser's native download UI [I].
  - Size S–M, and it needs a Playwright test first.
  - **This is a UX and observability choice rather than a code-structure defect** [I].

### K8 — `cv_file_id` foreign key without an owner check

- **Current shape [E].**
  - `applications.cv_file_id uuid references cv_files(id)` (`cv_files.sql:38-39`).
  - `applications_update_own` lets the owner update any column (`20260929180000_create_applications.sql:50-53`).
  - Foreign-key checks bypass RLS [I, Postgres semantics]. Only `set_application_cv` (security invoker; the select at `:77-81` runs under RLS) refuses a foreign file.
  - Reads stay safe: `readCv` is RLS-filtered.
- **Intentionality: accidental.**
  - Introduced in `02921a8`.
  - Domain distillation keeps it open as drift D-06 with a "done when" (`context/domain/domain-distillation.md:163,187`).
  - The accepted owner-bypass limit (`context/foundation/test-plan.md:197`) covers traces and transitions, not this integrity gap [E].
- **Business-concept check [I]:**
  - It is about whether per-user ownership of the library is enforced by the schema or by convention.
  - That is data integrity, not code structure.
  - Its fix is small, but it carries the full migration ritual.
- **Feasibility.**
  - **Lint-clean option:** a new trigger function `create function public.applications_cv_owner_check()` (not `or replace`) plus a `before insert or update of cv_file_id` trigger. Neither statement is flagged (`scripts/lib/migrations.mjs:88-146 (raport: 89-150)`) [E].
  - **Rejected option:** a composite FK needs a unique index plus FK, both flagged.
  - **Previous code is unaffected** [I]: it writes `cv_file_id` only through `set_application_cv`, which already refuses foreign files (`history_traces.test.sql:228-235 (raport: 286-289)`).
  - **Prerequisite:** a cloud data check for existing violations.
  - **Rollout:** `db push` before `git push`, the compatibility smoke and the deploy gate apply.
  - Size **S–M**.

## Refactor opportunities (ranked)

Ranking basis: cost of the debt (what it causes today, how likely and how visible) against cost of the change (size, migration ritual, missing safety net), with intentionality as a tie-breaker. Accidental shapes are cheaper to move than load-bearing ones.

### 1. K2 — one id guard for every `[id]` API route

- **Current → target.**
  - **Today:** 7 handlers check only `!id` and pass any string to Postgres.
  - **Target:** one helper next to `failureResponse` in `src/lib/http.ts` turns a non-uuid route id into a 404 before any parsing or query, reusing `isUuid` from `src/lib/domain/ids.ts`.
- **Why first.**
  - The debt cost changed after the audit rated it low. Since F-01, every logged 500 is a Telegram alert, so a malformed or truncated link now produces a false production alarm. Noise erodes the only alert channel the owner reads [I].
  - The change cost is the lowest of all candidates: an existing tested rule, no migration, no UI, no business concept.
  - Accidental and explicitly deferred as "polish for a later change" [E].
- **Blast radius:** 6 route files under `src/pages/api` and `src/lib/http.ts`; smoke gains steps. Islands and services are untouched [E].
- **Incremental path:**
  1. Add a smoke step that records today's behaviour of `GET /api/cv/not-a-uuid` (expected to fail against 404).
  2. Add the helper.
  3. Apply it to `api/cv/[id].ts`, the only GET reachable from a link.
  4. Apply it to the remaining POST/PATCH/DELETE handlers, one commit each if desired.
  5. Add a smoke step for one write route.
- **First prerequisite step:** the failing smoke step for `GET /api/cv/not-a-uuid`. It also settles the [I] about today's status code.

### 2. K5 — shared HTTP types and URL helpers for the CV API (sliced)

- **Current → target.**
  - **Today:** reply shapes are typed inline per island, URLs are repeated strings, and `CV_COLUMNS` mirrors `CvFile` by hand.
  - **Target:**
    - HTTP DTOs in `src/types.ts`, used by the route's `Response.json` and the islands;
    - a small URL helper for `/api/cv/…`;
    - `CV_COLUMNS` derived from a typed key list.
- **Why second.**
  - Every later CV change (K1, K4, K6, K7) touches these contracts. Today the compiler cannot see a drift between route and island, and the analysis found the coupling to `types.ts` invisible in co-change history [E].
  - Each slice is S, type-level, reversible and guarded by `astro check` in CI.
  - Accidental shape [E].
  - Ranked below K2 because its cost is latent (future drift) rather than an active false alarm.
- **Blast radius:** `src/types.ts`, `src/pages/api/cv/index.ts`, `src/pages/api/applications/[id]/cv.ts`, `CvPanel.tsx`, `CvLibrary.tsx`, `CvPreview.tsx`, `src/lib/services/cv.ts`, `/dev/ui` fixtures. No migration, no runtime behaviour change [I].
- **Incremental path:**
  1. Add the `POST /api/cv` reply DTO and use it in both islands and the route.
  2. Add the attach reply DTO.
  3. Add the URL helper.
  4. Derive `CV_COLUMNS`.
  5. Leave `demo-data` until the `.mjs`/TS import question is answered.
- **First prerequisite step:** the `POST /api/cv` reply type in `src/types.ts`, replacing the two inline generics.

### 3. K1 — limits from one source, with the database copy pinned by a test

- **Current → target.**
  - **Today:** `accept=` and the label text are literals in two islands, and the bucket limits are an unchecked copy in an applied migration.
  - **Target:**
    - `CV_ACCEPT` (and the label text) derived from `CV_TYPES` / `MAX_CV_BYTES` in `src/lib/domain/cv.ts`;
    - a pgTAP assertion that pins the bucket's `file_size_limit` and `allowed_mime_types` to the same values.
- **Why third.**
  - It removes the "change one place, get a 500" trap the analysis named first, and makes the bucket copy fail loudly in CI instead of in production [I].
  - Small and needs no migration.
  - Ranked third because no limit change is planned, so the debt only bites on change. It is cheapest done before such a change, not urgently [I].
- **Blast radius:** `src/lib/domain/cv.ts` (+ test), `CvPanel.tsx`, `CvLibrary.tsx`, `supabase/tests/` (new assertion). A future limit change adds a new migration with `update storage.buckets`; lint-clean, with the ordering rule above [E/I].
- **Incremental path:**
  1. Add `CV_ACCEPT` with a test.
  2. Use it in both islands.
  3. Add the pgTAP pin.
  4. Optionally derive the label text.
- **First prerequisite step:** `CV_ACCEPT` in `domain/cv.ts` with a unit test.

### Considered and not ranked

- **K3 (duplicate by error text).**
  - Small and accidental, but ranking it requires a fact we do not have: the real Storage duplicate response [U].
  - Without that probe, a "structured" predicate could break the self-heal it protects.
  - Good follow-up once the probe is done; it can ride with any CV change.
- **K8 (owner check on `cv_file_id`).**
  - A real integrity gap, but data integrity rather than code structure, already tracked as D-06.
  - It brings the full migration ritual (cloud data check, `db push`, compatibility smoke, deploy gate) for a single-user app, where the gap is reachable only by the owner bypassing the app [E/I].
  - Better as its own small change.
- **K4 (one request for upload and attach).**
  - The real fix would be a new domain operation ("upload-and-attach"), and atomicity across Storage and Postgres is unreachable.
  - Per the hard boundary, this is a **business-concept question, not a structural refactor**. Stopped here. The cheaper UX-only improvement is not a refactor.
- **K6 (renderer map).**
  - Sound today with two types. Its safety net (a Playwright PDF + DOCX preview test) is missing and costs more than the change.
  - Revisit together with that test.
- **K7 (download through `apiRequest`).**
  - A UX and observability trade-off (memory buffering, losing the native download UI), not a structural defect.
  - Not ranked.

## Weryfikacja twierdzeń (ast-grep)

Narzędzie: `npx -p @ast-grep/cli@0.45.3 ast-grep run -l <ts|tsx> -p '<wzorzec>'` na commicie `75f6f85`. ast-grep nie parsuje `.astro`, `.sql` ani `.mjs` z regułami lint jako danych, więc tam użyto `rg`. Każde zero z ast-grep powtórzono klasycznym grepem.

| Twierdzenie (na którym stoi ranking)                                                                                                                   | Werdykt       | Dowód (plik:linia)                                                                                                                                                                                                         | Metoda                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| K2: 6 plików tras z segmentem `[id]`, 7 handlerów                                                                                                      | potwierdzone  | `api/applications/[id]/cv.ts:14` POST, `index.ts:10` PATCH, `notes.ts:11` POST, `status.ts:10` POST; `api/notes/[id].ts:30` PATCH, `:44` DELETE; `api/cv/[id].ts:9` GET                                                    | ast-grep `export const $M: APIRoute = $$$` (ts)                                                                                                   |
| K2: żadna trasa API nie używa `isUuid`                                                                                                                 | potwierdzone  | 0 dopasowań ast-grep; `rg isUuid src/pages/api` → 0; użycia tylko w `src/pages/applications/[id]/index.astro:30`, `edit.astro:18`                                                                                          | ast-grep `isUuid($$$)` + `rg`                                                                                                                     |
| K2: każda z tras sprawdza tylko `!id`                                                                                                                  | potwierdzone  | `api/cv/[id].ts:15`, `api/notes/[id].ts:17`, `api/applications/[id]/index.ts:26`, `cv.ts:22`, `notes.ts:19`, `status.ts:22`                                                                                                | `rg '!id'` (wzorzec ast-grep dla warunku złożonego dał 0 — zły wzorzec, nie brak wystąpień)                                                       |
| K2: wspólne elementy do ponownego użycia: `isUuid`, `failureResponse`, `toServiceError`                                                                | potwierdzone  | `src/lib/domain/ids.ts:4`, `src/lib/http.ts:25`, `src/lib/services/errors.ts:11`                                                                                                                                           | ast-grep `export function failureResponse($$$): $R { $$$ }`; dla `isUuid` (typ-predykat `value is string`) wzorzec dał 0 → `rg 'export function'` |
| K2: smoke testuje zły id tylko dla strony                                                                                                              | potwierdzone  | `scripts/smoke.mjs:526` ("malformed application link is not found"); `:417` dotyczy złego ciała, nie id                                                                                                                    | `rg -i malformed`                                                                                                                                 |
| K5: jedyne generyki `apiRequest<…>` w `src` to odpowiedź uploadu w dwóch komponentach                                                                  | potwierdzone  | `CvPanel.tsx:82`, `CvLibrary.tsx:131` (+ definicja `api-client.ts:21`)                                                                                                                                                     | `rg 'apiRequest<'` (ast-grep nie dopasowuje jawnych argumentów typu w `.tsx` — znane z M4L3)                                                      |
| K5: `src/types.ts` ma tylko encje, bez DTO żądań/odpowiedzi                                                                                            | potwierdzone  | 6 interfejsów: `Application:18`, `NoteRevision:67`, `Note:76`, `StatusChange:88`, `FieldChangeRow:96`, `CvFile:104`; 4 aliasy typów enumów `:10,13,16,60`                                                                  | ast-grep `export interface $N { $$$ }`, `export type $N = $$$`                                                                                    |
| K5: inne komponenty czytają nietypowane `result.data.errors`                                                                                           | potwierdzone  | `ApplicationForm.tsx:75`, `NotesPanel.tsx:31`                                                                                                                                                                              | ast-grep `$R.data.errors` (tsx)                                                                                                                   |
| K5: adresy `/api/cv/${…}` powtarzane jako stringi                                                                                                      | doprecyzowane | `CvPanel.tsx:135,146`, `CvLibrary.tsx:51,65`, `CvPreview.tsx:49,92` oraz `src/pages/dev/ui.astro:309` — 7 miejsc (raport: 6 + „/dev/ui fixtures”)                                                                          | `rg '/api/cv/\$\{'`                                                                                                                               |
| K5: `CV_COLUMNS` ręcznie zgodne z `CvFile`; `mime_type` jako `string`                                                                                  | potwierdzone  | `src/lib/services/cv.ts:7`, `src/types.ts:107`                                                                                                                                                                             | `rg`                                                                                                                                              |
| K5: `demo-data` ma własne `sha256Hex` i ścieżkę                                                                                                        | potwierdzone  | `scripts/demo-data.mjs:160`, `:208`                                                                                                                                                                                        | `rg`                                                                                                                                              |
| K1: `CV_TYPES` jako jedno źródło typów, z którego da się wyprowadzić `accept`                                                                          | potwierdzone  | `src/lib/domain/cv.ts:16`                                                                                                                                                                                                  | ast-grep `export const CV_TYPES = $V`                                                                                                             |
| K1: `accept=` i etykieta „PDF lub DOCX, do 5 MB” skopiowane w dwóch komponentach                                                                       | potwierdzone  | `accept=`: `CvPanel.tsx:197`, `CvLibrary.tsx:164`; etykieta: `CvPanel.tsx:191`, `CvLibrary.tsx:158`                                                                                                                        | `rg`                                                                                                                                              |
| K1/K8: `update storage.buckets`, `create function` i `create trigger` nie są regułami lintu migracji; `create or replace function` i `unique-or-fk` są | potwierdzone  | reguły `scripts/lib/migrations.mjs:88-146` (raport: 89-150): `create-or-replace-function` `:117`, `unique-or-fk` `:133`, `drop` (także `trigger`) `:88-90`; brak reguły dla `update`/`create trigger`                      | `rg 'rule: "'`                                                                                                                                    |
| K3: storage-js ma pola strukturalne błędu (`statusCode`, `code` np. `ResourceAlreadyExists`)                                                           | potwierdzone  | `node_modules/@supabase/storage-js/dist/index.d.mts:18,39,42`                                                                                                                                                              | `rg`                                                                                                                                              |
| K8: `set_application_cv` odrzuca nieznane i cudze CV (pgTAP)                                                                                           | doprecyzowane | `supabase/tests/history_traces.test.sql:230` („an unknown CV id is refused”), `:234` („another user's CV is refused”) — 228-235 (raport: 286-289; linie 284-288 dotyczą cudzej _aplikacji_ i ukrywania historii przez RLS) | `rg`                                                                                                                                              |

**Wpływ na ranking:** żadne twierdzenie, na którym stoją pozycje 1–3, nie zostało obalone. Dwa doprecyzowania (7. miejsce z adresem `/api/cv/…` w `/dev/ui`; poprawne linie testu pgTAP dla K8) nie zmieniają oceny kosztu ani zasięgu — do decyzji na etapie planowania.

## Code References

- `src/lib/domain/ids.ts:4` — `isUuid` (reusable for K2)
- `src/lib/http.ts:25-31` — `failureResponse`; home for a route-id helper (K2)
- `src/pages/api/cv/[id].ts:14-19`, `src/pages/api/applications/[id]/{index,status,notes,cv}.ts`, `src/pages/api/notes/[id].ts` — handlers without an id guard (K2)
- `src/lib/services/errors.ts:11-22` — `toServiceError` (K2 failure path, K3 status copy)
- `src/types.ts:104-110` — `CvFile`; entity types only (K5)
- `src/components/applications/CvPanel.tsx:82,135,191,197` and `CvLibrary.tsx:51,131,158,164` — inline reply types, URLs, label, `accept=` (K1, K5, K7)
- `src/lib/domain/cv.ts:3-34` — limits, `CV_TYPES`, `checkCvFile` (K1)
- `supabase/migrations/20261001090000_cv_files.sql:6-14,38-39,54-92` — bucket limits, `cv_file_id`, `set_application_cv` (K1, K8)
- `src/lib/services/cv.ts:7,25-48` — `CV_COLUMNS`, upload, self-heal regex, `23505` (K3, K4, K5)
- `node_modules/@supabase/storage-js/dist/index.d.mts:14-47` — structured Storage error fields (K3)
- `scripts/lib/migrations.mjs:88-146 (raport: 89-150)` — migration lint rules (K1, K8 feasibility)

## Architecture Insights

- The CV capability already has the right seams: pure rules in `domain/cv.ts`, Supabase access in `services/cv.ts`, thin routes, islands calling `apiRequest`. The top candidates finish what those seams started (one id rule, one type per HTTP contract, one source for limits); none needs a new layer.
- The debt clusters at boundaries the compiler cannot see: route ↔ island (HTTP), TS ↔ SQL (bucket limits, FK), app ↔ script (`demo-data`). The cheapest fixes either make a boundary typed (K5) or pin the untyped side with a test (K1).
- F-01 changed the economics of error-handling debt. An item that only produced a log line is now an alert (K2).

## Historical Context (from prior changes)

- `context/archive/2026-10-04-cv-upload-5mb-in-production/` — bucket as its own enforcement layer (`research.md:44`); early 413 decided (`plan.md:47,64`); limits and types out of scope (`plan.md:39`).
- `context/archive/2026-10-05-fast-details-on-phone/plan.md:200-202` — `isUuid` scoped to the details page.
- `context/archive/2026-10-06-production-error-visibility/plan.md:94` — C6, C10 deferred as "polish for a later change"; `:504` plain fallback link kept on purpose; `:578` `apiRequest` as the only client fetch path.
- `context/domain/domain-distillation.md:163,187` — D-06 (K8) with its "done when".
- `context/foundation/test-plan.md:197` — owner-level bypass accepted for traces and transitions.

## Related Research

- `context/changes/cv-flow-analysis/research.md` — the analysis this ranking builds on.
- `context/map/repo-map.md` — CV as risk zone #1.
- `context/domain/domain-distillation.md` — D-06.

## Open Questions

- [U] Actual HTTP status and log for a malformed id on each API route (inferred 500; K2's first step settles it).
- [U] Exact Storage duplicate response (`status`, `statusCode`, `code`) on local and cloud Supabase (gates K3).
- [U] Whether the cloud `cvs` bucket matches the migration (relevant to K1's pin; `on conflict do nothing`).
- [U] Cloud data for K8: any application pointing at another user's `cv_files` row.
- [U] Whether TypeScript in `src/` can import `scripts/lib/*.mjs` (decides K5's `demo-data` slice).
