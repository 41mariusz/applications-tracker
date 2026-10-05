<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Call scenario in the browser (test rollout Phase 1)

- **Plan**: context/changes/testing-call-scenario-browser/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Success criteria evidence: `npm test` 189 passed; `npm run lint` passed; `npx astro check` 0 errors; Playwright suite green in CI #48 (run 37323914965, commit 62ceec5); manual rows 1.5, 2.5, 3.3, 3.4 confirmed by the owner.

## Findings

### F1 — Short digit-only queries now show everything, also when meant as text

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/domain/search.ts:60-61
- **Detail**: The "not a search yet" return runs before the word-matching fallback, so any phone-character query with fewer than 3 national digits matches every application. Verified: `"12"` matches both "Firma 12" and "Acme" (before: only "Firma 12"); `"485"` matches both `600 485 012` and `700 800 900` (national reading `5`; before: only the first). Not a false negative — the right application is always shown — but short numeric text searches and 3–4-digit fragments starting with 48 stop narrowing. Also applies to server-side `?q=`. The plan chose "show all" for phone-only queries but did not consider digits meant as text.
- **Fix A ⭐ Recommended**: Accept the trade-off; pin it with unit tests (`"12"` shows all, `"485"` shows all) and note it in plan / test-plan §6.6.
  - Strength: Keeps the call-scenario guarantee (no "Brak wyników" while typing `6`, `60`, `48 6`), which is risk #1's point; short numeric company names are rare in this data.
  - Tradeoff: `"12"`-style text searches no longer narrow until a third digit or a letter is typed.
  - Confidence: HIGH — behaviour verified by a probe against the code.
  - Blind spot: Not checked against the owner's real data for numeric company names.
- **Fix B**: Show everything only for prefix forms (`+`, `0…`, `48…`); otherwise fall through to word matching for short queries.
  - Strength: Restores text narrowing for `"12"`.
  - Tradeoff: Typing a national number (`6`, `60`) would flash "Brak wyników" again — exactly the failure the phase removed; the keystroke matrix would fail.
  - Confidence: MEDIUM — needs a new rule and a re-run of both test layers.
  - Blind spot: How often the owner types national numbers vs. `+48` ones.
- **Decision**: FIXED via Fix A — accepted; pinned by a unit test (`12`, `485` show everything) and noted in test-plan §6.6

### F2 — The "full digits" reading is dead code and its test proves nothing

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/domain/search.ts:48,62; src/lib/domain/search.test.ts:128-132
- **Detail**: `full` is always `"48" + national`, so a phone containing `full` always contains `national`; `|| (full !== null && phone.includes(full))` never changes a result. The test "reads 48 typed without + both as the country code and as part of the number" passes on the national reading alone (`500486001` contains `6001`). The plan's "or the full typed digits" clause is redundant.
- **Fix**: Drop `full` from `phoneQueryReadings`/`matchesQuery`, reword the test to what it proves (national reading after `48`), and note it in the plan.
- **Decision**: FIXED — `full` reading removed (`nationalDigits`), test renamed to what it proves

### F3 — Spaces inside the `0048` / `+48` prefix break the keystroke guarantee

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/domain/search.ts:44-47
- **Detail**: Prefixes are detected on the raw string, the "beginning of 0048" check on digits. Verified: `00 48 6` → no match for `600 100 200` ("Brak wyników"), and `00 48 600 100 200` never finds it; same for `+ 48 600`, `(0048) 600`. Contradicts FR-005 "regardless of formatting" and the code comment "however it is spaced"; not in the plan's typed-format list.
- **Fix**: Normalise the query to digits plus a leading `+` before the prefix checks, and add `00 48 600 100 200` to the typed-format matrix (it then also covers every keystroke).
- **Decision**: FIXED — test-first: `00 48 600 100 200` and `(0048) 600 100 200` added to the typed matrix (red), query compacted to digits + leading `+` before the country-code check (green)

### F4 — CI port wait loop can pass silently and has no curl timeout

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml (E2E step, wait loop after `npx astro preview stop`)
- **Detail**: If 4321 is still busy after 30 s the loop ends silently and Playwright fails later with a less clear "port in use"; `curl -s` without `--max-time` could hang on a half-dead server.
- **Fix**: Add `--max-time 2` to the curl and an explicit `::error::` + `exit 1` if the port is still answering after the loop.
- **Decision**: FIXED — `--max-time 2` in the wait loop and an explicit `::error::` + exit 1 if 4321 still answers

### F5 — Local service-role key can land in the uploaded Playwright trace

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/support/local-admin.ts:16-19; .github/workflows/ci.yml (upload-artifact on failure)
- **Detail**: In CI a retried test records a trace that includes `request` fixture calls, including the cleanup's `Authorization: Bearer <service-role>` header; the report is uploaded on failure. The key is the throwaway local-stack key of the CI job, so the impact is low.
- **Fix**: Accept and note it in test-plan §6.3 (local throwaway key only).
- **Decision**: FIXED — accepted; sentence added to test-plan §6.3 (throwaway local key only)

### F6 — Pre-existing E2E guard gaps (outside this plan)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/call-phone-search.spec.ts:12-17; playwright.config.ts; tests/e2e/support/local-admin.ts:5-11
- **Detail**: Both from the Playwright setup commits (376b511, 9cbc00e), not from this plan. (a) `afterEach` deletes ids sequentially: if the first delete throws, the second row is left (local only), and a failed setup adds a confusing `toHaveLength(2)` error. (b) The local-only guard checks the cleanup URL, not the Supabase the app under test uses; without `.dev.vars.e2e` locally, the e2e build may fall back to other env files (not verified) and the spec would write `[E2E]` rows to the wrong backend, then fail to clean them.
- **Fix A ⭐ Recommended**: Open a follow-up: fail fast in `playwright.config.ts` when `.dev.vars.e2e` is missing locally or its `SUPABASE_URL` host is not local; make cleanup `Promise.allSettled` + assert all.
  - Strength: Closes the only path for test data to reach a non-local database before more data-writing specs (Phase 2 of the test plan) copy this pattern.
  - Tradeoff: One more small change outside this plan's scope.
  - Confidence: MEDIUM — the env fallback of the Cloudflare build was not verified.
  - Blind spot: Whether wrangler falls back to `.dev.vars` / `.env` when `.dev.vars.e2e` is absent.
- **Decision**: DEFERRED via Fix A — queued in `follow-ups/review-fixes.md`, before test-plan Phase 2
