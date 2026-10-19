# Shared AI Toolkit on GitHub Packages — Plan Brief

> Full plan: `context/changes/shared-ai-toolkit/plan.md`

## What & Why

Course lesson M5L4, "Shared AI Registry", default path (Zadanie 3). The team's AI artifacts are packaged as the npm package `@41mariusz/ai-toolkit` and published to GitHub Packages, so any repo can install them with `npm install` instead of copying skills and rules by hand. The artifacts are a code-review skill and a rules block for `CLAUDE.md`.

## Starting Point

- The course specs live in `.claude/prompts/m5l4-*`.
- This repo has no packages directory and no publishing workflow.
- Its CI already uses SHA-pinned `checkout` and `setup-node` (in `review.yml` and the reviewer action), and the repo is public.

## Desired End State

- `packages/ai-toolkit/` holds the skill (`team-code-review` + adapted conventions), the rules, an idempotent installer and an uninstaller.
- `publish-ai-toolkit.yml` validates the package on every relevant PR or push and publishes new versions on `main`.
- The owner has installed the published `0.1.0` into a scratch consumer and seen the skill work there.

## Key Decisions Made

| Decision                  | Choice                                                                               | Why (1 sentence)                                                                    | Source       |
| ------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------ |
| Location                  | `packages/ai-toolkit/` in this repo, paths-filtered workflow                         | No new repo to create; all certification evidence in one place                      | Owner        |
| Package name              | `@41mariusz/ai-toolkit`                                                              | GitHub Packages requires the owner's scope                                          | Owner (fact) |
| Skill name                | `team-code-review`                                                                   | Claude Code's built-in `code-review` would be shadowed                              | Owner        |
| Conventions               | Course handout adapted to this repo's rules, each change marked                      | The spec says to adapt; reviews here stay relevant                                  | Owner        |
| Consumer proof            | Tarball check in CI + owner's install of the published version in a scratch consumer | Proves the installer without the app consuming it or needing a read token in app CI | Owner        |
| Postinstall errors        | Warning and exit 0 under `postinstall`; exit 1 when run by hand                      | Spec: never fail the consumer's `npm install`                                       | Plan         |
| `preinstall` token helper | Documented in the README, not auto-added                                             | Optional in the spec; editing a consumer's `package.json` is invasive               | Plan         |
| Tests                     | `node:test`, with no deps and no lockfile                                            | The spec forbids dependencies; works in CI without `npm ci`                         | Plan         |

## Scope

**In scope:**

- Skill, conventions, rules, `package.json`, README
- `install.js` / `uninstall.js` with the sentinel rule, a manifest and a development-checkout skip
- `node:test` suite; local `validate-package.mjs` and `consumer-check.mjs`
- `publish-ai-toolkit.yml` (validate → publish, skip if the version exists)
- One line each in `CLAUDE.md` (CI, Commands)
- First live publish and the recorded results

**Out of scope:**

- AWS / CodeArtifact / Terraform
- The app repo consuming the package
- Changes to `ci.yml` / `review.yml` / the reviewer agent
- Automated versioning

## Architecture / Approach

```
packages/ai-toolkit/
  skills/team-code-review/{SKILL.md, references/conventions.md}
  rules/CLAUDE.md
  install.js, uninstall.js
  test/, scripts/ (not published)
          │
          ▼  publish-ai-toolkit.yml
          │  validate: metadata · frontmatter · node --test · npm pack · tarball install in scratch consumer
          │  publish (main only): npm view → skip, or npm publish
          ▼
GitHub Packages
          │
          ▼  consumer: npm install @41mariusz/ai-toolkit
.claude/skills/ + one CLAUDE.md block + .claude/.ai-toolkit-manifest.json
```

## Phases at a Glance

| Phase                                   | What it delivers                                                     | Key risk                                                              |
| --------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Toolkit content and metadata         | Skill, adapted conventions, rules, `package.json`, README            | Conventions drift from the real repo rules; the owner reviews them    |
| 2. Installer and uninstaller with tests | Idempotent install, sentinel stop, manifest, uninstall; lint wiring  | Clobbering a consumer's own files; guarded by tests                   |
| 3. Publish workflow and consumer check  | Validate + publish pipeline, local check scripts, docs               | `npm view` errors mistaken for "not published"; only `E404` publishes |
| 4. Live publish and consumer proof      | `0.1.0` on GitHub Packages, installed by the owner, results recorded | Package permissions on the first publish (GitHub settings)            |

**Prerequisites:**

- The owner pushes to `main` (auto mode blocks agent pushes).
- For Phase 4, the owner has a GitHub token with `read:packages`.

**Estimated effort:** ~1–2 sessions across 4 phases.

## Open Risks & Assumptions

- Package visibility and linking on the first publish come from GitHub. If the package ends up private or unlinked, it is fixed in the package settings, not in the code.
- The skill triggers on its description. If Claude Code prefers the built-in `code-review` for "review my changes", the trigger phrases may need tuning (seen in 4.4).

## Success Criteria (Summary)

- One `npm install` puts the team skill and rules into any repo; a second install changes nothing; uninstall cleans up exactly.
- Every package change is validated in CI, including a real install, and new versions publish themselves on `main`.
- The published package works in a real consumer.
