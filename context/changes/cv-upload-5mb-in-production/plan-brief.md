# Verify and Fix 5 MB CV Upload in Production — Plan Brief

> Full plan: `context/changes/cv-upload-5mb-in-production/plan.md`
> Research: `context/changes/cv-upload-5mb-in-production/research.md`

## What & Why

A CV of up to 5 MB must upload in production. The Worker parses, copies, hashes and re-sends the whole file, and the Cloudflare Workers Free plan allows 10 ms CPU per request — whether a 5 MB upload fits has never been measured. Roadmap S-02, milestone M-1 "Ready for real use".

## Starting Point

The server parses the whole multipart body before checking the 5 MB limit, and the browser checks nothing. Production already exceeds 10 ms CPU on `/dashboard` (up to 201 ms) without termination, but no real CV upload has run there, and the Workers plan (Free vs Paid) is unconfirmed.

## Desired End State

Oversized files are refused immediately in the browser and before parsing on the server. A real ~5 MB upload has been measured in production. **Outcome (2026-10-05):** the decision rule fired (16–25 ms CPU on Workers Free), and the owner overrode it to stay on Free, accepting the risk until the first `exceededCpu`.

## Key Decisions Made

| Decision         | Choice                                                                                 | Why (1 sentence)                                                                                  | Source          |
| ---------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------- |
| Workers plan     | Assumed Free; owner confirms in the dashboard in Phase 2                               | Not readable with the current API token.                                                          | Research + Plan |
| Decision rule    | Free **and** (error 1102 / `exceededCpu` **or** CPU > 10 ms on the 5 MB upload) → Paid | Fixed in advance so the measurement selects the outcome mechanically.                             | Plan            |
| Fix if needed    | Workers Paid ($5/month)                                                                | Also covers `/dashboard` (111–201 ms CPU), no code risk, keeps server-side SHA-256 deduplication. | Plan            |
| Outcome          | Stay on Workers Free (owner override of the fired rule)                                | Measured 16–25 ms CPU, all uploads ok; owner accepts the risk until the first `exceededCpu`.      | Implementation  |
| Early size check | Browser (`checkCvFile`) and server (`Content-Length` > 5 MB + 64 KiB → 413)            | Immediate Polish feedback and no CPU spent on oversized requests.                                 | Plan            |
| Sequencing       | S-02 now, before F-01                                                                  | Measurement uses Cloudflare Observability directly; alerting stays F-01's job.                    | Plan            |
| Browser upload   | Not done                                                                               | Would drop the server-side check that the stored name equals the content hash.                    | Research + Plan |

## Scope

**In scope:** pure Content-Length rule + tests; 413 guard in `POST /api/cv`; browser check in `CvLibrary` and `CvPanel`; smoke step for 413; production measurement; research follow-up; Workers Paid upgrade if the rule fires; infrastructure.md update.

**Out of scope:** browser-side hashing / direct uploads; CPU optimisation; error alerting (F-01); changes to the 5 MB limit, file types or deduplication.

## Architecture / Approach

Browser `checkCvFile` → (refuse) or `POST /api/cv` → `isUploadRequestTooLarge(Content-Length)` → 413 or existing parse/hash/upload path. Phase 2 reads CPU/outcome of a real upload from Workers Observability and applies the decision rule; Phase 3 is an owner billing action plus a verification upload.

## Phases at a Glance

| Phase                           | What it delivers                                 | Key risk                                                           |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| 1. Reject oversized files early | Browser + server size checks, smoke step         | Content-Length margin too tight for multipart overhead             |
| 2. Measure and decide           | Real 5 MB upload measured; decision recorded     | Free-plan "flexibility" may let one upload pass but not later ones |
| 3. Workers Paid (conditional)   | Plan upgrade + verified upload, or recorded skip | Billing change — owner action only                                 |

**Prerequisites:** owner access to the Cloudflare dashboard; a ~5 MB PDF; `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` in `.env` (read-only use).
**Estimated effort:** ~1 session for Phase 1; Phases 2–3 are a few minutes of owner actions plus one query.

## Open Risks & Assumptions

- Free-plan tolerance for occasional overruns is undocumented; a single passing upload does not prove later ones pass — the rule therefore uses CPU > 10 ms, not just success.
- Assumes the Observability API keeps per-invocation CPU for the test upload (it did for 177 events in the research window).

## Success Criteria (Summary)

- A > 5 MB file gets an immediate Polish message instead of a slow failure.
- A real ~5 MB CV uploads successfully in production, with the measurement on record.
- The Workers plan decision is documented in infrastructure.md (owner stayed on Free despite the rule, with a clear trigger to revisit).
