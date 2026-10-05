---
date: 2026-10-04T15:27:58Z
researcher: Claude (Opus 5.5) for Mariusz Michalak
git_commit: 9c997e9
branch: main
repository: applications-tracker
topic: "Does a 5 MB CV upload fit the Cloudflare Workers Free-plan CPU limit in production, and what are the options if not?"
tags: [research, cv-upload, cloudflare-workers, cpu-limit, supabase-storage]
status: complete
last_updated: 2026-10-05
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Follow-up: production measurement of 5 MiB uploads and the owner's plan decision"
---

# Research: 5 MB CV upload vs the Workers Free-plan CPU limit

**Date**: 2026-10-04T15:27:58Z
**Researcher**: Claude (Opus 5.5) for Mariusz Michalak
**Git Commit**: 9c997e9
**Branch**: main
**Repository**: applications-tracker

## Research Question

Roadmap S-02 (`cv-upload-5mb-in-production`): does uploading a CV of up to 5 MB work in production on the Cloudflare Workers Free plan (10 ms CPU per request), or does it fail with "exceeded resource limits"? If it may fail, which options exist, and what must be decided before planning a fix?

## Summary

- **Not yet answerable by measurement.** No CV with a file body has been uploaded to production in the retained window (2026-09-27 → 2026-10-04): the 10 `POST /api/cv` invocations recorded on 2026-09-29 all had `content-length: 0` and returned 401/404 (Workers Observability query, 177 events). The CPU cost of a real 5 MB upload is therefore unknown. **Status: partial.**
- **The documented limit is 10 ms CPU per HTTP request on Free**, with unquantified "built-in flexibility" for infrequent overruns; consistent overruns are terminated with error 1102 ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/), updated 2026-09-05).
- **Production already exceeds 10 ms without termination**: over 175 requests in the last 7 days, CPU P50 = 11.4 ms, P99 = 193.9 ms, max = 201.3 ms, and all 175 ended `success` (GraphQL `workersInvocationsAdaptive`). The 14 heaviest invocations were all `GET /dashboard` (111–201 ms). Either the account is on Workers Paid or the Free-plan flexibility currently tolerates these overruns — the plan could not be read (the API token lacks billing scope).
- **The upload path does four O(n) passes over the file on the Worker** (multipart parse, `arrayBuffer` copy, SHA-256, upload body) and parses the whole body before any size check (`src/pages/api/cv/index.ts:13`, `src/lib/services/cv.ts:14-26`). Cloudflare documents that Workers which "parse large payloads typically use 10-20 ms"; hashing cost for 5 MB in workerd is not documented.
- **Options if it fails**: (A) Workers Paid ($5/month, 30 s default CPU, configurable to 5 min); (B) move hashing and upload to the browser (Web Crypto + direct upload under the existing `cvs_insert_own` storage policy), giving up server-side verification that the stored name equals the content hash; (C) reduce Worker CPU (stream-hash with `crypto.DigestStream`, avoid extra copies) — reduces but does not bound the cost.

## Detailed Findings

### Upload path in the code (inspected: the two upload callers and their server path)

- Both UI entry points send the raw `File` as `FormData` to `POST /api/cv`: `src/components/applications/CvLibrary.tsx:115`, `src/components/applications/CvPanel.tsx:60`. Neither checks size or type client-side beyond the `accept=` attribute (code-path agent report; not re-verified line by line).
- Attaching a library CV to an application (`/api/applications/[id]/cv`) sends only a `cv_file_id`, so it has no per-byte cost (code-path agent report).
- Server: the route buffers and parses the full multipart body with `request.formData()` (`src/pages/api/cv/index.ts:13`) before any size check; the 5 MB check `file.size > MAX_CV_BYTES` happens afterwards inside `uploadCv` → `checkCvFile` (`src/lib/domain/cv.ts:16`, called at `src/lib/services/cv.ts:14`).
- Per-byte work on this path: multipart parse (`index.ts:13`), `file.arrayBuffer()` (`services/cv.ts:17`), `crypto.subtle.digest("SHA-256", …)` (`src/lib/domain/cv.ts:27`, called at `services/cv.ts:18`), and the storage upload body (`services/cv.ts:24-26`). There is no magic-byte check; validation uses MIME type / extension only (`src/lib/domain/cv.ts:14-24`).
- Dedup order on this path: hash → `findBySha` (reuse, no upload, if found) → storage upload with `upsert: false`, tolerating "exists/duplicate" (`services/cv.ts:29`) → insert into `cv_files`; a 23505 race re-selects the winner (`services/cv.ts:43-44`).
- The storage bucket enforces `file_size_limit` 5 MB and a MIME allow-list itself (`supabase/migrations/20261001090000_cv_files.sql:6`, bucket insert).

### Cloudflare Workers limits (documentation, checked 2026-10-04)

- Free: "CPU time per HTTP request | 10 ms"; Paid: "5 min (default: 30 seconds)" ([limits](https://developers.cloudflare.com/workers/platform/limits/)). Pricing page: Paid is $5/month minimum with 30 million CPU-ms included ([pricing](https://developers.cloudflare.com/workers/platform/pricing/), updated 2026-10-02). `limits.cpu_ms` can be set on Paid only.
- Leniency: "Each isolate has some built-in flexibility to allow for cases where your Worker infrequently runs over the configured limit. If your Worker starts hitting the limit consistently, its execution will be terminated." No numbers are given (same page).
- Counted vs not: waiting on network (`fetch`, KV, DB) is not CPU time; executing code and parsing is. The docs do not state explicitly whether `formData()`, `arrayBuffer()` or `crypto.subtle.digest` count; parsing, copying and hashing are CPU work by the documented definition (inference). Waiting for request-body bytes to arrive is network wait (inference).
- Failure signal: error 1102 "Worker exceeded resource limits" to the client; outcome `exceededCpu` in analytics/Logpush; per-invocation CPU and wall time are recorded in Workers Logs ([error 1102](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1102/)).
- Other limits that do not bind here: request body 100 MB on Free; memory 128 MB per isolate.
- `crypto.DigestStream("SHA-256")` hashes a stream without holding it in memory ([Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)); no throughput figure is published.

### Production measurements (Cloudflare API, read-only, window 2026-09-27 → 2026-10-04)

- `workersInvocationsAdaptive` for script `applications-tracker`: 175 requests; status `success` for all 175; no `exceededCpu`, `exceededResources` or `scriptThrewException` in this window.
- `cpuTime`: P50 11.4 ms, P99 193.9 ms, max 201.3 ms. `wallTime`: P50 22 ms, P99 1.07 s, max 1.89 s.
- Workers Observability events (177 in the same window): the 14 highest-CPU events were all `GET /dashboard` at 111–201 ms (27 `/dashboard` requests in total); `POST /api/cv` appeared 10 times on 2026-09-29, each with `content-length: 0`, status 401/404, CPU 1–17 ms; no `POST /api/applications/<id>/cv` events.
- Plan: `workers/account-settings` reports `default_usage_model: "standard"` (used on both Free and Paid); `/subscriptions` returned an authentication error (token lacks billing scope). **Free vs Paid is undetermined.**

### Direct-from-browser alternative (code + Supabase docs)

- Storage policy `cvs_insert_own` allows authenticated INSERT into `cvs` when the first folder equals `auth.uid()` (`supabase/migrations/20261001090000_cv_files.sql:48`); `cv_files_insert_own` requires `user_id = auth.uid()` and a `storage_path` under the user's folder (`…cv_files.sql:34`). There is no UPDATE policy, so `upsert: false` uploads cannot overwrite (code-path agent report).
- The browser already holds the `File` and can compute SHA-256 with Web Crypto. Not verified: whether the `@supabase/ssr` auth cookies are readable by browser JS so a browser Supabase client can reuse the session.
- Trade-off: with a browser upload, nothing server-side checks that the object name equals the content hash; RLS restricts only the folder. Dedup correctness would then depend on client code.
- Supabase: `createSignedUploadUrl` URLs are valid for 2 hours and `uploadToSignedUrl` needs no further auth ([docs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)); standard uploads are recommended up to 6 MB; the Free-plan global file size limit cannot exceed 50 MB ([file limits](https://supabase.com/docs/guides/storage/uploads/file-limits)).

## Code References

- `src/pages/api/cv/index.ts:13` - full multipart body parsed with `formData()` before any size check
- `src/lib/services/cv.ts:14-26` - size/type check, `arrayBuffer()`, SHA-256, dedup lookup, storage upload
- `src/lib/services/cv.ts:43-44` - 23505 race: re-select the winning row
- `src/lib/domain/cv.ts:16` - 5 MB limit check (`MAX_CV_BYTES`)
- `src/lib/domain/cv.ts:27` - `crypto.subtle.digest("SHA-256", bytes)`
- `src/components/applications/CvLibrary.tsx:115`, `src/components/applications/CvPanel.tsx:60` - browser `POST /api/cv` with FormData
- `supabase/migrations/20261001090000_cv_files.sql:6,34,48` - bucket limits, `cv_files_insert_own`, `cvs_insert_own`
- `wrangler.jsonc` - no `limits.cpu_ms` (plan default applies)

## Architecture Insights

- The CPU risk is concentrated in one route (`POST /api/cv`); every other route either waits on I/O or renders pages. Yet `GET /dashboard` is already the heaviest route in production (up to 201 ms CPU), so if the plan is Free, the dashboard is as exposed to the limit as the upload — S-02's fix choice (Paid vs code change) may affect more than uploads.
- Local `astro dev` / `astro preview` (workerd) applies no CPU limit, and CI's smoke test runs against local preview, so no existing test can detect a CPU-limit failure; only production telemetry can.
- The project rule "the app must never read the service-role key" (CLAUDE.md, Hard rules) rules out server-side signed-URL generation with the service key; a browser upload would use the owner's own session under existing RLS.

## Historical Context (from prior changes)

- `context/foundation/infrastructure.md` (2026-09-30) — Devil's advocate item 1 and the risk-register row "CV upload exceeds the free-plan CPU limit (503)" (M/M) predicted this; its mitigation ("upload a 5 MB PDF against production; if it fails, move to Workers Paid or hash in the browser and verify server-side") — **supported** by this research as the right next step; "returns a 503" — **partial**: the documented client-facing error is 1102 "Worker exceeded resource limits".
- `context/changes/app-available-after-idle-week/` (implemented 2026-10-04) — added observability-relevant logging but no CPU instrumentation; not directly related.

## Related Research

- Not applicable — no other `research.md` exists under `context/changes/**` or `context/archive/**`.

## Open Questions

1. **What does a real 5 MB upload cost in production?** Needs one real upload by the signed-in owner (a ~5 MB PDF from the CV library page), then the same Observability query filtered to `POST /api/cv` (CPU ms, wall ms, outcome). Blocks the choice between "no change", Paid, and a code change.
2. **Is the account on Workers Free or Paid?** Visible in the Cloudflare dashboard (Workers & Pages → Plans); not readable with the current API token. If Paid, the 10 ms limit does not apply and S-02 reduces to verification.
3. **If Free and the upload is close to or over the limit, which fix?** Product/cost decision for `/10x-plan`: $5/month Paid (also covers `/dashboard`'s 111–201 ms) vs browser-side hashing/upload (no cost, weaker server-side guarantees) vs CPU reduction (no guarantee).
4. Roadmap prerequisite F-01 (`production-error-visibility`): a CPU-limit failure currently surfaces only in Cloudflare analytics; whether that is enough visibility is part of F-01, not this research.

## Follow-up 2026-10-05: production measurement and decision

Resolves Open Questions 1–3 above.

- **Plan:** Workers **Free** (confirmed by the owner in the Cloudflare dashboard, 2026-10-05).
- **Measurement** (Workers Observability, read-only, `POST /api/cv` events in the 26 h before 2026-10-05 ~09:00 UTC): 6 uploads of a 5 242 880-byte PDF (`content-length` 5 243 075–5 243 081 B):
  - the first (new file stored, status 201): CPU **25 ms**, wall 544 ms, outcome `ok`;
  - 5 repeats (deduplicated, status 200): CPU **16–25 ms**, wall 171–211 ms, outcome `ok`.
  - No `exceededCpu` / error 1102 among these 6 events. These 6 are the only `POST /api/cv` events with a file body in the queried window.
- **Decision rule** (plan): Free **and** (error **or** CPU > 10 ms) → Workers Paid. With 16–25 ms the rule **fired**.
- **Owner decision (overrides the rule):** stay on Workers Free; the risk of future termination is accepted. Trigger to revisit: the first `exceededCpu` outcome (Cloudflare dashboard → Workers → Metrics → Invocation statuses), at which point switch to Workers Paid. Recorded in `context/foundation/infrastructure.md` (risk register).
- Earlier statement "Open Question 1 … blocks the choice" — **superseded**: answered above.
