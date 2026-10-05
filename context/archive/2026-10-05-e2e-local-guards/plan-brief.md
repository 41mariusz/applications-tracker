# E2E local guards — Plan Brief

> Full plan: `context/changes/e2e-local-guards/plan.md`

## What & Why

Make the Playwright suite refuse to run unless the app under test uses the local Supabase, and make the call spec's cleanup unable to leave rows behind. This is follow-up F6 from the implementation review of `testing-call-scenario-browser`. It is done before test-plan Phase 2 adds more E2E specs that write data.

## Starting Point

Locally there is no `.dev.vars`, and `.env` holds the production `SUPABASE_URL`. Wrangler's lookup for `CLOUDFLARE_ENV=e2e` is `.dev.vars.e2e` → `.dev.vars` → `.env*`, so without `.dev.vars.e2e` the e2e build would talk to production. Playwright also reuses any server already on port 4321 when running locally.

Today's guard only checks the cleanup URL. A production sign-in failure shows up only as a timeout. The spec's cleanup deletes ids one after another and adds a misleading error when the test fails early.

## Desired End State

- A local run without a local `.dev.vars.e2e` stops before the build with a clear message.
- A signed-in app whose session cookie belongs to any non-local Supabase project fails the `setup` project, and no session is saved. This also covers a reused server.
- Cleanup attempts every id, asserts each delete, and reports only the real failure.
- CI is unchanged and stays green.

## Key Decisions Made

| Decision      | Choice                                                                                                                                   | Why (1 sentence)                                                                                     | Source |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| Guard layer   | Both: a file check in `playwright.config.ts` (local runs only) and a session-cookie check in `auth.setup.ts` (`sb-127-`/`sb-localhost-`) | The file check gives a clear message early; the cookie check proves what the running app really uses | Plan   |
| Reused server | Keep `reuseExistingServer` locally                                                                                                       | The cookie check covers it; fast local iterations stay                                               | Plan   |
| Cleanup       | `Promise.allSettled` plus a per-id assertion; count asserted only when the body passed                                                   | One failure no longer strands other rows or hides the real error                                     | Review |
| Local host    | Exactly `127.0.0.1` or `localhost`                                                                                                       | Same rule as `local-admin.ts`                                                                        | Plan   |
| CI            | No guard change in CI                                                                                                                    | CI writes local env files itself                                                                     | Plan   |

## Scope

**In scope:** `playwright.config.ts`, `tests/e2e/auth.setup.ts` (plus an optional helper under `tests/e2e/support/`), `tests/e2e/call-phone-search.spec.ts`, `test-plan.md` §6.3, `.env.example`.

**Out of scope:** app code, `.env`, the CI workflow, `reuseExistingServer`, the `[env.e2e]` wrangler section, smoke and demo-data scripts, bulk cleanup by tag.

## Architecture / Approach

Two layers in the test harness:

- **Config load:** a static check of the env file the build will use.
- **Setup project:** a runtime check of the cookie the app sets after sign-in.

The cleanup change stays inside the one spec's `afterEach`.

## Phases at a Glance

| Phase                            | What it delivers                                        | Key risk                                                                                        |
| -------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1. App under test must use local | File check plus cookie check, docs                      | The check could misfire in CI (skipped there); verification must restore `.dev.vars.e2e` safely |
| 2. Cleanup cannot strand rows    | Independent, asserted deletes; honest failure reporting | `expectedStatus` semantics on retries                                                           |

**Prerequisites:** local Supabase running; `.dev.vars.e2e` and `.env.e2e` present.
**Estimated effort:** about 1 short session for both phases.

## Open Risks & Assumptions

- The cookie naming (`sb-<host label>-auth-token`) comes from `@supabase/ssr`. An upgrade that changes it would make the check fail loudly, never pass silently.
- Verification renames `.dev.vars.e2e` and restores it by absolute path. It never touches `.env`.

## Success Criteria (Summary)

- Running the E2E tests can no longer write to production by accident, and the reason it stops is obvious.
- A failed E2E run leaves no test data behind.
