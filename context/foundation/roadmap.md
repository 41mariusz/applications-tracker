---
project: Applications Tracker
version: 2
status: draft
created: 2026-10-10
updated: 2026-10-10
prd_version: —
main_goal: quality
top_blocker: time
milestone_id: solid-daily-use-on-real-data
milestone_seq: 2
milestone_status: open
---

# Roadmap: Applications Tracker

> Derived from the owner's description of milestone M-2 (scope anchors below), the analyses `context/map/repo-map.md`, `context/domain/domain-distillation.md`, `context/archive/2026-10-06-cv-flow-analysis/research.md`, `context/archive/2026-10-06-refactor-opportunities/research.md` and the observability audit, plus the known codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-2: Solid daily use on real data** — Status: open

- **Intent:** The owner uses the app every day on real applications: every screen works one-handed on a small phone, the CV flow is robust against the gaps the analyses found, and every known error path from the audit is either fixed or consciously accepted.
- **Source materials:** user description (anchors below), grounded in the analyses listed above.
- **Done when:** every S-NN below is `done`. If time runs short before 2026-11-04, items are cut in this order: S-12, then S-09, then S-08 (see `## Open Roadmap Questions`).
- **Scope anchors:**
  - MS-01: Every screen can be used one-handed on a 360 px phone — the application list, the add/edit form and the CV library move onto the UI design contract (PRD guardrail "Phone usability").
  - MS-02: Re-uploading a CV recognises an already-stored file by the storage service's structured error code, not by the wording of its message (analysis item K3).
  - MS-03: The database refuses an application that points at another user's CV (analysis item K8, domain drift D-06).
  - MS-04: In-page preview of both PDF and DOCX is proven by a browser test, and each allowed file type has an explicitly assigned renderer (analysis item K6).
  - MS-05: The 21 observability-audit findings not named in the production-error-visibility plan are re-checked; the ones still open are fixed or consciously accepted.

## Vision recap

A single candidate runs many recruitment processes at once; when HR calls unexpectedly they must find the right application and see its salary range, quoted rate and agreements in under 10 seconds, on phone or desktop. Milestone M-1 made the app dependable for real use; M-2 makes daily use on real data comfortable and closes the gaps the analyses found.

## North star

**S-06: user can scan the application list on a 360 px phone without horizontal scrolling or clipped text** — the list is the first screen during an unexpected HR call, and it is the one place the project map found broken on a small phone.

> "North star" here means the smallest end-to-end slice whose delivery proves the milestone's point — placed first because the rest only matters if daily use on the phone works.

## At a glance

| ID   | Change ID                  | Outcome (user can …)                                                           | Prerequisites | PRD refs | Status |
| ---- | -------------------------- | ------------------------------------------------------------------------------ | ------------- | -------- | ------ |
| S-06 | phone-friendly-list        | scan the application list on a 360 px phone without horizontal scrolling       | —             | MS-01    | done   |
| S-07 | phone-friendly-form        | add and edit an application comfortably on a 360 px phone                      | —             | MS-01    | done   |
| S-08 | phone-friendly-cv-library  | use the CV library and its preview comfortably on a 360 px phone               | —             | MS-01    | done   |
| S-09 | cv-preview-by-type         | preview both PDF and DOCX CVs, with a browser test proving each                | —             | MS-04    | ready  |
| S-10 | cv-duplicate-by-error-code | re-upload a CV after a failed attempt and have the stored file reused reliably | —             | MS-02    | ready  |
| S-11 | cv-owner-integrity         | trust that an application can only point at their own CV                       | —             | MS-03    | ready  |
| S-12 | audit-findings-closed      | rely on every known error path being reported or consciously accepted          | —             | MS-05    | ready  |

## Streams

Navigation aid — groups items that share a theme and a reading order. Canonical ordering still lives in the slice list below; this table is the proposed reading order across parallel tracks.

| Stream | Theme         | Chain                    | Note                                                                                        |
| ------ | ------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| A      | Phone comfort | `S-06` → `S-07` → `S-08` | The main_goal (quality) is felt here first; the list leads because it is used during calls. |
| B      | CV robustness | `S-09` → `S-10` → `S-11` | Independent of Stream A; S-11 is the only item with a database migration.                   |
| C      | Error paths   | `S-12`                   | Standalone; first in the cut order if time runs short.                                      |

## Baseline

What's already in place in the codebase as of `2026-10-10` (known from the project map and M-1; no layer is absent).

- **Frontend:** present — server-rendered pages with interactive islands; all PRD screens shipped. The details view, the 500 page and the shared error components are on the UI design contract (`scripts/check-ui-literals.mjs`); the list, the add/edit form and the CV library are not yet.
- **Backend / API:** present — API routes for applications, notes, CV, sign-in and error reports; malformed route ids answer 404 (`routeId`).
- **Data:** present — hosted Postgres with row-level security, atomic "change + trace" database functions, private CV storage with content deduplication; migrations are linted and gated before deploy.
- **Auth:** present — email + password sign-in, no self sign-up, protected routes.
- **Deploy / infra:** present — Cloudflare Workers, CI (lint, unit, database, smoke and browser tests), auto-deploy on `main`, a keepalive schedule and a daily health probe.
- **Observability:** present — errors become Cloudflare issues and reach the owner on Telegram; one structured log line per failure; browser failures are reported.

## Foundations

None — every layer is present (see `## Baseline`); each slice below introduces what it needs.

## Slices

### S-06: Phone-friendly application list

- **Outcome:** user can scan the application list on a 360 px phone without horizontal scrolling or clipped text.
- **Change ID:** phone-friendly-list
- **PRD refs:** MS-01
- **Prerequisites:** —
- **Parallel with:** S-07, S-08, S-09, S-10, S-11, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The list is the busiest screen and the one used during calls; moving it onto the design contract first gives the pattern the other two screens follow.
- **Status:** done

### S-07: Phone-friendly add and edit form

- **Outcome:** user can add and edit an application comfortably on a 360 px phone.
- **Change ID:** phone-friendly-form
- **PRD refs:** MS-01
- **Prerequisites:** —
- **Parallel with:** S-06, S-08, S-09, S-10, S-11, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The form has the most fields and validation messages; sequenced after the list so it reuses the list's patterns.
- **Status:** done

### S-08: Phone-friendly CV library

- **Outcome:** user can use the CV library and its preview comfortably on a 360 px phone.
- **Change ID:** phone-friendly-cv-library
- **PRD refs:** MS-01
- **Prerequisites:** —
- **Parallel with:** S-06, S-07, S-09, S-10, S-11, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Used less often than the list and the form, so third in the cut order; touches the same preview component as S-09 — run them one after the other, not at the same time.
- **Status:** done

### S-09: CV preview proven per file type

- **Outcome:** user can preview both PDF and DOCX CVs in the page, and a browser test proves each.
- **Change ID:** cv-preview-by-type
- **PRD refs:** MS-04
- **Prerequisites:** —
- **Parallel with:** S-06, S-07, S-10, S-11, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** DOCX preview has never been exercised by any test; the browser test is the safety net that the analyses said must come before changing the renderer choice.
- **Status:** ready

### S-10: CV duplicate recognised by error code

- **Outcome:** user can re-upload a CV after a failed attempt and have the already-stored file reused reliably.
- **Change ID:** cv-duplicate-by-error-code
- **PRD refs:** MS-02
- **Prerequisites:** —
- **Parallel with:** S-06, S-07, S-08, S-09, S-11, S-12
- **Blockers:** —
- **Unknowns:**
  - What the storage service actually returns for a duplicate file (status, code) locally and in the cloud — Owner: team (a local probe as the first step). Block: no.
- **Risk:** Small change, but a wrong structured check would break the very self-healing it protects; the probe comes first.
- **Status:** ready

### S-11: CV ownership enforced by the database

- **Outcome:** user can trust that an application can only point at their own CV.
- **Change ID:** cv-owner-integrity
- **PRD refs:** MS-03
- **Prerequisites:** —
- **Parallel with:** S-06, S-07, S-08, S-09, S-10, S-12
- **Blockers:** —
- **Unknowns:**
  - Whether any existing production row already points at another user's CV — Owner: user (one read-only query in the cloud database). Block: no.
- **Risk:** The only item with a database migration — it carries the migration ritual (push the migration before the code, previous-version compatibility check, deploy gate).
- **Status:** ready

### S-12: Audit findings closed

- **Outcome:** user can rely on every known error path being reported, or consciously accepted as a known limit.
- **Change ID:** audit-findings-closed
- **PRD refs:** MS-05
- **Prerequisites:** —
- **Parallel with:** S-06, S-07, S-08, S-09, S-10, S-11
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Size unknown until the re-check runs; first in the cut order, and its re-check alone (without fixes) already turns unknowns into a list.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID                  | Suggested issue title                                    | Ready for `/10x-plan` | Notes                                            |
| ---------- | -------------------------- | -------------------------------------------------------- | --------------------- | ------------------------------------------------ |
| S-06       | phone-friendly-list        | Application list usable on a 360 px phone                | yes                   | Run `/10x-ui` or `/10x-plan phone-friendly-list` |
| S-07       | phone-friendly-form        | Add/edit form usable on a 360 px phone                   | yes                   | Run `/10x-ui` or `/10x-plan phone-friendly-form` |
| S-08       | phone-friendly-cv-library  | CV library usable on a 360 px phone                      | yes                   | Run after S-09 or before it, not in parallel     |
| S-09       | cv-preview-by-type         | Browser test for PDF and DOCX preview; renderer per type | yes                   | Run `/10x-plan cv-preview-by-type`               |
| S-10       | cv-duplicate-by-error-code | Recognise a stored CV duplicate by error code            | yes                   | Probe the storage response first                 |
| S-11       | cv-owner-integrity         | Database refuses a foreign CV on an application          | yes                   | Migration ritual applies                         |
| S-12       | audit-findings-closed      | Re-check and close the remaining audit findings          | yes                   | Start with `/10x-observability-audit --verify`   |

## Open Roadmap Questions

1. **Is "remove = set status Withdrawn" accepted by external reviewers as the delete operation?** — Owner: user (ask the reviewers). Block: roadmap-wide only if the answer is no — then a new source anchor is needed.
2. **If time runs short before 2026-11-04, which items are cut?** — Owner: user. Block: none — the agreed cut order is S-12, then S-09, then S-08.

## Parked

- **Branch preview deploys** — Why parked: none are planned; if added, their public URLs must be protected first (risk register: public preview URLs, L/M).
- **Adapter and runtime compatibility-date upgrades** — Why parked: upgrade deliberately, one at a time, with the smoke test — not a milestone item (risk register: adapter drift, M/L).
- **Moving the data layer to the hosting vendor** — Why parked: the owner prefers co-located services, but the database carries sign-in, row-level security and the atomic change functions; `infrastructure.md` lists it as out of scope.
- **Reminders, integrations, AI features, offline mode** — Why parked: PRD Non-Goals.
- **Paid database or hosting plan** — Why parked: M-1 stayed on the free plans (measured CPU headroom for 5 MB uploads, keepalive against pausing); revisit at the first exceeded-CPU or paused-project event.
- **Download through the client error channel (analysis item K7)** — Why parked: a UX and observability trade-off (memory buffering, losing the native download), not a structural defect.
- **Single request for upload and attach (analysis item K4)** — Why parked: it would be a new domain operation, and storage cannot share a database transaction; the two-step flow is acceptable.

## Milestone History

- **M-1: Ready for real use** (`ready-for-real-use`) — closed 2026-10-10. The app stays up between uses, the risky paths (5 MB CV upload, rollback after a migration, call-critical details on a phone) are verified in production, production errors reach the owner on Telegram, and the demo data is replaced by real applications.

## Done

- **S-01: user can open the app and search their applications after a week or more without using it** — Archived 2026-10-05 → `context/archive/2026-10-04-app-available-after-idle-week/`. Lesson: —.
- **S-02: user can attach a CV of up to 5 MB to an application in production without an error** — Archived 2026-10-05 → `context/archive/2026-10-04-cv-upload-5mb-in-production/`. Lesson: —.
- **S-04: user can open an application's details on a phone and see salary range, quoted rate, status and the latest agreement quickly enough for a live call** — Archived 2026-10-05 → `context/archive/2026-10-05-fast-details-on-phone/`. Lesson: —.
- **S-03: user (the owner) can roll back a bad production deploy made after a database migration and still use the app.** — Archived 2026-10-06 → `context/archive/2026-10-06-testing-safe-migrations/`. Lesson: Keep migrations additive — old code runs on the new schema.
- **F-01: (foundation) a failing request in production leaves a record the owner sees without actively digging through live logs.** — Archived 2026-10-06 → `context/archive/2026-10-06-production-error-visibility/`. Lesson: Errors must leave a signal, not just a message.
- **S-05: user can clear the demo data and start tracking their real applications.** — Archived 2026-10-10 → `context/archive/2026-10-10-switch-to-real-data/`. Lesson: —.
- **S-06: user can scan the application list on a 360 px phone without horizontal scrolling or clipped text.** — Archived 2026-10-10 → `context/archive/2026-10-10-phone-friendly-list/`. Lesson: —.
- **S-07: user can add and edit an application comfortably on a 360 px phone.** — Archived 2026-10-10 → `context/archive/2026-10-10-phone-friendly-form/`. Lesson: —.
- **S-08: user can use the CV library and its preview comfortably on a 360 px phone.** — Archived 2026-10-10 → `context/archive/2026-10-10-phone-friendly-cv-library/`. Lesson: —.
