# Verify and Fix 5 MB CV Upload in Production — Implementation Plan

## Overview

A CV of up to 5 MB must upload in production without an error. The Worker currently parses, copies, hashes and re-sends the whole file, and the Cloudflare Workers Free plan allows 10 ms CPU per request; whether a 5 MB upload fits has never been measured. This plan (1) rejects oversized files before any work is spent on them, (2) measures a real 5 MB upload in production and applies a pre-agreed decision rule, and (3) upgrades to Workers Paid only if that rule says so.

Roadmap: S-02 `cv-upload-5mb-in-production` (milestone M-1). Risk register: "CV upload exceeds the free-plan CPU limit" in `context/foundation/infrastructure.md`. Research: `context/changes/cv-upload-5mb-in-production/research.md` (status partial — the two open facts are resolved in Phase 2).

## Current State Analysis

- `POST /api/cv` parses the full multipart body with `request.formData()` before any size check (`src/pages/api/cv/index.ts:13`); the 5 MB check runs afterwards in `checkCvFile` (`src/lib/domain/cv.ts:16`, called at `src/lib/services/cv.ts:14`).
- Per-byte work on the Worker: multipart parse, `file.arrayBuffer()` (`src/lib/services/cv.ts:17`), SHA-256 (`src/lib/domain/cv.ts:27`), storage upload body (`src/lib/services/cv.ts:24-26`).
- The browser sends the raw file without any size/type check: `src/components/applications/CvLibrary.tsx:115`, `src/components/applications/CvPanel.tsx:60` (only `accept=` on the input).
- Production telemetry (2026-09-27 → 2026-10-04): 175 requests, all `success`; CPU P50 11.4 ms, max 201.3 ms (`GET /dashboard`); no real CV upload recorded. Free vs Paid could not be read via API.
- Local preview and CI have no CPU limit, so no automated test can detect a CPU-limit failure; only production telemetry can.

## Desired End State

- A file larger than 5 MB is refused in the browser before upload with the existing Polish message, and the server refuses an oversized request with 413 before parsing the body.
- A real ~5 MB PDF has been uploaded in production; its CPU time and outcome are recorded in `research.md`, together with the confirmed Workers plan.
- If the decision rule fired, the account is on Workers Paid and a repeated 5 MB upload ends `ok`; otherwise Phase 3 is recorded as skipped with the measurement that justified it.

**Decision rule (agreed):** if the account is on Workers **Free** and the production 5 MB upload ends with error 1102 / outcome `exceededCpu`, **or** uses **more than 10 ms CPU**, switch to **Workers Paid**. In every other case, no plan change.

### Key Discoveries:

- `checkCvFile` (`src/lib/domain/cv.ts:14-24`) is a pure function of `{ name, type, size }` — usable unchanged in the browser on a `File`.
- Components already show server errors through `setError` (`CvLibrary.tsx:105-126`, `CvPanel.tsx:25-40`), so a client-side check can reuse the same error state.
- Smoke test already uploads CVs via `upload(path, fileName, type, content)` (`scripts/smoke.mjs:101`, steps at `:286-300`).
- CPU per request is queryable read-only via Cloudflare Workers Observability (`POST /accounts/<id>/workers/observability/telemetry/query`), using `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` from `.env` (research, "Production measurements").

## What We're NOT Doing

- Browser-side hashing or direct-to-Supabase uploads — rejected in favour of Workers Paid if a fix is needed (keeps server-side SHA-256 deduplication).
- Code-level CPU optimisation (streaming hash, fewer copies) — not a guarantee; not needed if Paid.
- Production error alerting — roadmap F-01 `production-error-visibility`. S-02 proceeds before F-01 by the owner's decision; the measurement uses Observability directly.
- Changing the 5 MB limit, accepted file types, or deduplication behaviour.

## Implementation Approach

Ship the cheap, always-useful guard first; then measure the real thing in production with the decision rule fixed in advance, so the outcome of Phase 2 selects Phase 3 mechanically rather than reopening the design.

## Critical Implementation Details

- **Content-Length margin.** A multipart request is larger than the file it carries (boundary, headers, other fields). The server guard compares `Content-Length` with `MAX_CV_BYTES + 64 KiB`; a missing or non-numeric header is allowed through to the existing post-parse check, so chunked requests are not broken.
- **Phase 3 is a billing action.** Upgrading the Cloudflare plan is done by the owner in the dashboard; no agent performs it.

## Phase 1: Reject oversized files early

### Overview

Refuse files over 5 MB in the browser before sending and on the server before parsing the body.

### Changes Required:

#### 1. Upload-size rule

**File**: `src/lib/domain/cv.ts` (+ `src/lib/domain/cv.test.ts`)

**Intent**: A pure rule deciding whether a request's declared size is too large for a CV upload, so the route can refuse it before parsing.

**Contract**: `MAX_CV_REQUEST_BYTES = MAX_CV_BYTES + 64 * 1024`; `isUploadRequestTooLarge(contentLength: string | null): boolean` — true only when the header is a valid non-negative integer greater than `MAX_CV_REQUEST_BYTES`; `null`, empty or non-numeric → false. Tests: exactly `MAX_CV_REQUEST_BYTES` → false; `+1` → true; `null` / `"abc"` → false.

#### 2. Server guard

**File**: `src/pages/api/cv/index.ts`

**Intent**: After the auth check and before `request.formData()`, refuse an oversized request.

**Contract**: 413 `{ error: "Plik jest za duży (maksymalnie 5 MB)." }` (same text as `checkCvFile`'s size message) when `isUploadRequestTooLarge(request.headers.get("content-length"))`. Other responses unchanged.

#### 3. Browser check

**Files**: `src/components/applications/CvLibrary.tsx`, `src/components/applications/CvPanel.tsx`

**Intent**: Before `fetch("/api/cv", …)`, run `checkCvFile(file)`; on failure show its message through the existing error state and do not send.

**Contract**: No request is made for a file that fails `checkCvFile`; the message shown is `checkCvFile`'s `message`.

#### 4. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Cover the new server refusal (CLAUDE.md: extend the smoke test with each user-facing feature).

**Contract**: Signed-in upload of a PDF of `5 MB + 100 KB` to `/api/cv` → 413 and body includes "za duży".

#### 5. Docs

**File**: `CLAUDE.md`

**Intent**: Mention the early size check in the CV files bullet and the smoke description.

**Contract**: Edit existing lines.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the Content-Length boundary: `npm test`
- Lint and type check pass: `npm run lint && npx astro check`
- Smoke test passes, including the 413 step: `npm run build && npm run smoke`

#### Manual Verification:

- On production, choosing a file over 5 MB in the CV library shows "Plik jest za duży (maksymalnie 5 MB)." without uploading

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Measure a real 5 MB upload and decide

### Overview

Resolve the two open facts from research and apply the decision rule.

### Changes Required:

#### 1. Production measurement

**File**: none (owner action + read-only Cloudflare API query)

**Intent**: The owner confirms the Workers plan in the Cloudflare dashboard (Workers & Pages → Plans) and uploads a ~5 MB PDF (between 4.5 and 5 MB) from the production CV library page. The agent then queries Workers Observability for that `POST /api/cv` invocation: CPU ms, wall ms, outcome, content-length.

**Contract**: Read-only API calls; the token and account id are never printed.

#### 2. Record the result and decision

**File**: `context/changes/cv-upload-5mb-in-production/research.md`

**Intent**: Append a follow-up section with the plan, the measured numbers, the upload outcome and the decision-rule result; update `status` to `complete` and the `last_updated*` fields.

**Contract**: Follow-up appended per the research document conventions; earlier findings preserved.

### Success Criteria:

#### Automated Verification:

- The Observability query returns the production `POST /api/cv` invocation with content-length ≥ 4.5 MB and its CPU time and outcome

#### Manual Verification:

- Owner confirms the Workers plan shown in the Cloudflare dashboard
- Owner confirms the ~5 MB upload result in the UI (success, or the error shown)
- `research.md` records plan, CPU ms, outcome and the decision ("Paid" or "no change")

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Switch to Workers Paid (only if the decision rule fired)

### Overview

If Phase 2's rule fired, move the account to Workers Paid and verify; otherwise mark this phase skipped with the Phase 2 evidence.

### Changes Required:

#### 1. Plan upgrade

**File**: none (owner action in the Cloudflare dashboard)

**Intent**: Owner subscribes to Workers Paid ($5/month); default CPU limit becomes 30 s. No `limits.cpu_ms` override.

**Contract**: Billing change by the owner only.

#### 2. Infrastructure record

**File**: `context/foundation/infrastructure.md`

**Intent**: Update the plan facts (Free → Paid), the CV-upload CPU risk row (mitigated by Paid, with the measured CPU), and the getting-started/operational notes that mention the 10 ms limit.

**Contract**: Edit existing lines.

### Success Criteria:

#### Automated Verification:

- A repeated production ~5 MB upload shows outcome `ok` in the Observability query (or: phase recorded as skipped with the Phase 2 numbers)

#### Manual Verification:

- Owner confirms the Cloudflare dashboard shows Workers Paid (or: skip confirmed by owner)

**Implementation Note**: After completing this phase, pause for manual confirmation from the human.

---

## Testing Strategy

### Unit Tests:

- `isUploadRequestTooLarge`: boundary at `MAX_CV_REQUEST_BYTES` (false) and `+1` (true); `null`, empty and non-numeric headers (false).

### Integration Tests:

- Smoke: oversized upload → 413 "za duży"; existing CV steps (upload, dedup, attach, preview, download) unchanged.

### Manual Testing Steps:

1. Production: pick a > 5 MB file → immediate Polish message, no network upload.
2. Production: upload a ~5 MB PDF → success (or the observed error), measured via Observability.
3. If Paid: repeat the upload and confirm `ok`.

## Performance Considerations

The server guard is O(1) and removes all per-byte work for oversized requests; it does not change the cost of a valid 5 MB upload, which is what Phase 2 measures. Workers Paid includes 30 million CPU-ms per month — far above this app's usage (175 requests in 7 days).

## Migration Notes

No database changes. Phase 3 is a billing change and is reversible by downgrading the plan.

## References

- Research: `context/changes/cv-upload-5mb-in-production/research.md`
- Roadmap item: `context/foundation/roadmap.md` — S-02
- Risk register: `context/foundation/infrastructure.md` — "CV upload exceeds the free-plan CPU limit"
- Upload route: `src/pages/api/cv/index.ts:13`; service: `src/lib/services/cv.ts:14-26`; rule: `src/lib/domain/cv.ts:14-24`
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reject oversized files early

#### Automated

- [x] 1.1 Unit tests pass, including the Content-Length boundary: `npm test` — 3d142a1
- [x] 1.2 Lint and type check pass: `npm run lint && npx astro check` — 3d142a1
- [x] 1.3 Smoke test passes, including the 413 step: `npm run build && npm run smoke` — 3d142a1

#### Manual

- [x] 1.4 On production, choosing a file over 5 MB in the CV library shows "Plik jest za duży (maksymalnie 5 MB)." without uploading — 3d142a1

### Phase 2: Measure a real 5 MB upload and decide

#### Automated

- [x] 2.1 The Observability query returns the production `POST /api/cv` invocation with content-length ≥ 4.5 MB and its CPU time and outcome

#### Manual

- [x] 2.2 Owner confirms the Workers plan shown in the Cloudflare dashboard
- [x] 2.3 Owner confirms the ~5 MB upload result in the UI (success, or the error shown)
- [x] 2.4 `research.md` records plan, CPU ms, outcome and the decision ("Paid" or "no change")

### Phase 3: Switch to Workers Paid (only if the decision rule fired)

#### Automated

- [x] 3.1 A repeated production ~5 MB upload shows outcome `ok` in the Observability query (or: phase recorded as skipped with the Phase 2 numbers)

#### Manual

- [x] 3.2 Owner confirms the Cloudflare dashboard shows Workers Paid (or: skip confirmed by owner)
