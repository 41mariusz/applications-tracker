---
project: Applications Tracker
version: 1
status: draft
created: 2026-09-30
updated: 2026-10-05
prd_version: —
main_goal: quality
top_blocker: external
milestone_id: ready-for-real-use
milestone_seq: 1
milestone_status: open
---

# Roadmap: Applications Tracker

> Derived from `context/foundation/infrastructure.md` (risk register) + the owner's description of the switch to real data + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Ready for real use** — Status: open

- **Intent:** The owner can rely on the app for real job-hunting: it is up when a recruiter calls, the risky paths are verified in production, failures are visible, and the demo data is replaced by real applications.
- **Source materials:** `context/foundation/infrastructure.md` (researched 2026-09-30, `## Risk Register`) and the owner's description (switch from `[TEST]` demo data to real data). Every PRD must-have (FR-001–FR-013) is already built and deployed — see `## Baseline` — so the PRD is not re-sliced here.
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:**
  - MS-01: The app is usable after a week or more without use — the database must not be paused when a recruiter calls. (Risk register: Supabase free project pauses after inactivity — M/H.)
  - MS-02: Uploading a CV of up to 5 MB works in production. (Risk register: CV upload exceeds the free-plan CPU limit — M/M.)
  - MS-03: Rolling back a production deploy after a database migration does not break the app. (Risk register: rollback after a migration runs old code on a new schema — L/H.)
  - MS-04: Application details open quickly on a phone during a call. (Risk register: latency from multiple sequential database calls per page — L/M.)
  - MS-05: Production errors are noticed instead of failing silently. (Risk register: silent errors with nobody watching logs — M/M.)
  - MS-06: The owner removes the demo data and starts entering real applications. (Owner's description: clear test data without loading new test data.)

## Vision recap

A candidate running many parallel recruitment processes needs, the moment HR calls unexpectedly, to know which offer the call is about, what rate they quoted, and what was already agreed — something a spreadsheet can't answer quickly on a phone or a computer. The product answers "what do I know about this company?" in under 10 seconds. This milestone doesn't add capabilities; it makes that promise hold in daily, real use.

## North star

**S-01: The app works after a week without use** — the north star is the smallest end-to-end change whose success proves this milestone's point: that the app can be trusted at the moment it matters. It goes first because the app is worthless during a call if its database is asleep, and every other item here only matters once that holds.

## At a glance

| ID   | Change ID                     | Outcome (user can …)                                                        | Prerequisites | PRD refs | Status   |
| ---- | ----------------------------- | --------------------------------------------------------------------------- | ------------- | -------- | -------- |
| F-01 | production-error-visibility   | (foundation) production errors reach a place the owner actually checks      | —             | MS-05    | ready    |
| S-01 | app-available-after-idle-week | open the app and search after a week or more without using it               | —             | MS-01    | done     |
| S-02 | cv-upload-5mb-in-production   | attach a 5 MB CV in production without an error                             | F-01          | MS-02    | done     |
| S-03 | testing-safe-migrations       | roll back a bad deploy after a migration and still use the app              | —             | MS-03    | ready    |
| S-04 | fast-details-on-phone         | open an application's details on a phone and see call-critical info quickly | —             | MS-04    | done     |
| S-05 | switch-to-real-data           | clear the demo data and start tracking real applications                    | S-01          | MS-06    | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme            | Chain           | Note                                                                                   |
| ------ | ---------------- | --------------- | -------------------------------------------------------------------------------------- |
| A      | Availability     | `S-01` → `S-05` | Real data goes in only after the app is known to stay up — the reliability goal first. |
| B      | Visible failures | `F-01` → `S-02` | Error visibility first, so the CV-upload check can see a CPU-limit failure.            |
| C      | Safe releases    | `S-03`          | Standalone; protects every later deploy in this milestone.                             |
| D      | Call speed       | `S-04`          | Standalone; measures before changing anything.                                         |

## Baseline

What's already in place in the codebase as of `2026-09-30` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — per tech-stack.md: server-rendered pages with interactive islands; all PRD screens shipped (list, search, status filter, details, edit, CV library).
- **Backend / API:** present — API routes for applications, notes, CV and sign-in, each checking the signed-in user.
- **Data:** present — hosted Postgres with row-level security, atomic "change + trace" database functions, private CV storage with content deduplication.
- **Auth:** present — email + password sign-in, no self sign-up, protected routes.
- **Deploy / infra:** present — Cloudflare Workers, CI with lint, unit, database and smoke tests, auto-deploy on `main`. No scheduled jobs and no health-check endpoint.
- **Observability:** partial — platform observability is enabled and errors are logged in route handlers, but nothing alerts the owner and nobody reviews the logs.

## Foundations

### F-01: Production errors reach the owner

- **Outcome:** (foundation) a failing request in production leaves a record the owner sees without actively digging through live logs.
- **Change ID:** production-error-visibility
- **PRD refs:** MS-05
- **Unlocks:** S-02 (verification path: a CPU-limit failure on CV upload becomes visible instead of a silent error page); detection path for S-01 (knowing if the app goes down between uses).
- **Prerequisites:** —
- **Parallel with:** S-01, S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - Is the platform's built-in observability enough (with a routine to check it), or is a separate error tracker needed? — Owner: user. Block: no.
- **Risk:** Sequenced first in its stream because the reliability goal means failures must be visible before the risky paths are exercised; the risk is over-building monitoring for a single-user app — keep it to the minimum that surfaces an error.
- **Status:** ready

## Slices

### S-01: The app works after a week without use

- **Outcome:** user can open the app and search their applications after a week or more without using it.
- **Change ID:** app-available-after-idle-week
- **PRD refs:** MS-01
- **Prerequisites:** —
- **Parallel with:** F-01, S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - What is the database provider's current inactivity-pause policy for free projects (period, and what counts as activity)? — Owner: user. Block: no.
  - Keep the free plan with a keep-alive, or move to a paid database plan? — Owner: user. Block: no.
- **Risk:** Highest-impact risk in the register and the north star; the risk in the fix is a keep-alive that silently stops running — it needs its own failure signal.
- **Status:** done

### S-02: A 5 MB CV uploads in production

- **Outcome:** user can attach a CV of up to 5 MB to an application in production without an error.
- **Change ID:** cv-upload-5mb-in-production
- **PRD refs:** MS-02
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - Does a 5 MB upload actually exceed the free-plan CPU limit in production, or is it within burst tolerance? — Owner: user. Block: no.
- **Risk:** Follows F-01 so the test result is observable; if it fails, the choice is between a paid hosting plan and moving the hashing work, which changes where file checks happen.
- **Status:** done

### S-03: Rolling back after a migration is safe

- **Outcome:** user (the owner) can roll back a bad production deploy made after a database migration and still use the app.
- **Change ID:** testing-safe-migrations (closed by test-plan Phase 3; was `safe-rollback-after-migration`)
- **PRD refs:** MS-03
- **Prerequisites:** —
- **Parallel with:** F-01, S-01, S-04
- **Blockers:** —
- **Unknowns:**
  - Are the existing migrations backward-compatible with the previous code version? — Owner: team. Block: no.
- **Risk:** Low likelihood but high impact; placed early because every later slice in this milestone ships through the same deploy path.
- **Status:** ready

### S-04: Details open quickly on a phone

- **Outcome:** user can open an application's details on a phone and see salary range, quoted rate, status and the latest agreement quickly enough for a live call.
- **Change ID:** fast-details-on-phone
- **PRD refs:** MS-04
- **Prerequisites:** —
- **Parallel with:** F-01, S-01, S-03
- **Blockers:** —
- **Unknowns:**
  - Is the details page actually slow on a phone today, or is this risk theoretical? — Owner: user. Block: no.
- **Risk:** Measure first; if it is already fast the slice closes with the measurement, avoiding an optimisation nobody needs.
- **Status:** done

### S-05: Switch to real data

- **Outcome:** user can clear the demo data and start tracking their real applications.
- **Change ID:** switch-to-real-data
- **PRD refs:** MS-06
- **Prerequisites:** S-01
- **Parallel with:** F-01, S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - Should demo CV files be removed from storage as well, given the "CV files are never removed" rule applies to real data? — Owner: user. Block: no.
- **Risk:** Last in its stream so real data never lands in an app that can go dark between uses; clearing is destructive and one-way, so it must require an explicit confirmation.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                     | Suggested issue title                             | Ready for `/10x-plan` | Notes                                                         |
| ---------- | ----------------------------- | ------------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| F-01       | production-error-visibility   | Make production errors visible to the owner       | yes                   | Run `/10x-plan production-error-visibility`                   |
| S-01       | app-available-after-idle-week | Keep the app working after a week without use     | yes                   | North star — run `/10x-plan app-available-after-idle-week`    |
| S-02       | cv-upload-5mb-in-production   | Verify and fix 5 MB CV upload in production       | no                    | Waits for F-01                                                |
| S-03       | testing-safe-migrations       | Make rollback after a migration safe              | yes                   | Implemented via test-plan Phase 3 (`testing-safe-migrations`) |
| S-04       | fast-details-on-phone         | Measure and, if needed, speed up details on phone | yes                   | Run `/10x-plan fast-details-on-phone`                         |
| S-05       | switch-to-real-data           | Clear demo data and start using real applications | no                    | Waits for S-01                                                |

## Open Roadmap Questions

1. **Stay on free plans with workarounds, or pay for the database and/or hosting plan?** — Owner: user. Block: affects the fix chosen in S-01 and S-02, not whether they can be planned.
2. **Is "remove = set status Withdrawn" accepted by external reviewers as the delete operation?** — Owner: user (ask the reviewers). Block: roadmap-wide only if the answer is no — then a new source anchor is needed.

## Parked

- **Branch preview deploys** — Why parked: none are planned; if added, their public URLs must be protected first (risk register: public preview URLs, L/M).
- **Adapter and runtime compatibility-date upgrades** — Why parked: upgrade deliberately, one at a time, with the smoke test — not a milestone item (risk register: adapter drift, M/L).
- **Moving the data layer to the hosting vendor** — Why parked: the owner prefers co-located services, but the database carries sign-in, row-level security and the atomic change functions; `infrastructure.md` lists it as out of scope.
- **Reminders, integrations, AI features, offline mode** — Why parked: PRD Non-Goals.

## Milestone History

## Done

- **S-01: user can open the app and search their applications after a week or more without using it** — Archived 2026-10-05 → `context/archive/2026-10-04-app-available-after-idle-week/`. Lesson: —.
- **S-02: user can attach a CV of up to 5 MB to an application in production without an error** — Archived 2026-10-05 → `context/archive/2026-10-04-cv-upload-5mb-in-production/`. Lesson: —.
- **S-04: user can open an application's details on a phone and see salary range, quoted rate, status and the latest agreement quickly enough for a live call** — Archived 2026-10-05 → `context/archive/2026-10-05-fast-details-on-phone/`. Lesson: —.
