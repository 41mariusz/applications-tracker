# Call scenario in the browser (test rollout Phase 1) — Plan Brief

> Full plan: `context/changes/testing-call-scenario-browser/plan.md`
> Research: `context/changes/testing-call-scenario-browser/research.md`

## What & Why

Finish rollout Phase 1 of the test plan: during an unexpected HR call, the owner must find the offer by phone number however it is typed (risk #1), and signing in from a protected link must land on that page (risk #6). The research found two real gaps in the search rule: `48 600 1` without "+" finds nothing until all 11 digits are typed, and while only a prefix is typed (`+48`, `0048`) the list says "Brak wyników". Both gaps would show up at exactly the moment the app is needed.

## Starting Point

Playwright is already set up (`playwright.config.ts`, local Supabase via `.dev.vars.e2e`). `seed.spec.ts` covers #6 (sign-in from `/cv` survives a reload). `call-phone-search.spec.ts` covers #1 by filling `+48 …` in one go. Unit tests check one stored format, and CI does not run E2E.

## Desired End State

While the owner types an offer's number in any FR-005 format (spaces, dashes, `+48`, `0048`, `48` without "+"), the offer stays on the list after every keystroke. "Brak wyników" only appears for a number long enough to search that really matches nothing. A unit matrix, a key-by-key E2E and a CI gate prove this, and `test-plan.md` explains how to add the next E2E test.

## Key Decisions Made

| Decision               | Choice                                                                            | Why (1 sentence)                                                                      | Source   |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- |
| Server vs client drift | Not a risk; one shared `matchesQuery`                                             | Unit tests protect both paths; E2E only proves the live wiring                        | Research |
| `48` typed without "+" | Fix here: match the national reading or the full digits                           | It's the exact call-scenario case the test plan targets                               | Plan     |
| Prefix-only typing     | "Not a search yet": national reading < 3 digits (incl. `0`/`00`/`004`) → show all | No false "nothing found" during a call                                                | Plan     |
| Unit oracle            | PRD FR-005 + the rule above, stored × typed × every prefix                        | The test-plan anti-pattern is copying the normaliser                                  | Research |
| E2E scope              | Existing call spec types `48 5xx xxx xxx` key by key; labels without digits       | Proves every `input` event; digit-free labels stop word matching from skewing results | Plan     |
| CI placement           | In the `smoke` job after smoke, preview stopped first; report uploaded on failure | Reuses local Supabase; E2E then blocks deploy                                         | Plan     |

## Scope

**In scope:** unit format matrix; `search.ts` phone-only branch; key-by-key call spec; E2E in CI; `test-plan.md` §2/§3/§4/§6.3.

**Out of scope:** phone storage or migration; word/mixed query behaviour; search + status E2E; paused/bad-link browser tests (smoke covers them); agent hooks (Phase 4).

## Architecture / Approach

The rule lives in `src/lib/domain/search.ts` and is used by the SSR list and the inline live filter in `dashboard.astro`. Only the phone-only branch changes (signatures stay), so no view edits are needed. Tests stack up: the unit matrix holds the format cases, one browser test proves the live wiring and call info, and the HTTP smoke keeps the header-level auth checks.

## Phases at a Glance

| Phase                                  | What it delivers                                        | Key risk                                                  |
| -------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| 1. Search rule + format matrix (TDD)   | FR-005 matrix incl. every keystroke; the two gaps fixed | Over-broad "show all" (limited to phone-only queries)     |
| 2. Risk #1 E2E key by key (`/10x-e2e`) | Live filter proven per keystroke in Chromium            | Flaky waits (web-first assertions only)                   |
| 3. E2E in CI + test-plan update        | Required browser gate; §6.3 cookbook                    | Port 4321 clash with smoke preview; CI user/secrets setup |

**Prerequisites:** local Supabase running; `.env.e2e` and `.dev.vars.e2e` present (they are).
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- "Show all" also applies to `?q=60` on the server, which changes an existing test expectation. This is intended.
- `486001` also matches numbers that contain `486001`. That's an acceptable extra match with a few hundred entries.
- CI time grows by a second build plus the Chromium install (~1–2 min).

## Success Criteria (Summary)

- Typing an offer's number in any format, key by key, never hides it and never shows "Brak wyników" too early.
- A broken search rule or live filter fails CI before deploy, with a Playwright report attached.
- The next E2E test can be written from `test-plan.md` §6.3 alone.
