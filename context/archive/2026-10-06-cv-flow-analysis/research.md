---
date: 2026-10-06T17:41:59Z
researcher: Claude (agent) for the repository owner
git_commit: 161568de938eb77cc5b7c25def8e5736e526cf6a
branch: main
repository: applications-tracker
topic: "CV flow: upload to the library, attach to an application, in-page preview and download — with the areas the project map ties to it"
tags: [research, cv, upload, storage, preview, blast-radius, test-gaps]
status: complete
last_updated: 2026-10-06
last_updated_by: Claude (agent)
last_updated_note: structural claims re-checked with ast-grep 0.45.3 (section "Structural claims verified with ast-grep"); zeros confirmed with grep
---

# Research: CV flow (upload, attach, preview, download)

**Date**: 2026-10-06T17:41:59Z
**Researcher**: Claude (agent) for the repository owner
**Git Commit**: 161568de938eb77cc5b7c25def8e5736e526cf6a
**Branch**: main
**Repository**: applications-tracker

## Research Question

Analyse the CV flow — upload to the CV library, attaching a CV to an application, in-page preview and download — paying particular attention to the related areas defined in `context/map/repo-map.md` (CV is risk zone #1 there; it leans on the errors and availability zones). Three parallel investigations: end-to-end trace, test gaps, blast radius. Analysis of the current repository only; separate evidence from inference and unknowns.

Labels used below: **[E]** evidence (read in code, tests or git), **[I]** inference, **[U]** unknown.

## Summary

- **The flow is four sub-flows over one storage contract.**
  - Upload: `POST /api/cv` → `uploadCv` → Storage `cvs/<user_id>/<sha256>.<ext>` + row in `cv_files`, deduplicated by `(user_id, sha256)`.
  - Attach: `POST /api/applications/[id]/cv` → SQL `set_application_cv`, which writes the change and its `field_changes('cv')` trace in one transaction.
  - Preview: lazy `CvPreview` fetches bytes from `GET /api/cv/[id]` and renders them with pdf.js or docx-preview.
  - Download: a plain link to `GET /api/cv/[id]?download=1`.
- **Guards are layered and mostly hard.** Size and type are checked in the browser (`checkCvFile`), before body parsing (413 on `Content-Length`), after parsing (`checkCvFile` again) and by the bucket limits. Isolation is RLS on the table and the bucket. The change trace is atomic.
- **Tests:** the HTTP smoke covers the happy paths and isolation (15 CV steps), and pgTAP covers `set_application_cv` (13 assertions). There is **no browser test** of upload, attach, preview or the preview fallback, and no unit test of `services/cv.ts`, the three routes or the islands.
- **Main debt:**
  1. One rule (5 MB, PDF/DOCX) is kept by hand in four places.
  2. Response shapes and URLs are string contracts with no shared type.
  3. Duplicate detection relies on a regex over the Storage error text.
  4. Upload-then-attach is not atomic.
  5. A malformed id on `GET /api/cv/[id]` very likely becomes a logged 500 (and so a Telegram alert) instead of a 404. Audit C10 is still open.
  6. Detach exists only server-side and is untested.
  7. The preview picks DOCX for any non-PDF type.

## Feature overview

### What the user can do

The owner keeps a personal CV library (`/cv`). From an application's details page they can upload a new file or pick one from the library, preview it in the page and download it. Each change of the attached CV appears in the application's history. The same bytes uploaded again, under any name, are stored once. PRD: FR-012/FR-013 (`context/foundation/prd.md:97-98`).

### Sub-flow 1a — upload from the library page `/cv`

1. SSR in `src/pages/cv.astro:16` loads `listCvFiles` and `listApplications` together and groups them with `groupByCv` (`src/lib/domain/cv.ts:54`). A paused project redirects to `/paused` (`cv.astro:28`); any other read error renders an inline message with status 500 (`cv.astro:29-31`) [E].
2. `CvLibrary.tsx:149` `handleChange` runs `checkCvFile` in the browser (`:123`). A rejected file (empty, larger than 5 MB, not PDF/DOCX) sets the error state and nothing is sent [E].
3. `apiRequest("/api/cv", POST, FormData{file})` (`CvLibrary.tsx:131`, `src/lib/api-client.ts:25`) classifies the reply. A non-JSON error is kind `server` and sends a `/api/client-error` report; 503 `database_paused` is kind `paused` [E].
4. The middleware calls `auth.getUser()` on `/api/*`. A paused project gives 503 `database_paused`, an Auth outage 503 `auth_unavailable`, missing config 503 `misconfigured` (`src/middleware.ts`) [E].
5. `src/pages/api/cv/index.ts`:
   - 401 without a user (`:14`);
   - **413 before parsing** when `Content-Length` exceeds 5 MB + 64 KiB (`:19`, `isUploadRequestTooLarge` `src/lib/domain/cv.ts:11`);
   - a `logInfo` breadcrumb with the byte count (`:26`);
   - `readFormData`: a malformed body gives 400; no `file` field gives 400 (`:28-31`) [E].
6. `uploadCv` (`src/lib/services/cv.ts:14`):
   - `checkCvFile` again: a wrong type or size gives 400;
   - SHA-256 of the bytes; `findBySha` returns `reused: true` with 200 when the file is already in the library (`:21-22`);
   - otherwise `storage.upload(path, …, { upsert: false })` (`:25-27`). A Storage error whose message matches `/exists|duplicate/i` is **ignored** (self-heal for a half-failed earlier upload; `:30`), any other error is thrown;
   - INSERT into `cv_files` (`:34`); error `23505` (a parallel upload of the same bytes) re-reads the winner and returns it as reused (`:47-48`); 201 on a new file [E].
7. A thrown error goes to `failureResponse` (`src/lib/http.ts`): a paused project gives 503 `database_paused`, anything else one `logError` line and a 500 with the route's message [E].
8. UI: 201 reloads the page (`CvLibrary.tsx:143`); `reused` shows "Ten plik jest już w bibliotece jako „…”" with no reload (`:141`); an error shows `ErrorText` [E].

### Sub-flow 1b — upload from the CV panel (upload, then attach)

1. The details page loads `getApplicationDetails` and `listCvFiles` with `Promise.allSettled`.
   - A pause redirects to `/paused`.
   - A failed library read replaces only the CV panel with an alert.
   - An attached CV missing from a loaded library is shown as "no CV" with a `logWarn` `cv.resolve` (`src/pages/applications/[id]/index.astro:31-63`) [E].
2. `CvPanel.tsx:66` checks the file in the browser (`:71`), sends the same `POST /api/cv` (`:82`), and on success calls `attach(applicationId, file.id)` (`:90`) — **a second, separate request** [E].
3. If attach fails after a successful upload, the error is shown and the page is not reloaded. The file stays in the library, unattached (`:57`) [E].

### Sub-flow 2 — attach / change (detach only server-side)

1. The select (`CvPanel.tsx:61`; options exclude the current CV, `:102`) or step 1b.2 calls `apiRequest("/api/applications/<id>/cv", POST, FormData{cv_file_id})` (`:24-27`) [E].
2. Route `src/pages/api/applications/[id]/cv.ts`:
   - 401 without a user;
   - `readFormData`;
   - zod `uuid | "" → null` (`:11`), so an empty value means **detach** [E].
3. `setApplicationCv` (`src/lib/services/cv.ts:75`) calls `set_application_cv` (`supabase/migrations/20261001090000_cv_files.sql:54`; `security invoker`, execute granted to `authenticated` only, `:94-95`):
   - locks the application row `for update`;
   - an unknown or foreign application returns false → 404;
   - the same CV returns true with no trace (`:73`);
   - a CV id not visible through RLS (unknown or another user's) returns false → 404 (`:77-82`);
   - otherwise it updates `cv_file_id` and inserts `field_changes('cv', old_name, new_name)` in the same transaction (`:84-89`) [E].
4. The page reloads, and the history shows "CV: old → new" (`src/lib/domain/changes.ts:19,33`) [E].
5. Detach: the route and the SQL accept it; **no UI sends it** (the select's "—" option is disabled; no other sender found in `src/components`) [E].

### Sub-flow 3 — in-page preview

1. "Podgląd" mounts `ErrorBoundary(op "cv.preview", fallback PreviewFallback)` → `Suspense` → lazy `CvPreview` (`CvPanel.tsx:16,120`; `CvLibrary.tsx:14,41`) [E].
2. `CvPreview.tsx` runs `apiRequest("/api/cv/<id>", GET, parse "bytes", signal)` (`:49`).
   - A failed fetch shows an Alert with an "Otwórz plik w nowej karcie" link (`:55,87`).
   - Closing the panel aborts the fetch [E].
3. `GET /api/cv/[id]` (`src/pages/api/cv/[id].ts`):
   - 401 without a user (`:10-12`);
   - `readCv` selects the row under RLS: missing or foreign gives 404 (`:19-20`);
   - Storage download under `cvs_select_own`;
   - 200 with the stored MIME type, `inline` disposition, `filename*=UTF-8''…`, `Cache-Control: private, max-age=300` and `nosniff` (`:21-29`);
   - an error goes to `failureResponse` (`:31-32`) [E].
4. The renderer chunk loads with `import("./cv-render")` (`CvPreview.tsx:62`). `application/pdf` goes to `renderPdf` (pdf.js, canvas per page); **every other type goes to `renderDocx`** (`CvPreview.tsx:70`; `cv-render.ts:10,31`). An import or render failure reports and shows the in-component Alert [E].
5. `ErrorBoundary` (`src/components/ErrorBoundary.tsx:24`) catches only what escapes: a failed lazy `CvPreview` chunk or a thrown render. It reports kind `boundary` and shows `PreviewFallback` ("Odśwież stronę", "Otwórz plik") [E].

### Sub-flow 4 — download

A plain `<a href="/api/cv/<id>?download=1">` (`CvPanel.tsx:135`, `CvLibrary.tsx:51`) hits the same route with `attachment` disposition (`[id].ts:21`). It bypasses `apiRequest`, so a failure opens the raw JSON error in the browser and sends no client report [E].

```mermaid
sequenceDiagram
  participant U as CvPanel / CvLibrary
  participant M as middleware
  participant R as API routes
  participant S as services/cv.ts
  participant DB as Postgres (RLS)
  participant ST as Storage cvs
  U->>U: checkCvFile (browser)
  U->>M: POST /api/cv (multipart)
  M->>M: auth.getUser (paused→503, outage→503)
  M->>R: index.ts: 401? Content-Length > 5 MB+64 KiB → 413
  R->>S: uploadCv: checkCvFile → 400, sha256
  S->>DB: select cv_files by sha (RLS)
  alt already in library
    DB-->>U: 200 {file, reused:true}
  else new
    S->>ST: upload uid/sha.ext (upsert:false; "exists|duplicate" ignored)
    S->>DB: insert cv_files (23505 → reuse winner)
    DB-->>U: 201 {file}
  end
  U->>R: POST /api/applications/:id/cv {cv_file_id} (panel only)
  R->>DB: rpc set_application_cv (update + field_changes 'cv')
  DB-->>U: 200 / 404 → reload or error text
  U->>R: GET /api/cv/:id (preview: apiRequest bytes; download: <a> ?download=1)
  R->>DB: select row (RLS) → 404
  R->>ST: download → bytes
  R-->>U: 200 inline / attachment
  U->>U: import cv-render → pdf.js / docx-preview; fail → Alert; chunk/throw → ErrorBoundary
```

### Test coverage of the flow

| Layer        | CV-specific tests                                                                                       | Covers                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Vitest       | 11 in `src/lib/domain/cv.test.ts` (+ ~5 indirect: `changes.test.ts:51`, `client-errors.test.ts:28,178`) | `checkCvFile` (empty, size, type, extension), `isUploadRequestTooLarge`, `sha256Hex`, `cvStoragePath`, `formatFileSize`, `groupByCv` [E]   |
| pgTAP        | 13 assertions in `supabase/tests/history_traces.test.sql:198-301`                                       | first attach and replace traces, same-CV no-op, unknown/foreign CV refused, foreign application refused, attach does not bump activity [E] |
| Smoke (HTTP) | 15 steps, `scripts/smoke.mjs:479-523,563,595-600`                                                       | wrong type 400, early 413, upload 201, dedupe 200 `reused`, attach, history "CV:", inline and download, `/cv` page, cross-user 404s [E]    |
| Playwright   | 0 CV-flow tests                                                                                         | `tests/e2e/seed.spec.ts` only visits `/cv` and checks the heading [E]                                                                      |

**Not covered in any layer** [E]:

- **API routes:**
  - `POST /api/cv` without a user (401), with a malformed body and with no `file` field;
  - the attach route with an invalid uuid or a malformed body;
  - `GET /api/cv/[id]` with a malformed id, without a user (401), and when the Storage download fails.
- **Storage and races in `services/cv.ts`:** the Storage self-heal, other Storage errors, the `23505` race, and `findBySha` or `listCvFiles` errors.
- **Detach:** missing in every layer.
- **Paused project:** 503 in the three CV routes and the `/cv` → `/paused` redirect.
- **Response headers:** `filename*` encoding of non-ASCII names, `nosniff`, `Cache-Control`.
- **Database guards:**
  - the `cv_files` insert policy (`storage_path` under the user's own folder);
  - the `unique (user_id, sha256)`, sha256-format and `size_bytes > 0` constraints;
  - the bucket's size and MIME limits.
- **Browser UI:**
  - `CvPanel` and `CvLibrary` behaviour, incl. client-side refusal and the reused message;
  - `CvPreview` fetch, import and render failures;
  - `renderPdf` and `renderDocx` (DOCX rendering never exercised);
  - `ErrorBoundary` with `PreviewFallback`.

### Blast radius — what changes together

| If you change                                                     | Also change or check                                                                                                                                                                                                                                                                                                             | Evidence                                                                                                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Size limit `MAX_CV_BYTES` (`src/lib/domain/cv.ts:3`)              | bucket `file_size_limit` (`20261001090000_cv_files.sql:11`, needs a **new** migration with `update storage.buckets`; the original is `on conflict do nothing`), `MAX_CV_REQUEST_BYTES` (`cv.ts:7`), message "5 MB" (`cv.ts:4`), smoke `oversizedCv` and "za duży" (`smoke.mjs:179,486`), PRD FR-013, CLAUDE.md CV bullet, README | [E] same rule in four layers, no import between them; a larger app limit with the old bucket → Storage error → 500 instead of 400 [I] |
| Allowed types `CV_TYPES` (`cv.ts:16`)                             | bucket `allowed_mime_types` (`…cv_files.sql:12`), `accept=` copied in `CvPanel.tsx:197` and `CvLibrary.tsx:164`, renderer branch `CvPreview.tsx:70` + `cv-render.ts`, message "PDF i DOCX", smoke step (`smoke.mjs:479`), PRD                                                                                                    | [E]                                                                                                                                   |
| Storage path `cvStoragePath` (`cv.ts:43`)                         | RLS `cv_files_insert_own` (`…cv_files.sql:36`), storage policies (`:46,50`), `scripts/demo-data.mjs` own copy of path and `sha256Hex`                                                                                                                                                                                            | [E] runtime string contract + RLS, no import edge                                                                                     |
| `POST /api/cv` reply `{file, reused}` 201/200/400/413             | both islands type it inline (`CvPanel.tsx:82`, `CvLibrary.tsx:131`), smoke reads `.file.id` (`smoke.mjs:492`)                                                                                                                                                                                                                    | [E] no exported response type — compiler cannot catch drift                                                                           |
| Attach contract (`cv_file_id`, `""` = detach, `{id, cv_file_id}`) | `CvPanel.tsx:26-27`, `smoke.mjs:504,599`                                                                                                                                                                                                                                                                                         | [E] URL + form-field contract                                                                                                         |
| `GET /api/cv/[id]` (`?download=1`, headers, 404 for foreign)      | URL strings in `CvPanel.tsx:135,146`, `CvLibrary.tsx:51,65`, `CvPreview.tsx:49,92`, `src/pages/dev/ui.astro`, `smoke.mjs:511,522,596`                                                                                                                                                                                            | [E]                                                                                                                                   |
| `CvFile` (`src/types.ts:104`) / `CV_COLUMNS` (`services/cv.ts:7`) | islands, details page (`[id]/index.astro:11,60`), `/dev/ui` fixtures                                                                                                                                                                                                                                                             | [E] hand-kept twin of `cv_files`; no generated DB types in the repo                                                                   |
| `set_application_cv`                                              | `services/cv.ts:81` (called by name), pgTAP, CLAUDE.md list of atomic functions; migration lint flags `create or replace function`, so a change means a new function                                                                                                                                                             | [E]                                                                                                                                   |
| `field_changes.field = 'cv'` (`…cv_files.sql:89`)                 | `HISTORY_FIELDS` / `FIELD_LABELS.cv` (`changes.ts:19,33`); `mergeHistory` drops unknown fields (`changes.ts:67`)                                                                                                                                                                                                                 | [E] `field` is free text with no check, so a rename silently hides rows [I]                                                           |
| `cv_files` / `applications.cv_file_id` schema                     | `services/cv.ts` (4 `.from` calls), `groupByCv`, `cv.astro`, details page, `demo-data.mjs:192-214,348` (service role, upsert, delete), pgTAP inserts                                                                                                                                                                             | [E]                                                                                                                                   |

**Static graph** (from the repo-map run, `context/map/.work/edges-ts-*.csv`) [E]:

- **Inbound to CV:** only the details page (`[id]/index.astro` → `CvPanel.tsx`, `services/cv.ts`) and the dev-only `/dev/ui`.
- **Outbound from CV:** mostly to errors (17 edges: `api-client`, `client-errors`, `ErrorText`, `ErrorBoundary`, `http`, `log`, `services/errors`) and shared UI. Single edges go to `format.ts` (details), `domain/status.ts` (CvLibrary), `services/applications.ts` and `supabase-paused.ts` (`cv.astro`).

**Co-change** [E]: 12 of 102 commits touch CV files.

- **Outside the CV files:** `smoke.mjs` 7, details page 5, `StatusControl` 4, `NotesPanel` 4, CLAUDE.md 4.
- **Never or barely co-changed despite a real coupling:** `types.ts`, `changes.ts`, `demo-data.mjs`, `supabase/tests` (0–1 each).

**Generated layers:** none found (no `supabase gen types`, no `Database` type; scope: `git grep` outside `context/` and the lockfile) [E].

## Technical debt

Ordered by consequence. Each item says how it was established.

1. **One rule, four hand-kept copies of its limits (5 MB, PDF/DOCX)** [E]. The check itself is one shared function, `checkCvFile`, called in 3 places (ast-grep claim 5).
   - **Where:** `domain/cv.ts:3,7,16`, bucket limits in `20261001090000_cv_files.sql:6-14`, `accept=` in `CvPanel.tsx:197` and `CvLibrary.tsx:164`, plus the smoke and docs.
   - **Consequence:** a change in one place without the bucket turns a clean 400 into a 500 and an alert [I].
   - **Constraints:** the bucket row is inserted with `on conflict do nothing`, so whether the cloud bucket matches the migration is [U]. The applied migration may not be edited (`scripts/check-migrations.mjs`).
2. **Malformed id on `GET /api/cv/[id]` very likely becomes a logged 500** [I].
   - The route has no `isUuid` guard (`src/pages/api/cv/[id].ts:14-19`), while the pages have one.
   - `readCv` filters by id, Postgres rejects a non-uuid (22P02), and `toServiceError` → `failureResponse` logs at error level, which since F-01 means a Workers issue and a Telegram alert. A bad or truncated link therefore raises a false alarm.
   - Previously recorded as audit **C10 (low)** (`context/audits/observability/2026-10-06_call-time-read-agreement-writes-cv-upload.md:140`) and listed out of scope in F-01. Not run.
   - The same pattern applies to `src/pages/api/applications/[id]/cv.ts` only if `[id]` reaches the SQL. Its zod check validates `cv_file_id`, not the route id [U].
3. **Duplicate detection by error text** (`services/cv.ts:30`, `/exists|duplicate/i`, status code not checked) [E].
   - If Supabase changes the wording, a re-upload after a half-failed upload returns a 500 every time [I].
   - Any unrelated Storage error that contains "exists" is silently treated as success [I].
   - Not covered by any test. Audit C6.
4. **Upload-then-attach is two requests** (`CvPanel.tsx:82,90`) [E].
   - When attach fails, the file stays in the library unattached and the panel keeps a stale `library` prop until a reload.
   - Upload itself is two writes (Storage object, then row), with self-heal on retry (`services/cv.ts:24-51`); audit C5.
   - "Nothing is deleted" means orphans are permanent but harmless [I].
5. **String contracts with no shared types** [E] (re-checked: claims 4, 9, 14 below).
   - Response bodies are typed inline in each island.
   - URLs, form field names, the path convention, the SQL function name and `field = 'cv'` are strings repeated across layers; the bucket name `"cvs"` is one constant in `src/` and repeated only in `scripts/demo-data.mjs`.
   - `CvFile` / `CV_COLUMNS` mirror the table by hand, and `demo-data.mjs` re-implements the path and hash.
   - Coupling to `types.ts`, `changes.ts` and `demo-data.mjs` is invisible in co-change history.
6. **Detach is a server-only feature with no test and no UI** (route `:11`, SQL `:77`) [E].
   - It writes a `field_changes` trace (name → null), so it is part of the "every change leaves a trace" guarantee, unverified for this case.
   - PRD has no rule for it (`context/domain/domain-distillation.md`, code-only rules).
7. **Preview type dispatch is binary** (`CvPreview.tsx:70`) [E].
   - Every non-PDF goes to the DOCX renderer.
   - The type check uses MIME type or extension only, with no magic bytes (`domain/cv.ts:25`). A renamed file is stored and fails only at render, showing the in-component Alert [E].
8. **Download bypasses the client error channel** (`<a href>`; `CvPanel.tsx:135`, `CvLibrary.tsx:51`) [E]. A 401/404/500/503 opens raw JSON in a new page and sends no report.
9. **Browser-only code has zero automated coverage** [E].
   - Covers `CvPanel`, `CvLibrary`, `CvPreview`, `cv-render` and `ErrorBoundary`/`PreviewFallback`.
   - DOCX rendering is never exercised.
   - The PRD stresses phone use during a call, and the preview is how a CV is read on a phone [I].
10. **`applications.cv_file_id` foreign key does not check the file's owner** (`20261001090000_cv_files.sql:38-39`) [E].
    - Only `set_application_cv` refuses a foreign file, through RLS.
    - A direct table UPDATE by the owner could point at another user's `cv_files.id`. Reading it is still blocked by RLS, so this is integrity, not a leak.
    - Domain distillation **D-06**.
11. **Cache and timing details** [E]:
    - `Cache-Control: private, max-age=300` lets the browser serve a CV for up to 5 minutes after sign-out on the same device;
    - the 413 check runs only after the middleware's `auth.getUser()`;
    - a body without `Content-Length` is fully parsed and hashed before the size check (comment at `api/cv/index.ts:22`; CPU-limit risk from the S-02 change).

## Structural claims verified with ast-grep

Tool: `npx -p @ast-grep/cli@0.45.3 ast-grep run -l <ts|tsx|js> -p '<pattern>'` at commit `161568d`. ast-grep does not parse `.astro`, `.sql` or `.md`, so claims about those files were checked with `rg`/`grep`. Every ast-grep zero was re-run with `rg` to tell a real absence from a wrong pattern.

| #   | Claim in this report                                                                 | Pattern (lang)                                              | Result                                                                                                                                                                                                                                                                | Verdict                                                                                                                  |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | `GET /api/cv/[id]` (and the other API routes) have no `isUuid` guard; pages do       | `isUuid($$$)` (ts) in `src/pages/api`                       | 0 matches; `rg isUuid src/pages` → only `src/pages/applications/[id]/index.astro:30` and `edit.astro:18`                                                                                                                                                              | **confirmed** (zero confirmed by grep; `.astro` side by grep)                                                            |
| 2   | `set_application_cv` is called by name in one place                                  | `$C.rpc("set_application_cv", $$$)` (ts)                    | `src/lib/services/cv.ts:80` (1); all `.rpc` calls in `src`: 5 (`cv.ts:80`, `notes.ts:21,54`, `applications.ts:124,186`)                                                                                                                                               | **confirmed**                                                                                                            |
| 3   | `services/cv.ts` has 4 `.from("cv_files")` calls; `demo-data` touches `cv_files` too | `$C.from("cv_files")` (ts / js)                             | `src/lib/services/cv.ts:34,55,65,97` (4); `scripts/demo-data.mjs:198,213` (2)                                                                                                                                                                                         | **confirmed**                                                                                                            |
| 4   | Bucket name `"cvs"` is a string repeated outside the service                         | `$C.storage.from($B)` (ts / js)                             | `services/cv.ts:25,105` use the `BUCKET` constant; `scripts/demo-data.mjs:192,195,209` use the literal `"cvs"`                                                                                                                                                        | **refined**: in `src/` the name lives in one constant (`services/cv.ts:6`); the only repeat is `demo-data.mjs` (3 calls) |
| 5   | `checkCvFile` runs in the browser and on the server                                  | `checkCvFile($$$)` (ts, tsx)                                | production calls: `services/cv.ts:15`, `CvPanel.tsx:71`, `CvLibrary.tsx:123` (3); 9 more in `cv.test.ts`                                                                                                                                                              | **confirmed** — one shared function, three call sites (the duplication in debt #1 is of the _limits_, not of the check)  |
| 6   | Every non-PDF type goes to the DOCX renderer                                         | `$M === "application/pdf"` (tsx)                            | single branch `CvPreview.tsx:70`                                                                                                                                                                                                                                      | **confirmed**                                                                                                            |
| 7   | Duplicate detection: one `23505` check, one error-text regex                         | `$E.code === "23505"`, `/exists\|duplicate/i.test($X)` (ts) | `services/cv.ts:47` (1); `services/cv.ts:30` (1)                                                                                                                                                                                                                      | **confirmed**                                                                                                            |
| 8   | No UI sends detach (`cv_file_id = ""`)                                               | `$B.set("cv_file_id", $V)`, `attach($$$)` (tsx)             | one sender `CvPanel.tsx:26` with a `string` parameter; callers `CvPanel.tsx:63` (select value from `others`, which excludes the current CV, `:102`) and `:90` (`data.file.id`)                                                                                        | **confirmed** (no caller passes `""`)                                                                                    |
| 9   | Both islands type the upload reply inline; no shared response type                   | `apiRequest($$$)`, `apiRequest<$T>($$$)` (tsx)              | ast-grep: 2 matches (`CvPanel.tsx:27`, `CvPreview.tsx:49`); **the generic calls were missed** (0 for the typed pattern). `rg apiRequest` shows `CvPanel.tsx:82` and `CvLibrary.tsx:131`, both `apiRequest<{ file?: CvFile; reused?: boolean } \| null>("/api/cv", …)` | **confirmed by grep**; ast-grep pattern limitation with explicit type arguments in `.tsx` noted                          |
| 10  | All three CV routes answer failures through `failureResponse`                        | `failureResponse($$$)` (ts)                                 | `api/cv/index.ts:45`, `api/cv/[id].ts:32`, `api/applications/[id]/cv.ts:35` (3)                                                                                                                                                                                       | **confirmed** (line numbers corrected: report said `:43` / `:33` area)                                                   |
| 11  | Preview loads `CvPreview` and `cv-render` lazily                                     | `import($P)` (tsx)                                          | `CvPanel.tsx:16`, `CvLibrary.tsx:14` → `./CvPreview`; `CvPreview.tsx:62` → `./cv-render`; `CvPreview.tsx:60` is `typeof import("./cv-render")` (a type, not a load)                                                                                                   | **refined**: one runtime dynamic import of `cv-render`, plus one type query                                              |
| 12  | After upload the islands reload the page                                             | `window.location.reload()` (tsx)                            | CV: `CvLibrary.tsx:143`, `CvPanel.tsx:53`; also `StatusControl.tsx:40`, `NotesPanel.tsx:194,208,292`                                                                                                                                                                  | **confirmed**; the reload-after-write pattern is shared by all four islands                                              |
| 13  | No unit test imports `services/cv.ts`, the routes or the islands                     | `import $$$ from "@/lib/services/cv"` (ts)                  | only the three routes import it; no `*.test.ts`                                                                                                                                                                                                                       | **confirmed**; `domain/cv` is imported by `cv.test.ts`, `services/cv.ts`, `api/cv/index.ts`                              |
| 14  | The storage path convention is re-implemented outside `cvStoragePath`                | `cvStoragePath($$$)` (ts); `rg` in `scripts/`               | one production call `services/cv.ts:24`; `scripts/demo-data.mjs:208` builds `` `${userId}/${sha256}.pdf` `` itself                                                                                                                                                    | **confirmed**                                                                                                            |
| 15  | `accept=` is copied in the two islands                                               | `rg 'accept='` (ast-grep JSX-attribute pattern not used)    | `CvPanel.tsx:197`, `CvLibrary.tsx:164`, identical strings                                                                                                                                                                                                             | **confirmed** (grep only)                                                                                                |
| 16  | Download links bypass `apiRequest`                                                   | `rg 'download=1'`                                           | `CvPanel.tsx:135`, `CvLibrary.tsx:51` (plain `href`)                                                                                                                                                                                                                  | **confirmed** (grep only)                                                                                                |
| 17  | Playwright has no CV-flow test                                                       | `rg -il cv tests/e2e`                                       | only `tests/e2e/seed.spec.ts` (visits `/cv`)                                                                                                                                                                                                                          | **confirmed** (grep only)                                                                                                |

Not re-checked here (not code structure): co-change counts (git history), smoke step and pgTAP assertion counts (string-labelled steps), audit references.

**Corrections applied to the report above:**

- Debt #1 is about the duplicated **limits** (`MAX_CV_BYTES` vs bucket vs `accept=`), not about the check itself: `checkCvFile` is one shared function (claim 5).
- The bucket name is a single constant in `src/`; only `demo-data.mjs` repeats `"cvs"` (claim 4).
- Line anchors for `failureResponse` in the CV routes: `api/cv/index.ts:45`, `api/cv/[id].ts:32`, `api/applications/[id]/cv.ts:35`.

## Code References

- `src/lib/domain/cv.ts:3-54` — limits, `isUploadRequestTooLarge`, `CV_TYPES`, `checkCvFile`, `sha256Hex`, `cvStoragePath`, `groupByCv`
- `src/lib/services/cv.ts:14-106` — `uploadCv` (dedupe, Storage, self-heal, 23505), `findBySha`, `listCvFiles`, `setApplicationCv`, `readCv`
- `src/pages/api/cv/index.ts:14-43` — upload route (401, early 413, breadcrumb, parse, 201/200/400)
- `src/pages/api/cv/[id].ts:9-34` — serve route (inline/attachment, headers, 404, `failureResponse`)
- `src/pages/api/applications/[id]/cv.ts:11-33` — attach/detach route
- `supabase/migrations/20261001090000_cv_files.sql:4-95` — bucket limits, `cv_files`, RLS on table and bucket, `cv_file_id`, `set_application_cv`
- `src/components/applications/CvPanel.tsx:16-197` — panel: upload + attach, select, preview toggle, download link
- `src/components/applications/CvLibrary.tsx:14-164` — library island
- `src/components/applications/CvPreview.tsx:22-92`, `cv-render.ts:10-31` — preview fetch and renderers
- `src/components/ErrorBoundary.tsx:24` — boundary + `PreviewFallback`
- `src/pages/cv.astro:16-42`, `src/pages/applications/[id]/index.astro:31-63,159-164` — SSR loaders
- `scripts/smoke.mjs:177-599` — CV smoke steps; `supabase/tests/history_traces.test.sql:198-301` — attach traces

## Architecture Insights

- The CV capability follows the repo's layering: pure rules in `domain/cv.ts`, Supabase access in `services/cv.ts`, thin routes, islands for interactivity. The one exception is the details page, which pulls `services/cv.ts` directly for its read model.
- Integrity rests on the database (RLS, unique key, bucket limits, atomic SQL function). The app repeats the checks earlier so the user gets a Polish message before the backstop fires.
- Content addressing (SHA-256 path) makes upload idempotent and is what lets the self-heal and dedupe work. It also makes the storage path a cross-layer contract (RLS, demo data).
- The flow's error handling is fully on the F-01 channel (`apiRequest`, `failureResponse`, `ErrorBoundary`). The download link is the only CV path outside it.

## Historical Context (from prior changes)

- `context/archive/2026-10-04-cv-upload-5mb-in-production/` — S-02: early size checks (browser + 413), measured 5 MiB uploads at 16–25 ms CPU on Workers Free, decision to stay on Free and revisit at the first exceeded-CPU event.
- `context/audits/observability/2026-10-06_call-time-read-agreement-writes-cv-upload.md:131-140` — CV findings C1–C10. C1–C4, C7 and C9 were addressed by F-01 (production-error-visibility). C10 (non-UUID id logged as error) was explicitly out of scope. C5/C6 describe items 3–4 above.
- `context/archive/2026-10-06-production-error-visibility/` — `apiRequest`, `ErrorBoundary` around `CvPreview`, `readFormData`, `failureResponse`, `logInfo` breadcrumb on upload.
- `context/domain/domain-distillation.md` — R-11…R-13 (CV invariants: enforced), D-06 (foreign key without owner check), code-only rule "CV can be detached via API but not from the UI".

## Related Research

- `context/map/repo-map.md` — CV as risk zone #1 (change, fix pressure, attention).
- `context/archive/2026-10-04-cv-upload-5mb-in-production/research.md`
- `context/archive/2026-10-06-production-error-visibility/research.md`

## Open Questions

- [U] Does the cloud bucket `cvs` have the same `file_size_limit` and `allowed_mime_types` as the migration? The insert is `on conflict do nothing`. Check in the Supabase dashboard.
- [U] The exact Storage error text for a duplicate object in the current supabase-js / storage-api versions. Does it match `/exists|duplicate/i`?
- [I → verify] Does a malformed id on `GET /api/cv/[id]` produce a 500 plus an error-level log? A one-request local check would settle it.
- [U] Is detach a product feature (to be offered in the UI and tested) or an API leftover? The PRD has no rule.
- Structural claims in this report (counts of call sites, "only here", "never co-changed") are to be re-checked with ast-grep in the follow-up step (`.claude/prompts/m4l3-2-ast-grep-verification.md`).
