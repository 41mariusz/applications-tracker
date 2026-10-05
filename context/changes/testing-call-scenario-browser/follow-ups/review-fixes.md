# Review follow-ups — testing-call-scenario-browser

From `reviews/impl-review.md`. Do before test-plan Phase 2 adds more data-writing E2E specs.

## F6 — E2E guards (pre-existing, from the Playwright setup)

- **Fail fast on a non-local app backend**: in `playwright.config.ts` (or `auth.setup.ts`), refuse to run locally when `.dev.vars.e2e` is missing or its `SUPABASE_URL` host is not `127.0.0.1`/`localhost` — the cleanup guard in `tests/e2e/support/local-admin.ts` only checks the cleanup URL, not the database the app under test writes to. First verify what the `CLOUDFLARE_ENV=e2e` build reads when `.dev.vars.e2e` is absent.
- **Cleanup that cannot strand a row**: in `tests/e2e/call-phone-search.spec.ts` `afterEach`, delete all created ids with `Promise.allSettled`, then assert every delete succeeded; assert the "2 ids" count only when the test body passed.
