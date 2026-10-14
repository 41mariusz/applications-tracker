# Shared AI Toolkit on GitHub Packages — Implementation Plan

## Overview

Course lesson M5L4, "Shared AI Registry", default path (Zadanie 3). Package the team's AI artifacts as the npm package `@41mariusz/ai-toolkit` and publish it to GitHub Packages from `packages/ai-toolkit/` in this repo. The artifacts are a `team-code-review` skill built from the course conventions handout adapted to this repo, plus a rules block for `CLAUDE.md`. An idempotent installer puts them into any consumer repo on `npm install`, and a dedicated workflow validates and publishes the package.

## Current State Analysis

- **Course inputs** (`.claude/prompts/`):
  - `m5l4-github-packages-spec-pack.md`: package metadata, required files, installer behaviour, sentinel markers, auth rules.
  - `m5l4-github-packages-spec-cicd.md`: workflow name, permissions, validation, skip-if-published, pinned actions.
  - `m5l4-shared-spec-skill.md`: skill frontmatter, categories, output format.
  - `m5l4-shared-conventions.md`: the conventions to adapt.
- **Owner decisions** (2026-10-14, `context/changes/shared-ai-toolkit/change.md`):
  - The package lives in this repo at `packages/ai-toolkit/`, with a paths-filtered workflow.
  - Scope is `@41mariusz`, because GitHub Packages requires the owner's scope.
  - The skill is named `team-code-review`, because Claude Code already ships a built-in `code-review` skill that the spec's name would shadow.
  - Conventions are the handout adapted to this repo.
  - Installation is proven in a scratch consumer and a CI tarball check. The app repo does not consume the package.
- **Repo constraints:**
  - The root `eslint .` lints `**/*.{js,jsx,ts,tsx}` with type-checked rules (`eslint.config.js:43`). Only `scripts/**/*.mjs` gets the untyped Node block (`eslint.config.js:77-93`).
  - The root `tsconfig.json` includes `**/*`, so `astro check` would type the package's `.js` files.
  - The root Vitest includes only `src/**/*.test.ts` and `scripts/**/*.test.mjs` (`vitest.config.ts`).
  - lint-staged covers `*.{ts,tsx,astro,mjs}`, not `.js`.
  - The repo is public, and its default branch is `main`.
  - The pinned SHAs from the spec are already used here: `actions/checkout@3d3c42e…` v7.0.1 in `.github/workflows/review.yml:56`, and `actions/setup-node@949feb2…` v7.1.0 in `.github/actions/ai-reviewer/action.yml:54`.
- **GitHub Packages:**
  - Installing from `npm.pkg.github.com` always requires auth, even for public packages. Only the owner, with a `read:packages` token, can prove installation of the _published_ package.
  - CI proves the installer on a local `npm pack` tarball.
- **Workflow:** auto mode blocks agent pushes to `main`. The owner runs the push that triggers the first publish.

## Desired End State

- `packages/ai-toolkit/` contains:
  - `package.json`;
  - `README.md`;
  - `install.js` and `uninstall.js`;
  - `skills/team-code-review/SKILL.md`, plus its adapted conventions in `skills/team-code-review/references/conventions.md`;
  - `rules/CLAUDE.md`;
  - development-only `test/` and `scripts/`, which are not published.
- `npm install @41mariusz/ai-toolkit` in a consumer:
  - copies the skill into `.claude/skills/team-code-review/`;
  - adds exactly one managed rules block to `CLAUDE.md`;
  - writes `.claude/.ai-toolkit-manifest.json`.
- Running it again changes nothing structurally.
- `ai-toolkit-uninstall` removes exactly what was installed.
- `.github/workflows/publish-ai-toolkit.yml`:
  - validates on PRs and pushes that touch the package;
  - publishes `0.1.0` on the first push to `main`;
  - skips later pushes that keep the same version.

### Key Discoveries:

- `npm` sets `INIT_CWD` to the directory where `npm install` was run. That is the consumer root for `postinstall`. When it resolves to the package's own directory (a development checkout), the installer must do nothing.
- `npm view <name>@<version>` exits with `E404` for a version not yet published. That case means "publish". Any other failure must fail the job, not silently publish or skip.
- npm creates the `bin` entries as symlinks. The "run as CLI" guard in `install.js` must compare `realpath`s, not raw `process.argv[1]`.
- The `repository` field (`url` + `directory: packages/ai-toolkit`) is what links a GitHub Packages npm package to its repo.

## What We're NOT Doing

- No AWS, CodeArtifact or Terraform; the Model 2 appendices and the `pack-init` / `setup-cicd` / `tf-registry` skills are not used.
- No consumption in this app repo:
  - no `.npmrc`;
  - no dependency;
  - no managed block in this repo's `CLAUDE.md`;
  - no `GH_PKG_TOKEN` in the app CI.
- No automatic `preinstall` token helper written into consumer `package.json` files. The spec makes it optional, and editing someone else's `package.json` from a `postinstall` is invasive. The README documents the one-liner for CI instead.
- No changes to `ci.yml`, `review.yml`, the AI reviewer agent or the app code.
- No automated version bumping or changelog. A new release is a manual `version` bump in `package.json`.
- Skill name `code-review` from the spec is not used (see owner decision); the validation checks `skills/team-code-review/`.

## Implementation Approach

The package stays dependency-free and lockfile-free, as the spec requires. All behaviour lives in two ESM scripts, using Node `>=22` built-ins only.

The installer is a small set of exported functions with a thin CLI wrapper, so `node:test` exercises them directly on temporary consumer directories. The workflow reuses two package-local development scripts, `scripts/validate-package.mjs` and `scripts/consumer-check.mjs`, so every CI check can also be run locally before pushing.

## Critical Implementation Details

- **Never clobber unmanaged content:**
  - An existing `.claude/skills/<name>/` that the manifest does not list is left alone, and a warning is printed.
  - Text outside the sentinel block in `CLAUDE.md` is preserved byte for byte.
- **Sentinel rule:**
  - Exactly one `BEGIN` followed by exactly one `END` means: replace the content between them.
  - No markers at all means: append the block.
  - Anything else means: stop with a message naming the problem and the file, and change nothing. That covers one marker, duplicates, or `END` before `BEGIN`.
- **Failure mode:**
  - Under `npm_lifecycle_event === "postinstall"`, any error is printed as a warning and the process exits 0, so the consumer's `npm install` never fails because of the toolkit.
  - Run directly (`ai-toolkit`, `ai-toolkit-uninstall`), errors exit 1.
- **The first publish happens on the owner's push.** If that publish fails because of package permissions, the fix lies in GitHub package settings, not in the code (see Phase 4).

## Phase 1: Toolkit Content and Package Metadata

### Overview

Write the artifacts the toolkit distributes and the package manifest, so that `npm pack` produces the intended file set.

### Changes Required:

#### 1. Adapted conventions

**File**: `packages/ai-toolkit/skills/team-code-review/references/conventions.md`

**Intent**: The review standard, taken from `m5l4-shared-conventions.md` and adapted to this repo's real rules, as the spec asks ("treat it as a starter").

**Contract**:

- It keeps the handout's six sections: Naming, Error Handling, TypeScript, Functions, Security, Testing.
- Each rule changed or added for this repo is marked "(adapted)" or "(repo rule)". Examples:
  - file naming: kebab-case modules, PascalCase components;
  - errors leave a signal, through `logError` / `failureResponse` / `toServiceError`, with no bare `console.error` and no empty catch;
  - zod at API boundaries;
  - no PII in logs;
  - only the publishable Supabase key in the app;
  - business rules in `src/lib/domain/` with tests, Supabase access in `src/lib/services/`;
  - design tokens instead of literal colours;
  - smoke extended per feature.
- Rules sourced from `CLAUDE.md` / `context/foundation/lessons.md` cite the file.

#### 2. Skill

**File**: `packages/ai-toolkit/skills/team-code-review/SKILL.md`

**Intent**: An Agent Skill that reviews a diff or files against `references/conventions.md`, without inventing its own standard.

**Contract**:

- YAML frontmatter:
  - `name: team-code-review`;
  - `description` = the spec's description, plus the trigger phrases "review code", "check this PR", "review my changes", "team code review".
- Review categories: Naming, Error handling, TypeScript, Function design, Security, Testing.
- Findings are grouped Critical → Warning → Suggestion, each with `file:line` where possible.
- It ends with exactly one of `APPROVE`, `REQUEST CHANGES`, `NEEDS DISCUSSION`.
- It tells the agent to read `references/conventions.md` first and to review only what changed.

#### 3. Rules block

**File**: `packages/ai-toolkit/rules/CLAUDE.md`

**Intent**: The short team rules that the installer places between the sentinel markers in a consumer's `CLAUDE.md`.

**Contract**:

- At most about 20 lines, with no sentinel markers itself (the installer adds them).
- It says to run `team-code-review` before opening a PR.
- It summarises the non-negotiables:
  - errors leave a signal;
  - validate at boundaries;
  - no secrets or PII in logs;
  - tests proportional to risk.
- It points to `.claude/skills/team-code-review/references/conventions.md`.

#### 4. Package manifest and README

**File**: `packages/ai-toolkit/package.json`, `packages/ai-toolkit/README.md`

**Intent**: The publishable package definition from the spec (with the owner scope), and consumer-facing docs.

**Contract**:

- `package.json`:
  - `name: @41mariusz/ai-toolkit`, `version: 0.1.0`, `description`, `license: UNLICENSED`, `type: module`;
  - `repository: { type: "git", url: "git+https://github.com/41mariusz/applications-tracker.git", directory: "packages/ai-toolkit" }`;
  - `publishConfig.registry: https://npm.pkg.github.com`;
  - `files: ["skills/", "rules/", "install.js", "uninstall.js", "README.md"]`;
  - `scripts.postinstall: node install.js`, `scripts.test: node --test test/`;
  - _Implementation note (2026-10-14): `node --test test/` resolves the directory as a module (`MODULE_NOT_FOUND`), so the script is `node --test "test/*.test.mjs"`; Node 22+ expands the glob itself._
  - `bin: { "ai-toolkit": "./install.js", "ai-toolkit-uninstall": "./uninstall.js" }`;
  - `engines.node: ">=22"`;
  - no dependencies.
- README:
  - what is distributed, and why the name is `team-code-review`;
  - consumer `.npmrc` with only `@41mariusz:registry=https://npm.pkg.github.com`, never a token;
  - auth: `npm login --scope=@41mariusz --registry=https://npm.pkg.github.com` or a user-level `.npmrc` with a `read:packages` token locally, and a `GH_PKG_TOKEN` secret in CI with the spec's `preinstall` one-liner documented (not auto-added);
  - what install and uninstall do, and the sentinel rule;
  - releasing means bumping `version`;
  - development: `npm test`.

### Success Criteria:

#### Automated Verification:

- `npm pack --dry-run --json` in `packages/ai-toolkit` lists only `package.json`, `README.md`, and files under `skills/` and `rules/` (no `test/`, no `scripts/`)
- `skills/team-code-review/SKILL.md` frontmatter has `name: team-code-review` (equal to its directory) and a non-empty `description`
- `npm run lint` at the repo root still passes

#### Manual Verification:

- Owner reads `references/conventions.md` and agrees the adaptations reflect this repo's rules

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 2: Installer, Uninstaller and Their Tests

### Overview

Implement the idempotent installer and the uninstaller per the spec, cover them with `node:test`, and wire the package into the root lint without type-checking it.

### Changes Required:

#### 1. Installer

**File**: `packages/ai-toolkit/install.js`

**Intent**: Install the toolkit's skills and rules into the consumer project.

**Contract**:

- `#!/usr/bin/env node`, ESM, Node built-ins only.
- Exports `install({ root, packageDir })`, which returns a summary. A CLI wrapper runs only when the file is executed directly (realpath comparison with `process.argv[1]`).
- Root: `INIT_CWD`, falling back to `cwd`. If the root is the package directory or inside it, print "development checkout, nothing to install" and do nothing.
- Copies each `skills/<name>/` to `<root>/.claude/skills/<name>/`, replacing it only if the previous manifest lists it. Otherwise it warns and skips that skill.
- Writes the `rules/CLAUDE.md` content between `<!-- BEGIN @41mariusz/ai-toolkit -->` and `<!-- END @41mariusz/ai-toolkit -->` per the sentinel rule (Critical Implementation Details). It creates `CLAUDE.md` if it is missing.
- Writes `<root>/.claude/.ai-toolkit-manifest.json`: `{ package, version, installedAt, skills, files }`. `version` is read from the package's own `package.json` at runtime.
- Failure mode as in Critical Implementation Details.

#### 2. Uninstaller

**File**: `packages/ai-toolkit/uninstall.js`

**Intent**: Remove exactly what the manifest says was installed.

**Contract**:

- Exports `uninstall({ root })` plus the same CLI guard and failure mode.
- Removes the manifest-listed skill directories, removes the managed block only when the markers are well-formed (otherwise it stops with the sentinel message), and deletes the manifest.
- It never deletes `CLAUDE.md` or unlisted files.
- Without a manifest it prints "nothing installed" and exits 0.

#### 3. Tests

**File**: `packages/ai-toolkit/test/install.test.mjs`

**Intent**: Pin the spec's installer guarantees on temporary consumer directories (`mkdtemp`).

**Contract**: one test per behaviour:

- **Fresh install:** the skill files are copied, the block appears exactly once, and the manifest `version` equals `package.json`'s.
- **Second install is idempotent:** still one block, its content refreshed, and text outside the block unchanged.
- **One `BEGIN` marker only:** install throws a message naming the marker and `CLAUDE.md`, and the file bytes stay unchanged.
- **Unmanaged `.claude/skills/team-code-review/`:** left untouched, and a warning is returned.
- **Root equal to the package directory:** nothing is written.
- **Postinstall mode:** running the CLI as a child process with `npm_lifecycle_event=postinstall` on a broken `CLAUDE.md` exits 0 with a warning; without it, it exits 1.
- **Uninstall:** removes the skill, the block and the manifest, and keeps user content.

#### 4. Lint and typecheck wiring

**File**: `eslint.config.js`, `tsconfig.json`

**Intent**: Lint the package's scripts like the repo's other Node scripts, and keep them out of `astro check`.

**Contract**:

- `scriptsConfig.files` also covers `packages/ai-toolkit/**/*.{js,mjs}`. Add any missing Node globals it needs (e.g. `URL`), with no rule relaxations beyond the existing block.
- Root `tsconfig.json` `exclude` gains `packages/ai-toolkit`.

### Success Criteria:

#### Automated Verification:

- `npm test` in `packages/ai-toolkit` passes (all installer and uninstaller tests)
- Breaking the sentinel rule in `install.js` (appending a second block instead of replacing) makes `npm test` fail; restoring makes it pass
- `npm run lint` at the repo root passes and reports `packages/ai-toolkit/install.js` as linted (e.g. `npx eslint packages/ai-toolkit --max-warnings=0`)
- `npx astro check` and `npm test` at the repo root still pass

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 3: Publish Workflow and Consumer Check

### Overview

Add `publish-ai-toolkit.yml`, which validates the package (including a real `npm install` of the packed tarball into a scratch consumer) on PRs and pushes, and publishes new versions to GitHub Packages on `main`.

### Changes Required:

#### 1. Development scripts (not published)

**File**: `packages/ai-toolkit/scripts/validate-package.mjs`, `packages/ai-toolkit/scripts/consumer-check.mjs`

**Intent**: Make every CI check runnable locally and keep the workflow YAML short.

**Contract**:

- `validate-package.mjs` exits 1 with a named failure unless all of these hold:
  - `package.json` has `name`, `version` and `publishConfig.registry`;
  - `skills/team-code-review/SKILL.md` exists;
  - its frontmatter has `name` and `description`;
  - the frontmatter `name` equals the directory name, for every `skills/*/`.
- `consumer-check.mjs <tarball>`:
  - creates a temp consumer (`npm init -y`) and runs `npm install <tarball>` there, so the real `postinstall` and `INIT_CWD` path runs;
  - asserts the skill directory, exactly one managed block and the manifest version;
  - runs `npx ai-toolkit` again and asserts there is still one block;
  - runs `npx ai-toolkit-uninstall` and asserts the managed artifacts are gone.

#### 2. Workflow

**File**: `.github/workflows/publish-ai-toolkit.yml`

**Intent**: The spec's validate → publish pipeline, scoped to the package.

**Contract**:

- **Triggers:** `push` and `pull_request` on `main` and `master`, both with `paths: [packages/ai-toolkit/**, .github/workflows/publish-ai-toolkit.yml]`.
- **Defaults:** workflow-level `permissions: contents: read`; `defaults.run.working-directory: packages/ai-toolkit`.
- **Pinned actions:** checkout `3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`, setup-node `949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0`; Node `24`.
- **`validate` job**, with no `npm ci` (no deps, no lockfile):
  - `node scripts/validate-package.mjs`
  - `npm test`
  - `npm pack --dry-run`
  - `npm pack`
  - `node scripts/consumer-check.mjs <tarball>`
- **`publish` job:**
  - runs with `needs: validate` and `if: github.event_name == 'push'`;
  - has job `permissions: contents: read, packages: write`;
  - uses setup-node with `registry-url: https://npm.pkg.github.com`, `scope: "@41mariusz"`;
  - first runs a skip check: `npm view "$NAME@$VERSION" version` with `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. If the version is found, emit `::notice` and skip. On `E404` publish. On any other error, fail.
  - then runs `npm publish --ignore-scripts` with the same token.
- **Hygiene:** no AWS / OIDC / `id-token`. `NAME` and `VERSION` are read from `package.json` via `node -p`, never interpolated from event data.

#### 3. Docs

**File**: `CLAUDE.md`

**Intent**: Point agents at the toolkit and its workflow.

**Contract**:

- Add one line in **CI** describing `publish-ai-toolkit.yml`: its paths filter, validate (including the tarball consumer check), and publish with skip-if-published to `@41mariusz/ai-toolkit` on GitHub Packages.
- Add one line in **Commands** for `packages/ai-toolkit`: `npm test`, its local checks, and that the app does not consume it.

### Success Criteria:

#### Automated Verification:

- `node scripts/validate-package.mjs` in `packages/ai-toolkit` passes; renaming the frontmatter `name` makes it fail with a named message; restoring makes it pass
- `npm pack` then `node scripts/consumer-check.mjs <tarball>` in `packages/ai-toolkit` passes locally
- The workflow YAML parses, and every `uses:` line in it is pinned to a 40-character SHA: `node -e` over the file, or `grep -E 'uses: .+@[0-9a-f]{40} #'` matching every `uses:` line
- `npm run lint` at the repo root still passes

#### Manual Verification:

- Owner reads the workflow and agrees on permissions (read-only by default, `packages: write` only in `publish`) and the paths filter

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 4: Live Publish and Consumer Proof

### Overview

The owner pushes, the workflow publishes `0.1.0`, and the owner installs the published package into a scratch consumer with their own `read:packages` token. The outcome is recorded.

### Changes Required:

#### 1. Release run (owner action)

**File**: none (owner runs `git push` to `main`)

**Intent**: The first real publish through the workflow.

**Contract**:

- The `publish-ai-toolkit` run on `main` succeeds with `validate` and `publish` green.
- A later push that keeps `0.1.0` (e.g. the results-record commit, if it touches the package; otherwise a re-run) shows the "already published, skipping" notice.

#### 2. Results record

**File**: `context/changes/shared-ai-toolkit/publish-results.md`

**Intent**: Keep evidence for the certification and later readers.

**Contract**:

- Workflow run IDs and URLs with their job results.
- The published version and the package page URL.
- The skip-if-published evidence.
- The consumer-install transcript summary: the commands run, the files created and the manifest content, with no tokens.
- The owner's observation of `team-code-review` running in the consumer.

### Success Criteria:

#### Automated Verification:

- The `Publish AI Toolkit` run for the release commit on `main` has `validate` and `publish` concluded `success` (GitHub API `actions/runs?head_sha=…`)
- `context/changes/shared-ai-toolkit/publish-results.md` exists with run IDs, version and package URL

#### Manual Verification:

- In a scratch consumer, the owner installs `@41mariusz/ai-toolkit@0.1.0` from GitHub Packages, using a committed-style `.npmrc` with the registry mapping only, plus their own token: `npm login` or a user-level `.npmrc`. Then `.claude/skills/team-code-review/`, one managed `CLAUDE.md` block and the manifest are present.
- In that consumer, asking Claude Code to "review my changes" on a small diff triggers `team-code-review`, which answers in the spec's format: severities, `file:line`, and a final recommendation.
- The package page on GitHub shows the package linked to `41mariusz/applications-tracker`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual checks were successful.

---

## Testing Strategy

### Unit Tests:

- `node:test` on temporary consumer directories:
  - fresh install;
  - idempotent re-install;
  - the single-marker stop;
  - an unmanaged skill directory;
  - the development-checkout skip;
  - postinstall vs. CLI exit codes;
  - uninstall.

### Integration Tests:

- `scripts/consumer-check.mjs` runs a real `npm install` of the packed tarball in a scratch consumer (locally and in CI), followed by `npx ai-toolkit` and `npx ai-toolkit-uninstall`.

### Manual Testing Steps:

1. `cd packages/ai-toolkit && npm test && npm pack && node scripts/consumer-check.mjs <tarball>`.
2. After the release push, check the workflow run and the package page.
3. Do a scratch consumer install of the published version with your token, then trigger `team-code-review` there.

## Performance Considerations

Not applicable. The package is a few kilobytes of Markdown and two scripts, and the workflow runs only when the package or the workflow changes.

## Migration Notes

Not applicable: no database or app changes.

## References

- Specs: `.claude/prompts/m5l4-github-packages-spec-pack.md`, `m5l4-github-packages-spec-cicd.md`, `m5l4-shared-spec-skill.md`, `m5l4-shared-conventions.md`
- Decisions: `context/changes/shared-ai-toolkit/change.md`
- Pinned actions already in use: `.github/workflows/review.yml:56`, `.github/actions/ai-reviewer/action.yml:54`
- Lint and typecheck scope: `eslint.config.js:43,77-93`, `tsconfig.json`, `vitest.config.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Toolkit Content and Package Metadata

#### Automated

- [x] 1.1 `npm pack --dry-run --json` in `packages/ai-toolkit` lists only `package.json`, `README.md`, and files under `skills/` and `rules/` (no `test/`, no `scripts/`) — 9c155a3
- [x] 1.2 `skills/team-code-review/SKILL.md` frontmatter has `name: team-code-review` (equal to its directory) and a non-empty `description` — 9c155a3
- [x] 1.3 `npm run lint` at the repo root still passes — 9c155a3

#### Manual

- [x] 1.4 Owner reads `references/conventions.md` and agrees the adaptations reflect this repo's rules — 9c155a3

### Phase 2: Installer, Uninstaller and Their Tests

#### Automated

- [x] 2.1 `npm test` in `packages/ai-toolkit` passes (all installer and uninstaller tests)
- [x] 2.2 Breaking the sentinel rule in `install.js` (appending a second block instead of replacing) makes `npm test` fail; restoring makes it pass
- [x] 2.3 `npm run lint` at the repo root passes and reports `packages/ai-toolkit/install.js` as linted (e.g. `npx eslint packages/ai-toolkit --max-warnings=0`)
- [x] 2.4 `npx astro check` and `npm test` at the repo root still pass

### Phase 3: Publish Workflow and Consumer Check

#### Automated

- [ ] 3.1 `node scripts/validate-package.mjs` in `packages/ai-toolkit` passes; renaming the frontmatter `name` makes it fail with a named message; restoring makes it pass
- [ ] 3.2 `npm pack` then `node scripts/consumer-check.mjs <tarball>` in `packages/ai-toolkit` passes locally
- [ ] 3.3 The workflow YAML parses, and every `uses:` line in it is pinned to a 40-character SHA: `node -e` over the file, or `grep -E 'uses: .+@[0-9a-f]{40} #'` matching every `uses:` line
- [ ] 3.4 `npm run lint` at the repo root still passes

#### Manual

- [ ] 3.5 Owner reads the workflow and agrees on permissions (read-only by default, `packages: write` only in `publish`) and the paths filter

### Phase 4: Live Publish and Consumer Proof

#### Automated

- [ ] 4.1 The `Publish AI Toolkit` run for the release commit on `main` has `validate` and `publish` concluded `success` (GitHub API `actions/runs?head_sha=…`)
- [ ] 4.2 `context/changes/shared-ai-toolkit/publish-results.md` exists with run IDs, version and package URL

#### Manual

- [ ] 4.3 In a scratch consumer, the owner installs `@41mariusz/ai-toolkit@0.1.0` from GitHub Packages, using a committed-style `.npmrc` with the registry mapping only, plus their own token: `npm login` or a user-level `.npmrc`. Then `.claude/skills/team-code-review/`, one managed `CLAUDE.md` block and the manifest are present.
- [ ] 4.4 In that consumer, asking Claude Code to "review my changes" on a small diff triggers `team-code-review`, which answers in the spec's format: severities, `file:line`, and a final recommendation.
- [ ] 4.5 The package page on GitHub shows the package linked to `41mariusz/applications-tracker`
