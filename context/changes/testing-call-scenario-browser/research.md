---
date: 2026-10-05T12:20:44Z
researcher: Claude (Opus 5.5) for Mariusz Michalak
git_commit: 326e84d
branch: main
repository: applications-tracker
topic: "Test rollout Phase 1 — ground risks #1 (phone search during a call) and #6 (sign-in from a protected link) and the cheapest test layers"
tags: [research, testing, search, phone, auth, e2e, playwright]
status: complete
last_updated: 2026-10-05
last_updated_by: Claude (Opus 5.5)
---

# Research: call scenario in the browser (test rollout Phase 1)

**Date**: 2026-10-05T12:20:44Z
**Researcher**: Claude (Opus 5.5) for Mariusz Michalak
**Git Commit**: 326e84d
**Branch**: main
**Repository**: applications-tracker

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` ("Call scenario in the browser", risks #1 and #6): where the phone-search and sign-in failure paths live, what existing tests already prove, which risk-response assumptions hold, and what the cheapest useful test layers and E2E setup facts are.

## Summary

- **Risk #1 is real but narrower than feared.** One shared function decides matches on the server (`?q=`) and in the browser (live filter), so server/client drift cannot happen on this path (`src/pages/dashboard.astro:27-31`, `:148-199`; `src/lib/domain/search.ts`). Phones are stored raw and normalised only at search time (`src/lib/services/applications.ts:30`). The format rule handles `+48`, `0048`, spaces, dashes, parentheses and an 11-digit `48…` number (`search.ts:25-35`), but **a partial number typed without "+" (e.g. `48600 1…`) matches nothing until all 11 digits are typed**, and `+48`/`0048` alone (under 3 remaining digits) shows zero results while typing (`search.ts:37-49`).
- **The live filter is untested.** It is an inline `<script>` (no request, no debounce) re-running `matchesQuery` on each `input` event (`dashboard.astro:148-199`); the HTTP smoke test checks only the server-rendered count for one format (`scripts/smoke.mjs:199-201`) and the details page only by company name (`:225`), never salary range or quoted rate.
- **Risk #6 is mostly covered at the HTTP level, but only via `Location` headers** — the anti-pattern the test plan names. Smoke covers the anonymous redirect with `next`, sign-in returning to the application and refusing `//evil.com` (`scripts/smoke.mjs:345-361`). Browser-only gaps: the hidden `next` field in the rendered page, the page content after landing, reload persistence, and a hydration hazard — sign-in inputs are controlled, so text typed before hydration can be reset (`src/components/auth/SignInForm.tsx:24,45-46`).
- **Cheapest layers (verified):** unit tests for the phone-format matrix (oracle: PRD FR-005 + owner's call scenario, not `normalizePhone`); **one** Playwright E2E for "sign in from an application link → land on it → back to the list → type a differently formatted number → the right card is the only result → open it → salary range and quoted rate visible". Playwright is not installed yet.

## Detailed Findings

### Risk #1 — phone search

- **Data path**: `listApplications` selects all rows and sorts in JS; no SQL filtering (`src/lib/services/applications.ts:130-137`). Every card is rendered; non-matching cards get `hidden` (`dashboard.astro:106-120`); each card carries `data-search` JSON with company, position, HR name and phone (`:114-119`); result count `data-testid="search-count"` (`:97`).
- **Live filter**: inline Astro `<script>` (not a React island), `input` listener, same `matchesQuery`/`matchesStatus`, `history.replaceState` for `?q=`/`?status=`, Enter prevented (`dashboard.astro:148-199`). Runs on input/change only, not on load. Without JS the GET form submits `?q=` (`:90-94`).
- **Normalisation** (`src/lib/domain/search.ts:25-35`, verified by reading the code): strip a leading `+48` or `0048`, remove non-digits, and drop a leading `48` only when exactly 11 digits remain. A query made only of phone characters is one number (≥ 3 digits) matched as a **substring** of the stored digits (`:37-49`); mixed queries fall back to per-word matching (`:53-59`).
- **Consequences for the call scenario (this inspected rule)**:
  - stored `600-100-200`, `48600100200`, `(+48) 600 100 200`, `+48600100200` all normalise to `600100200` and are found by `600 100 200`, `+48 600 100 200`, `0048…` (by reading; only the stored `+48 …` form is covered by tests);
  - typing `+48`, `+48 6`, `0048` → 0 results until 3 national digits are typed;
  - typing `48 600 1` (no "+") → 0 results until all 11 digits are typed — the only partial-typing gap found;
  - any 3-digit fragment (e.g. `100`) matches every number containing it — acceptable for a single user's few hundred entries, but it means "exactly one result" depends on test data.
- **Existing tests**: `src/lib/domain/search.test.ts:50-55` (stored `+48 600 100 200` found as six typed formats), `:57-61` (negatives), `:63-66` (word + phone). Missing: other stored formats, partial typing without "+", the transient prefix-only state, search combined with the status filter (the AND lives in `dashboard.astro`).

### Risk #6 — sign-in from a protected link

- **Flow**: anonymous protected page → 302 `/auth/signin?next=<path+search>` (`src/middleware.ts:36-40`); `signin.astro:7` reads `next` server-side and renders it into the form's hidden input (`SignInForm.tsx:46`); native `<form method="POST" action="/api/auth/signin" noValidate>` (`:45`), JS blocks submit only on failed validation (`:38-42`); `signInWithPassword` → 302 `safeNextPath(next)` (`src/pages/api/auth/signin.ts:23,38`); on failure back to the form keeping `next` (`:13-17,35`); paused → `/paused` (`:25-26`).
- **Loops**: none found on the inspected paths — `/auth/signin` is not protected, a signed-in user on it just sees the form, `/paused` and `/_astro/*` are exempt (`middleware.ts:6,21,32`). A non-540 failure of `getUser()` (network/5xx) silently treats the user as signed out (`middleware.ts:15`) — not a loop, but a confusing "sign in again".
- **Session**: `@supabase/ssr` cookie `sb-<ref>-auth-token` (chunked over 3180 chars), `path=/`, `SameSite=Lax`, `httpOnly=false`, `maxAge` 400 days, no `secure` (works on http://localhost) (`node_modules/@supabase/ssr` constants/chunker); refreshed in `getUser()` on each request (`middleware.ts:15`).
- **Smoke coverage** (`scripts/smoke.mjs`): `:154` anonymous dashboard → sign-in, `:158` wrong password, `:163` correct → `/dashboard`, `:167` cookie reused, `:345-347` anonymous app link → `?next=`, `:350-356` sign-in returns to the application, `:359-361` `//evil.com` → `/dashboard`, `:363-365` sign-out. All assert `Location`; none renders the sign-in page or the landing page.
- **Hydration hazard (browser-only)**: email/password inputs are controlled (`value={email}`); text typed before `SignInForm` (`client:load`) hydrates can be reset to empty, after which validation shows "Podaj adres e-mail". The email regex `^[^\s@]+@[^\s@]+\.[^\s@]+$` (`SignInForm.tsx:24`) rejects dot-less domains (e.g. `owner@localhost`) — E2E users need a dotted domain.

### E2E setup facts

- Not installed: `@playwright/test`, `@vitest/browser-playwright` (only an optional peer in `package-lock.json:12824`).
- Server: `npm run build` + `npm run preview -- --port 4321` (Astro default port; CI uses 4321, `.github/workflows/ci.yml:54`). Astro 7 preview daemonises — Playwright's `webServer` needs `ASTRO_PREVIEW_BACKGROUND`/stop handling per the `/10x-e2e-setup` template; stop leftovers with `npx astro preview stop`.
- Test user: no sign-up (`supabase/config.toml:170`); create via the Supabase admin API with the service-role key, as smoke does (`scripts/smoke.mjs:24-35`), from the test/global-setup process against **local** Supabase only; seed applications through the app's API (`smoke.mjs:176-185`). The key must never reach `.dev.vars`/`.env` for the app (CLAUDE.md Hard rules).
- Env: preview reads `.dev.vars`; point it at local Supabase without swapping `.env` (`test-plan.md` §6.4; memory note). Add `playwright/.auth/` and similar to `.gitignore`.
- CI: the `smoke` job (`ci.yml:24-62`) already runs local Supabase, build and preview — the natural home for an e2e step (`npx playwright install --with-deps chromium`), ordered so smoke's background preview and Playwright's `webServer` do not collide on 4321.
- Tooling: `vitest.config.ts:9` includes only `src/**/*.test.ts`, so `tests/e2e/*.spec.ts` will not be collected; ESLint typed rules apply to new `.ts` files (`eslint.config.js:17-22`, tsconfig `**/*`); the preview runs the custom Worker entry (cron does not fire), so health checks need a fresh ping as smoke does (`smoke.mjs:38`).

## Code References

- `src/lib/domain/search.ts:15-22,25-35,37-59` — text normalisation, phone normalisation, matching rule
- `src/lib/domain/search.test.ts:50-66` — existing phone cases
- `src/pages/dashboard.astro:27-31,90-120,148-199` — SSR filtering, cards with `data-search`, live filter script
- `src/lib/services/applications.ts:30,130-137` — raw phone storage, unfiltered list load
- `src/middleware.ts:6,15,21,32,36-40` — exemptions, getUser, protected redirect with `next`
- `src/pages/auth/signin.astro:7,16`, `src/components/auth/SignInForm.tsx:24,38-46` — next field, controlled inputs, validation
- `src/pages/api/auth/signin.ts:13-17,23-38` — sign-in, error/next handling, paused redirect
- `scripts/smoke.mjs:24-35,154-167,176-185,199-201,225,345-365` — user creation, auth steps, search step, details step
- `.github/workflows/ci.yml:24-62` — smoke job layout

## Architecture Insights

- One matching function serves both render paths — tests at the unit layer protect both; the E2E only needs to prove the live wiring and the user-visible outcome, not re-test the format matrix.
- The call scenario crosses sign-in, middleware, SSR list, inline script and details page — exactly the boundary set a single browser test covers cheaply; everything else stays at unit/HTTP level (cost × signal).

## Historical Context (from prior changes)

- `context/archive/2026-10-05-fast-details-on-phone/` — added `next=` return path, `safeNextPath` tests and the smoke steps cited above; its plan explicitly deferred Playwright to course lesson M3L4 — **supported**, still not installed.
- `context/foundation/test-plan.md` §2 Risk Response Guidance:
  - #1 context "where matching happens (server vs client)" — **answered**: same function on both; drift is not the failure mode. Must-challenge "`?q=` works over HTTP, so live typing works" — **supported** (live filter untested). Additional failure mode found: partial number typed without "+".
  - #6 cheapest layer "e2e (one sign-in flow) … + existing smoke" — **supported**; add: assert the landing page content, not `Location` (smoke already covers the headers).

## Related Research

- `context/archive/2026-10-05-fast-details-on-phone/research.md` — entry architecture (404, `next`) of the details view.

## Open Questions

1. **Partial number typed without "+"** (`48 600 1…` → no results until 11 digits): fix the matching rule in this change (it contradicts the call scenario) or record it as a known limitation and test only complete numbers? Product decision for `/10x-plan`.
2. **Prefix-only state** (`+48`, `0048` → 0 results until 3 national digits): acceptable as "keep typing", or show all results until a number is long enough? Product decision for `/10x-plan`.
3. **Corrections for test-plan §2** (for `/10x-test-plan`'s post-research backport): Risk #1 response guidance — replace the server-vs-client drift concern with "partial/prefixed numbers while typing"; Risk #6 — note the pre-hydration input reset as a browser-only failure mode.
