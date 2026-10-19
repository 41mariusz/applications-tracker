<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Shared AI Toolkit on GitHub Packages

- **Plan**: context/changes/shared-ai-toolkit/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-15
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

All of these were re-run on HEAD `0011690` and passed:

- `npm pack --dry-run` lists 7 files, with no `test/` and no `scripts/`.
- `validate-package` is ok.
- The package tests pass, 9/9.
- `consumer-check` passed on a fresh tarball.
- `npx eslint packages/ai-toolkit --max-warnings=0` is clean.
- Root `npm run lint`, `astro check` (0 errors) and `npm test` (514/514) pass.
- 4 of 4 `uses:` are pinned to SHAs.

Drift agent:

- Every planned item and every spec requirement is MATCH.
- The owner-approved deviations are applied consistently: scope `@41mariusz`, `team-code-review`, `packages/ai-toolkit/`, no automatic `preinstall`, adapted conventions.
- There are no "NOT doing" violations. The diff touches no `ci.yml`, `review.yml`, reviewer agent or app code.
- EXTRAs are benign:
  - the UI section in the conventions;
  - removal of stale skills;
  - the allowScripts note;
  - `persist-credentials: false`;
  - the no-manifest test.

Safety agent:

- The workflow has no real issues. It cannot publish from a PR, has no event-data interpolation, and the E404 handling fails closed.
- Reproductions of the findings below are in the scratchpad.

## Findings

### F1 — A failed install can leave the skill orphaned for good

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/ai-toolkit/install.js:120-147
- **Detail**:
  - The installer copies the skills first, writes `CLAUDE.md` next and the manifest last.
  - Reproduced: if the `CLAUDE.md` write fails on a first install (EACCES, read-only file), `.claude/skills/team-code-review/` exists but no manifest lists it.
  - Every later install then warns "not installed by …; left untouched" and installs nothing, and uninstall removes nothing. The user has to delete the directory by hand.
  - A failure halfway through `cpSync` (ENOSPC) has the same effect, after `rmSync` has already removed the previous copy.
- **Fix A ⭐ Recommended**: Write the manifest's ownership before touching the skills. Record the names to be installed (merged with the previous ones) first, then copy, then write `CLAUDE.md`, then finalise the manifest.
  - Strength: A crash at any point leaves the toolkit owning what it may have written, so the next `npx ai-toolkit` repairs it. It is a small reordering in one function.
  - Tradeoff: The manifest can briefly list a skill whose copy is incomplete. The next run replaces it.
  - Confidence: HIGH — the failure was reproduced and the ordering is the cause.
  - Blind spot: Concurrent installs (workspaces) are still not atomic.
- **Fix B**: Copy each skill into a temporary sibling directory, then rename it into place, and write the manifest last.
  - Strength: The swap is atomic for each skill.
  - Tradeoff: More code. The `CLAUDE.md` failure case still needs the ownership to be recorded.
  - Confidence: MEDIUM.
  - Blind spot: Renaming across file systems.
- **Decision**: FIXED (Fix A) — manifest ownership written before any skill is touched; test "owns the skill even when the first install fails halfway" (break-checked)

### F2 — "Postinstall never fails" means problems are invisible, and the README claims they are printed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/ai-toolkit/install.js:167-182; packages/ai-toolkit/README.md ("Never breaks your install")
- **Detail**:
  - npm 7+ hides the output of dependency lifecycle scripts unless they fail. Under postinstall, the warning and exit 0 therefore print nothing.
  - Reproduced: with a broken marker, `npm install` succeeds, no `.claude/` is created, and the user is told nothing.
  - Unexpected errors (EACCES, a bug, a manifest whose content is `null`) are swallowed the same way.
  - The spec requires that postinstall must not fail the install. The cost is silence, and the README says the opposite.
- **Fix A ⭐ Recommended**: Keep exit 0. Record the outcome in a status file, `.claude/.ai-toolkit-status.json`, holding either `{ ok, version, at }` or `{ error }`. Fix the README to say that npm hides postinstall output, and tell users to run `npx ai-toolkit` after installing to see the result or the error.
  - Strength: It respects the spec, the failure leaves a trace in the consumer, and the docs become true. This matches the repo rule "errors leave a signal".
  - Tradeoff: One more file in the consumer's `.claude/`.
  - Confidence: HIGH — the npm behaviour is documented and was reproduced.
  - Blind spot: None significant.
- **Fix B**: Exit 1 for errors that are not a ToolkitError (bugs, EACCES), and keep exit 0 only for user-fixable ToolkitErrors.
  - Strength: Real bugs become visible.
  - Tradeoff: It breaks the spec's "do not fail the whole npm install" for that class of error.
  - Confidence: MEDIUM.
  - Blind spot: How strictly mentors read the spec.
- **Decision**: FIXED (Fix A) — `.claude/.ai-toolkit-status.json` written by every CLI run (ok/version or error); README says npm hides postinstall output; consumer-check asserts the status file

### F3 — The development-checkout skip misses `--prefix` and global installs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/ai-toolkit/install.js:94-98
- **Detail**:
  - The skip only checks whether `INIT_CWD` is inside the package directory.
  - Reproduced: `npm install --prefix packages/ai-toolkit`, run from the repo root, runs the package's own postinstall with `INIT_CWD` set to the root. It writes `.claude/skills/team-code-review/`, a manifest and a managed block into **this repo's** `CLAUDE.md` and its 10x-cli-managed `.claude/`.
  - `npm i -g @41mariusz/ai-toolkit` writes into whatever directory it is run from.
- **Fix**: Install only when the package itself lives under a `node_modules` directory and the install is not global. That means `PACKAGE_DIR` contains a `node_modules` path segment and `npm_config_global !== "true"`. Add a test that runs the installer from a package directory outside `node_modules`.
- **Decision**: FIXED — CLI installs only when the package is under node_modules and not global (`cliSkipReason`); two CLI tests (break-checked); CLI tests now run a copy under node_modules

### F4 — The README's CI auth recipe (`preinstall` one-liner) cannot work

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/ai-toolkit/README.md (Install → "In CI")
- **Detail**:
  - The spec's `preinstall` helper, which the plan chose to document rather than auto-add, appends the auth line from the consumer's root `preinstall`.
  - npm 7+ runs the root project's `preinstall` only after the dependencies have been fetched and reified. `npm ci` therefore reaches GitHub Packages without the token and fails with 401.
  - This is a flaw in the course spec that the plan carried over.
- **Fix**: Replace the recipe with one that works:
  - in GitHub Actions, `actions/setup-node` with `registry-url: https://npm.pkg.github.com`, `scope: "@41mariusz"` and `NODE_AUTH_TOKEN: ${{ secrets.GH_PKG_TOKEN }}`;
  - elsewhere, a step that writes the auth line to the CI user's `.npmrc` before `npm ci`.

  Note that the spec's one-liner runs too late on npm 7+.

- **Decision**: FIXED — README CI recipe replaced by setup-node registry-url + NODE_AUTH_TOKEN (or ~/.npmrc before npm ci), with why preinstall is too late

### F5 — README overclaims what uninstall and reinstall keep

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/ai-toolkit/README.md ("Uninstall"); install.js:126; uninstall.js:31-32
- **Detail**:
  - The README says uninstall "never deletes … files it did not install".
  - Both reinstall and uninstall `rmSync` the whole managed `.claude/skills/<name>/`. A file the user added inside `.claude/skills/team-code-review/`, or a local edit to `SKILL.md`, is lost.
  - Ownership is by directory, which is a reasonable design, but the docs must say so.
- **Fix**: Reword the README. Managed skill directories belong to the toolkit, and any local changes inside them are replaced on reinstall and removed on uninstall. To customise a skill, copy it under another name.
- **Decision**: FIXED — README: managed skill directories belong to the toolkit; uninstall list spelled out

### F6 — Edge cases in `CLAUDE.md`: dangling symlink, non-UTF-8 bytes, CRLF

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/ai-toolkit/install.js:104,136; uninstall.js:27,33
- **Detail**:
  - A dangling `CLAUDE.md` symlink is treated as missing, and `writeFileSync` creates its target outside the project.
  - Latin-1 bytes are rewritten as U+FFFD and cannot be restored.
  - With CRLF files, the block is LF-only, and uninstall leaves a stray blank line.
  - All three were reproduced by the safety agent.
- **Fix**:
  - Check `lstatSync`, and refuse with a ToolkitError when `CLAUDE.md` is a symlink whose target is missing or outside the root.
  - Decode with `TextDecoder("utf-8", { fatal: true })`, and refuse invalid UTF-8 with a ToolkitError.
  - Leave CRLF as is (document it).
- **Decision**: FIXED — `readClaudeMd` refuses a dangling/outside symlink and invalid UTF-8 (ToolkitError), used by install and uninstall; manifest `null` now a ToolkitError; CRLF documented; tests for symlink, UTF-8, null manifest

### F7 — Skip-if-published is not proven live

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/shared-ai-toolkit/publish-results.md ("Skip-if-published")
- **Detail**:
  - Phase 4 §1 expects a run with an unchanged version to show the "already published" notice. The optional re-run was not done; no Progress row claims it.
  - The logic is sound: the installed npm throws E404 for a missing version (`lib/commands/view.js:190`).
- **Fix**: Re-run the `Publish AI Toolkit` run 38604604264 ("Re-run all jobs") and record the notice in `publish-results.md`.
- **Decision**: FIXED — proven live: run #39247763782 for the review-fix push (version 0.1.0 unchanged) ended `publish` with "already published; skipping"; recorded in publish-results.md

### F8 — consumer-check prints raw multi-line errors

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: packages/ai-toolkit/scripts/consumer-check.mjs:16,62
- **Detail**:
  - The `::error` line uses an unescaped, multi-line `error.message`, so GitHub cuts the annotation at the first line. `scripts/check-cloud-migrations.mjs` escapes `%`, `\r` and `\n` instead.
  - A missing tarball crashes with a raw stack (the `tar` call sits outside `try`). This was seen during this review, when a stale scratch path was passed.
- **Fix**:
  - Escape the annotation the way the repo's script does.
  - Check that the tarball exists, exiting 2 with a usage message before calling `tar`.
- **Decision**: FIXED — annotations escaped like scripts/check-cloud-migrations.mjs; missing tarball exits 2 with usage

### F9 — Publish workflow has no concurrency group

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/publish-ai-toolkit.yml (`publish` job)
- **Detail**: Two quick pushes with a new version can race. The second gets a 409 and turns red, even though the version was published.
- **Fix**: Add `concurrency: { group: publish-ai-toolkit, cancel-in-progress: false }` to the `publish` job, the same pattern as `deploy` in `ci.yml`.
- **Decision**: FIXED — `concurrency: publish-ai-toolkit` (no cancel) on the publish job

### F10 — Repo rules in the conventions cite their source only once

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/ai-toolkit/skills/team-code-review/references/conventions.md
- **Detail**:
  - The plan says the rules taken from `CLAUDE.md` or `lessons.md` "cite the file". Only the "errors leave a signal" rule names `lessons.md`; the others rely on the general note at the top.
  - The skill also names this repo's paths (`src/lib/domain/`, `src/types.ts`), which a generic consumer will not have. That follows from the owner's "adapted to this repo" decision.
- **Fix**: Add the source (`CLAUDE.md` § or `lessons.md`) after each **(repo rule)** marker.
- **Decision**: FIXED — every (repo rule) marker in conventions.md now names its source (CLAUDE.md § / lessons.md / test-plan.md)
