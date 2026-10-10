# CV and API-route refactors (K2, K5, K1) — Plan Brief

> Full plan: `context/changes/refactor-opportunities/plan.md`
> Research: `context/changes/refactor-opportunities/research.md`

## What & Why

This plan implements the three top-ranked refactors from the M4L4 research, in ranking order.

1. **K2.** A malformed id on an API route, e.g. a typo or truncated link to `/api/cv/…`, is today inferred to become a logged 500. Since F-01 that means a false Telegram alert. A shared id guard makes it a quiet 404.
2. **K5.** CV reply shapes and URLs are hand-kept strings on both sides of the HTTP boundary, so drift is invisible to the compiler.
3. **K1.** The CV limits are copied by hand into two islands, and the bucket's copy of them is untested.

## Starting Point

- **Route ids.** Seven `[id]` handlers check only `!id`, and five of them read the form body first. Pages already use `isUuid`.
- **Reply types.** `POST /api/cv` is typed inline in `CvPanel` and `CvLibrary`, and `/api/cv/${…}` appears in 7 places. `CV_COLUMNS` mirrors `CvFile` by hand.
- **Limits.** `accept=` and "PDF lub DOCX, do 5 MB" are literals in both islands. The bucket limits live only in an applied migration.

## Desired End State

- **Route ids.** A non-uuid id on any `[id]` API route answers 404 "Nie znaleziono." with no body parsing, no query and no log. Smoke proves it.
- **Reply types.** CV replies have named types in `src/types.ts`, URLs come from one helper, and the select list is derived from `CvFile`. Drift fails `astro check`.
- **Limits.** Both islands take their limits from `src/lib/domain/cv.ts`, and a pgTAP test fails if the bucket drifts.
- **Valid requests** behave exactly as before.

## Key Decisions Made

| Decision               | Choice                                                                    | Why (1 sentence)                                                                                   | Source          |
| ---------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------- |
| Scope                  | K2 + K5 + K1, three phases in ranking order                               | All are size S, need no migration and deploy alone.                                                | Research + Plan |
| Malformed id answer    | 404 `{error: "Nie znaleziono."}`                                          | It matches pages (malformed → 404) and unknown ids, and the client already handles it.             | Plan            |
| Logging a malformed id | None                                                                      | Removing noise from Issues/Telegram is the point of K2; pages don't log 404 either.                | Plan            |
| Guard placement        | After the 401 check, before `readFormData`                                | Unauthenticated callers learn nothing, and a bad id never pays for body parsing.                   | Research        |
| Guard shape            | `routeId(context)` in `src/lib/http.ts`, returning the id or a `Response` | It follows the house pattern of `readFormData` / `failureResponse` and reuses the tested `isUuid`. | Research        |
| DTO home               | `src/types.ts` (`UploadCvResponse`, `AttachCvResponse`)                   | CLAUDE.md names it the place for DTOs.                                                             | Research        |
| Bucket pin             | pgTAP on the local stack                                                  | SQL cannot import TypeScript; a test makes the copy fail loudly.                                   | Research        |

## Scope

**In scope:**

- **K2:** the route-id helper, 7 handlers and 2 smoke steps.
- **K5:**
  - two DTOs used by routes and islands;
  - `cvFileUrl` / `applicationCvUrl` with tests;
  - `CV_COLUMNS` derived from `CvFile`.
- **K1:**
  - `CV_ACCEPT` / `CV_LIMITS_TEXT` with tests, used by both islands;
  - `supabase/tests/cv_bucket.test.sql`;
  - a CLAUDE.md note.

**Out of scope:**

- K3, K4, K6, K7 and K8.
- Logging malformed ids.
- Changing limits, any migration, `CvFile.mime_type`, generated Supabase types, `demo-data`, and DTOs for non-CV routes.

## Architecture / Approach

Each fix finishes a seam that already exists:

- **K2:** the id rule (`isUuid`) moves from pages into the route helpers in `src/lib/http.ts`.
- **K5:** the HTTP contract gets a type on both sides of the boundary.
- **K1:** the limits stay in the domain module, and the one copy the compiler cannot see (the bucket) is pinned by a database test.

## Phases at a Glance

| Phase                                 | What it delivers                                    | Key risk                                                                                  |
| ------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1. Route id guard (K2)                | 404 for malformed ids on 7 handlers, 2 smoke steps  | Changing a status code for a valid request by mistake; smoke covers the CV and note paths |
| 2. CV HTTP types and URL helpers (K5) | Named reply types, URL helpers, derived select list | A URL changing shape; smoke checks `href`s and downloads                                  |
| 3. CV limits from one source (K1)     | Derived `accept` and label, pgTAP bucket pin        | The pin covers the local bucket only, not the cloud one                                   |

**Prerequisites:** a local Supabase stack (`npx supabase start`) for smoke, E2E and pgTAP. No `db push` (no migration).
**Estimated effort:** about one session across 3 phases.

## Open Risks & Assumptions

- K2's "malformed id → 500" is inferred from the error chain and has never been run. Phase 1's smoke step settles it. If today's answer is already 4xx, the guard still removes the query and the body parsing.
- The cloud `cvs` bucket may differ from the migration (`on conflict do nothing`). The pgTAP pin cannot see the cloud; that stays an open item.

## Success Criteria (Summary)

- A wrong or truncated API link no longer raises a Telegram alert.
- Changing a CV reply shape, a CV route path or a `CvFile` field without updating its users fails the build.
- A drift between the app's CV limits and the local bucket fails CI.
