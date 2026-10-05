# Status Rules End to End (Test-Plan Phase 2) — Plan Brief

> Full plan: `context/changes/testing-status-rules-end-to-end/plan.md`
> Research: `context/changes/testing-status-rules-end-to-end/research.md`

## What & Why

This plan proves, from the PRD rather than from the code, that:

- every status transition is allowed or refused as specified;
- reverting a closed status needs confirmation and is recorded;
- every change writes its history row;
- the list follows the importance order.

It covers test-plan risks #3 and #4 and closes the risk #5 gaps that research found.

## Starting Point

- **Transition rule:** lives in `checkTransition` and is enforced only by the TypeScript service. SQL functions persist what they receive.
- **Ordering:** a TypeScript sort over a stored `last_activity_at`.
- **Tests:** hand-picked unit cases, 12 pgTAP assertions and 5 HTTP status moves. None of them check:
  - the rendered order;
  - activity bumps;
  - `is_revert`;
  - `note_revisions` content;
  - `set_application_cv`.
- **Isolation:** one smoke isolation step is a false positive.

## Desired End State

Each layer has its own hand-written oracle:

- **Unit:** an exhaustive 7×7 PRD matrix.
- **pgTAP:** exact history rows and activity rules.
- **Smoke HTTP:** transition kinds, the revert marker, and PRD order on a clean account's dashboard.
- **E2E:** one browser spec proving that cancelling the revert dialog sends nothing, and accepting it reverts and records the change.

The list order is deterministic. The owner-level database bypass is documented as an accepted limit.

## Key Decisions Made

| Decision                              | Choice                                                                              | Why (1 sentence)                                                                             | Source   |
| ------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| Where enforcement lives               | TS service only; SQL persists                                                       | Stated design (`atomic_writes.sql:4`)                                                        | Research |
| Route to Accepted                     | Any active → Accepted, forward, no confirmation                                     | Matches PRD "forward incl. skipping" and current code; PRD clarified                         | Plan     |
| "Most recent activity"                | Moment a note or status change is saved; edits, removals and CV changes don't count | Current behaviour, no migration; PRD clarified                                               | Plan     |
| Owner bypass via PostgREST/RPC        | Document as a known limit (test-plan §7, CLAUDE.md)                                 | Single-user app, owner token only, RLS still blocks other users                              | Plan     |
| Rejected vs Withdrawn, ties           | Interleave by activity; tie → newer `created_at`, then `id`                         | List must not reorder between reloads; small TS change                                       | Plan     |
| Where list order is proven end to end | Smoke HTTP on `/dashboard`, second (clean) user                                     | List is server-rendered and the filter only hides rows, so HTML shows the full order cheaply | Plan     |
| Revert confirmation in a browser      | One Playwright spec                                                                 | Only a browser shows that the UI asks and sends nothing on cancel                            | Plan     |
| HTTP breadth                          | One move per transition kind and error code, not all 42                             | The exhaustive matrix is a unit test; HTTP proves the wiring                                 | Plan     |

## Scope

**In scope:**

- Unit matrix and ordering tests.
- Tie-break in `sortApplications`.
- New `supabase/tests/history_traces.test.sql`.
- Smoke steps for transitions, revert marker, order and isolation fixes.
- `tests/e2e/status-revert.spec.ts`.
- PRD clarifications, test-plan §4/§6.5/§6.6/§7, and CLAUDE.md.

**Out of scope:**

- Database-level enforcement (revoking grants, SQL transition checks).
- Changing what counts as activity.
- Restricting the route to Accepted.
- Separate ranks for the closed statuses.
- The status route's malformed-id 500.
- The 1000-row cap.
- Screenshot tests.

## Architecture / Approach

Testing goes layer by layer, from the cheapest up: unit, then pgTAP, then smoke HTTP, then E2E. The only production change, the tie-break, lands first with its unit test, so later layers test the final rule. Every new HTTP or browser check is shown to protect: break the behaviour, watch the check go red, revert.

## Phases at a Glance

| Phase                      | What it delivers                                                  | Key risk                                                      |
| -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Unit oracle + tie-break | 49-pair PRD matrix, ordering cases, deterministic sort, PRD notes | Matrix accidentally derived from code constants               |
| 2. pgTAP traces & activity | Exact history rows, activity bumps, cross-user refusal            | `now()` is constant inside the test transaction               |
| 3. Smoke HTTP              | Transition kinds, "(cofnięcie)", dashboard order, real isolation  | Later smoke steps need the main application to end at `offer` |
| 4. E2E revert dialog       | Cancel sends nothing; accept reverts and records the change       | Native dialog handling and asserted cleanup                   |
| 5. Docs close-out          | Test-plan §6.5/§7, CLAUDE.md trace rule qualified                 | None significant                                              |

**Prerequisites:**

- Local Supabase running (Docker).
- `.dev.vars` / `.dev.vars.e2e` / `.env.e2e` set up per test-plan §6.3–6.4.
- No migration, so no `db push`.

**Estimated effort:** about 2–3 sessions across 5 phases.

## Open Risks & Assumptions

- The cloud database is assumed to have the same default table grants as local. This matters only for the documented limit, not for any test.
- Smoke ordering relies on sequential requests producing distinct `now()` values (milliseconds apart). The tie-break keeps the order deterministic even if two values coincide.

## Success Criteria (Summary)

- Breaking a transition, the stage order, or the revert dialog turns a specific test red at the right layer.
- Every trace function's history row and activity rule is asserted. Isolation steps fail only when isolation fails.
- `npm test`, `npx supabase test db`, `npm run smoke`, `npx playwright test` and `npm run lint` are all green locally and in CI.
