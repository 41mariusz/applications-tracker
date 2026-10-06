<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Safe Migrations (Test-Plan Phase 3)

- **Plan**: context/changes/testing-safe-migrations/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

**Success criteria re-run on 2026-10-06, all green:**

- `npm test`: 352 tests.
- `npm run lint`, including the migration lint.
- `npx supabase test db`: 4 files, 72 assertions.
- `ci.yml` parses as YAML.
- The local RPC returns 8 versions.
- The gate passes locally (exit 0) and fails on an unreachable URL (exit 1).
- `prettier --check` on the edited docs.

Every manual row is backed by a recorded probe or break-check. Row 4.4 is backed by CI run 37424148699 on 9057afe: the compatibility step ran (28 s) and the gate reported 8 migrations.

**Scope note.** Two extra doc edits are accepted and not counted as findings:

- `test-plan.md` §3 Phase 3 status `planned`. This came from the `/10x-test-plan` and `/10x-plan` orchestration and was committed with Phase 5.
- The roadmap Backlog Handoff row now points at the new Change ID, in addition to the S-03 row and body.

**Security.** No critical issues.

- No `${{ }}` is interpolated into run scripts.
- The gate never prints the key, and the printed URL is a masked secret.
- The RPC is `security definer` with `search_path=''` and is revoked from public.

## Findings

### F1 — Lint escape hatches: `drop` without COLUMN, DO blocks, one override covering two statements

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: scripts/lib/migrations.mjs:79, :119/161-209, :134
- **Detail**: Verified by probe. Each of these gives no finding:
  - `alter table public.applications drop quoted_rate;`, because `COLUMN` is optional in Postgres and the plan names "drop column";
  - `do $$ begin drop table x; end $$;`, because dollar bodies are blanked, but a `DO` block runs immediately;
  - `drop table a; -- migration-lint: allow drop — x` followed on the next line by `drop table b;`. The override counts as "same line" for `a` and "line above" for `b`.
- **Fix**: Close all three in `migrations.mjs` and add a test for each:
  - flag `alter table … drop <identifier>` except `drop constraint|default|not null|identity|expression` (those are judged by their own rules);
  - lint the body of a statement starting with `do`, instead of blanking it;
  - apply an override that shares its line with code only to the statement ending on that line.
  - Strength: closes the bypasses a careless or AI-written migration is most likely to hit; small, local changes.
  - Tradeoff: slightly more scanner logic.
  - Confidence: HIGH — each case is reproduced by a probe.
  - Blind spot: other exotic syntax (nested block comments, `E''` escapes) remains approximate.
- **Decision**: FIXED — `alter table … drop <col>` without COLUMN flagged; `do` bodies linted; an inline override covers only the statement ending on its line. Probes confirm all three; tests added (137 in the file)

### F2 — Rule set misses other breaking statements

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/lib/migrations.mjs:75-108
- **Detail**: Verified by probe. Each of these gives no finding, and each can break the previous code version:
  - `revoke execute on function … from authenticated` or `from anon` (the old code calls those functions as those roles);
  - `alter column … drop default` (old inserts omit the column);
  - `add constraint … unique` or a foreign key, and `create unique index` (the same class as the flagged `check`);
  - `alter policy` and `create policy … as restrictive` (can hide rows from old code);
  - `truncate` and `delete from` (data loss, against the "nothing is deleted" guardrail).
- **Fix A ⭐ Recommended**: Add the rules: `revoke` of execute is allowed only `from public`; `drop default`; `unique` and foreign-key constraints with `create unique index`; `truncate` and `delete`; `alter policy` and restrictive policies. Each gets a flagged test, an override test, and its name in CLAUDE.md and test-plan §6.7.
  - Strength: matches the plan's intent ("statements that would break the previous code version"), and the same override mechanism handles intentional cases.
  - Tradeoff: more rules mean more overrides for legitimate changes, e.g. a unique index on new data.
  - Confidence: HIGH — the same pattern as the existing rules.
  - Blind spot: real migrations may need overrides more often; judge after a few.
- **Fix B**: Keep the current rules and list these cases in CLAUDE.md, `lessons.md` and test-plan §6.7 as "review, not lint".
  - Strength: no code change; a smaller rule set.
  - Tradeoff: relies on review discipline for cases a lint could catch cheaply.
  - Confidence: MED.
  - Blind spot: agents may not read the review list.
- **Decision**: FIXED via Fix A — rules `drop-default`, `unique-or-fk` (incl. `create unique index`), `truncate-or-delete`, `policy-change`; `revoke execute` allowed only `from public`; names in CLAUDE.md, test-plan §6.7 points at `MIGRATION_LINT_RULES`. Break-check: disabling `drop-default` turned 2 tests red

### F3 — Compatibility step can pass falsely or fail without a reason

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: .github/workflows/ci.yml (step "Previous code version passes its smoke on the new schema")
- **Detail**:
  - **The wait loop never fails.** If anything else still answers on 4321, the base's smoke runs against the wrong code. The step lacks the "Port busy" guard that the E2E step has.
  - **Failures without an annotation.** A failed `git fetch` of the base (force-push, garbage-collected commit), `npm ci` or build exits under `set -e` with no `::error`, unlike the deploy step's `report()` pattern.
- **Fix**:
  - Copy the E2E step's port-free check before starting the base preview.
  - Fail with `::error title=Compatibility smoke::base preview did not start` after the wait loop.
  - Wrap the fetch, `npm ci` and build in `|| { echo "::error title=Compatibility smoke::<what> failed"; exit 1; }`.
- **Decision**: FIXED — port-free guard before the base preview, `::error` when it does not start, and annotated failures for fetch/worktree/npm ci/build. Dry run: zero base skipped, unknown base → "cannot be fetched (force-push?)", exit 1

### F4 — File names the CLI accepts crash the scripts; a back-dated migration escapes the lint

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/lib/migrations.mjs:6; scripts/check-migrations.mjs:15-17; scripts/check-cloud-migrations.mjs:79
- **Detail**:
  - **Name pattern too strict.** `\w+` rejects names the Supabase CLI accepts, e.g. `20261006130000_add-x.sql` (verified: it throws). Both scripts then exit 1 with a raw stack trace and no annotation.
  - **Back-dated migrations skip the lint.** The baseline filter `version > 20261004120000` also exempts a new migration back-dated below the baseline.
- **Fix**:
  - Accept `^(\d{14})_.+\.sql$`.
  - Catch the error in both scripts and print a one-line message (`::error title=Malformed migration file name::` in the gate).
  - Exempt the 7 pre-baseline files by name instead of by version comparison.
- **Decision**: FIXED — names accepted as `^(\d{14})_.+\.sql$`; malformed names give a one-line message (gate: `::error title=Malformed migration file name::`); the 7 applied files are exempt by name, so a back-dated migration is linted (probe: flagged)

### F5 — Gate edge messages: empty list and body-read failure

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/check-cloud-migrations.mjs (response handling)
- **Detail**:
  - **Empty list.** `[]` from the RPC is reported as "missing every migration", although it more likely means the wrong project or an empty history.
  - **Body-read failure.** A timeout or reset while reading the body is reported as "unparsable response body" with no retry.
  - Both still fail closed.
- **Fix**:
  - Treat an empty array as the unreadable case, with "no migrations returned — wrong project?".
  - Retry body-read failures like network errors.
- **Decision**: FIXED — an empty RPC result is "Cannot read cloud migration state: no migrations returned — wrong project or empty history?"; body-read failures retry like network errors

### F6 — "Previous code" is the previous push, not the last deployed commit

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml (compatibility step, base = `github.event.before`)
- **Detail**: If the previous push's deploy failed or was blocked by the gate, production still runs an older commit, and the step tests the wrong one. This follows the plan's definition. Deploys now carry the SHA (`--message`/`--tag`), so a later iteration could read the deployed version instead.
- **Fix**: Document the limit in test-plan §6.7 (one sentence).
- **Decision**: FIXED — limit documented in test-plan §6.7

### F7 — pgTAP does not assert the function's grants

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/applied_migrations.test.sql
- **Detail**: Calling the function as anon works, but nothing asserts that `public` lost execute (`revoke … from public`). A future redefinition could widen the grant unnoticed.
- **Fix**: Add `has_function_privilege` assertions: anon and authenticated true, and a role without grants (e.g. `public` through a fresh role) false. Bump `plan()`.
- **Decision**: FIXED — 4 assertions on grants (anon, authenticated, no PUBLIC ACL entry, a fresh role cannot execute); plan(11). Break-check: `grant … to public` turned 2 assertions red
