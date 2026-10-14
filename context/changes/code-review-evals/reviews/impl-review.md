<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: promptfoo Evals of the Code-Review Prompt Across Models

- **Plan**: context/changes/code-review-evals/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-14
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Evidence

- **Re-run on HEAD `423f0fb`, all passing:**
  - in `tools/code-reviewer`: `npm test` (19/19), `npm run typecheck`, `npm run build`;
  - `promptfoo --version` (0.124.1) and `promptfoo validate`;
  - the fixture grep (0 template-syntax hits);
  - root `npm run lint`.
- **Not re-run:** the paid eval (3.1). `results/latest.json` (`eval-mox-2026-10-14T15:59:08`) holds 3 results; the two failures are assertion failures (`failureReason 1`, `response.error` null), not provider errors.
- **Drift agent:** all planned items MATCH. `promptfoo-files.ts` is a harmless EXTRA. The `npm ci` instead of `--omit=optional` drift is documented. No "NOT doing" violations, and no changes to `.github/`, `.nvmrc`, or the agent's prompt, schema or CLI.
- **Safety agent:** no secrets in `results/latest.json`. `.env`, `node_modules` and `results/` are ignored. The lockfile has no git/http/file dependencies. The CI `code-reviewer` job and the review action are unaffected.

## Findings

### F1 — `promptfoo view` listens on every network interface

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tools/code-reviewer/evals/package.json:11 (`view` script); promptfoo `dist/src/server/index.js:76324`
- **Detail**:
  - promptfoo 0.124.1 calls `httpServer.listen(port)` without a host. `ss -ltnp` shows `*:15500` for the server started in this session.
  - On this SSH-reached box, anyone who can reach port 15500 can read the prompts, the fixture, the model outputs and the eval history. The API key is not exposed.
- **Fix A ⭐ Recommended**: README note under "Run": use `view` only through an SSH tunnel (`ssh -L 15500:localhost:15500 <box>`) with the port closed to the outside, and stop the server when done.
  - Strength: Keeps the UI that the plan's manual checks (3.3, 3.4) rely on.
  - Tradeoff: Relies on the reader following the note.
  - Confidence: HIGH — the bind address was observed with `ss`.
  - Blind spot: The box's firewall rules were not checked.
- **Fix B**: Drop the `view` script and rely on the terminal table plus `results/latest.json`.
  - Strength: Removes the exposure entirely.
  - Tradeoff: Loses the side-by-side UI, which is the most readable view of grader reasons.
  - Confidence: MEDIUM — `npx promptfoo view` still works ad hoc.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — README note on the SSH tunnel and stopping the server

### F2 — `eval:sync` output is not in prettier's format, so every sync leaves the files dirty

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tools/code-reviewer/src/eval-sync.ts:12; root .prettierignore
- **Detail**:
  - The pre-commit prettier reformatted the generated JSON, for example by collapsing the `["pass","fail"]` enum onto one line.
  - Running `npm run eval:sync` on HEAD therefore rewrites `schema.json` and `response-format.json` (+8 −2 lines) with no semantic change.
  - The drift test still passes because it compares parsed JSON, but `git status` shows noise after every sync.
- **Fix**: Add `tools/code-reviewer/evals/prompts/review.json`, `schema.json` and `response-format.json` to `.prettierignore` (generated files, like the 10x-cli block), then re-run `npm run eval:sync` and commit, so the committed bytes equal the sync output.
- **Decision**: FIXED — three generated files in `.prettierignore`, re-synced (a second sync leaves no diff)

### F3 — Plan still says `--omit=optional` in three places outside the adaptation note

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/code-review-evals/plan.md:208, :220, :300 (Progress row 2.1 at :336 is immutable by convention)
- **Detail**: The note at `plan.md:150` documents the switch to plain `npm ci`, but the README contract (`:208`), criterion 2.1 (`:220`) and the manual testing step (`:300`) still show `--omit=optional`, which breaks promptfoo.
- **Fix**: Add a short "(see implementation note: plain `npm ci`)" marker to `:208`, `:220` and `:300`, and leave the Progress title unchanged.
- **Decision**: FIXED — superseded markers on plan.md:208, :220, :300 (Progress title unchanged)

### F4 — README omits the showThinking / max_tokens overrides; eval-results names an inexact commit

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tools/code-reviewer/evals/README.md (Run section); context/changes/code-review-evals/eval-results.md:6
- **Detail**:
  - The two provider overrides that make the output comparable with the agent's are explained only in the config header.
  - `eval-results.md` says "code at `6022ba3`, plus the config fix", but the fix landed in `180c801`.
- **Fix**: Add one README line on the two overrides and why they matter, and state the run's code as "`6022ba3` + config fix (committed in `180c801`)".
- **Decision**: FIXED — README line on the provider overrides (plus install note); eval-results names 180c801

### F5 — `npm audit` reports 5 high findings in promptfoo's transitive dependencies

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tools/code-reviewer/evals/package-lock.json
- **Detail**:
  - The findings are in `basic-ftp`, `braces` and `node-forge`.
  - None of them is reachable from untrusted input in a manual, local run with a fixed config and fixture.
  - None reaches the CI action or the bundle, since `evals/` has its own lockfile.
  - `npm audit fix --force` would break the pin.
- **Fix**: Accept; add a README line ("known transitive audit findings; bump promptfoo when a release clears them, never `audit fix --force`").
- **Decision**: FIXED — accepted; README audit note

### F6 — `buildPromptfooResponseFormat()` has no return type

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tools/code-reviewer/src/prompts/promptfoo.ts:29
- **Detail**: Both sibling builders in the same file declare return types; this one relies on inference.
- **Fix**: Declare the return type, as a small interface or `Record<string, unknown>`.
- **Decision**: FIXED — ResponseFormat interface as the return type
