# Publish results — @41mariusz/ai-toolkit (2026-10-14)

## Release run

| What                      | Value                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Commit                    | `d20c214` (pushed by the owner, `02aa283..d20c214`)                                                                                     |
| Workflow run              | `Publish AI Toolkit` #38604604264: https://github.com/41mariusz/applications-tracker/actions/runs/38604604264                           |
| `validate`                | success. Every step was green: metadata + frontmatter, `npm test`, `npm pack --dry-run`, and the tarball install in a scratch consumer. |
| `publish`                 | success, with the annotation `published @41mariusz/ai-toolkit@0.1.0`                                                                    |
| Published version         | `0.1.0`                                                                                                                                 |
| Package page              | https://github.com/41mariusz/applications-tracker/pkgs/npm/ai-toolkit                                                                   |
| App CI on the same commit | `CI` #38604604406 (lint, tests, smoke, deploy), run alongside                                                                           |

## Skip-if-published

No run with an unchanged version has happened yet. The results commit does not touch `packages/ai-toolkit/`, so it does not trigger the workflow. Evidence comes from re-running the workflow; see the owner checklist below.

## Local evidence before the release

`npm pack` followed by `node scripts/consumer-check.mjs <tarball>` (npm 11.19.0, Node 24.21.0) passed with these steps:

1. postinstall copied the skill;
2. there was one managed block;
3. the consumer's own text was kept;
4. the manifest records 0.1.0;
5. a second install still left one block;
6. uninstall restored `CLAUDE.md`.

npm 11 warns that the toolkit's `postinstall` is "not yet covered by allowScripts", and still runs it.

## Owner checks (Phase 4 manual)

- [x] 4.3 Install `0.1.0` from GitHub Packages into a scratch consumer.
- [x] 4.4 Ask Claude Code to "review my changes" there, and check that `team-code-review` answers in the spec format.
- [x] 4.5 Open the package page and check that it is linked to `41mariusz/applications-tracker`.
- [ ] Optional skip evidence: on the run page, use **Re-run all jobs**; the `publish` job should end with the notice "already published; skipping".

### 4.3 Consumer install (2026-10-15)

- **Consumer:** `~/ai-toolkit-consumer`, a fresh `npm init` and `git init`.
- **Committed `.npmrc`:** only `@41mariusz:registry=https://npm.pkg.github.com`, with no `_authToken`.
- **Auth:** the owner's classic token with `read:packages`, set through `npm login` in a separate terminal and stored in the user-level `~/.npmrc`. `npm whoami` → `41mariusz`.
- **First attempt:** the in-session `!` shell cannot answer `npm login` prompts, so the first try got `E401 … authentication token not provided`. Logging in from a real terminal fixed it.
- **Install:** `npm install --save-dev @41mariusz/ai-toolkit@0.1.0`. In `package-lock.json`, `resolved` is `https://npm.pkg.github.com/download/@41mariusz/ai-toolkit/0.1.0/…`. npm 11.19 printed the allowScripts warning, and `postinstall` ran anyway.
- **Result:**
  - `.claude/skills/team-code-review/` is in place;
  - `CLAUDE.md` holds exactly 1 managed block;
  - the manifest has `version: 0.1.0`, skill `team-code-review`, and the files `SKILL.md`, `references/conventions.md` and `CLAUDE.md (managed block)`.

### 4.4 Skill in use (2026-10-15)

- **Setup:** the staged diff was a new `load.js` with planted problems: an empty `catch {}`, no `res.ok` check, an e-mail in a `console.log`, a 5-parameter function, an unhandled `fetch`.
- **Run:** the owner ran `claude` in the consumer and typed "review my changes". The transcript (`~/.claude/projects/-home-dev-ai-toolkit-consumer/`) shows `Skill: team-code-review` invoked, not the built-in `code-review`. It then read `references/conventions.md` and `git diff --cached`.
- **Output in the spec format:**
  - **Critical (4):** `load.js:5` empty catch; `load.js:3-4` no `res.ok`; `load.js:9` e-mail in the log; `load.js:10-13` unhandled fetch.
  - **Warning (5):** unchecked external JSON, 5 parameters, an unencoded `userId` in the URL, the file outside the layers / `apiRequest`, no tests.
  - **Suggestion (3):** hard-coded base URL; `res` abbreviation; missing `Content-Type`, labelled "preference, not covered by the conventions".
  - Each finding has `file:line` and the convention it breaks.
- **Recommendation:** `REQUEST CHANGES`.
- **Verdict:** every planted problem was found. The skill used the repo's adapted rules (`logError`, `apiRequest`, zod, `src/types.ts`) instead of generic advice.

### 4.5 Package page (2026-10-15)

The owner sees `ai-toolkit` in the **Packages** section of `41mariusz/applications-tracker`, so the `repository` field (`directory: packages/ai-toolkit`) linked the package to the repo on the first publish. The skip-if-published re-run (optional) was not done.
