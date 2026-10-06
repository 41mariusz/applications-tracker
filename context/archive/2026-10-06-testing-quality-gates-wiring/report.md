# Agent hooks — /10x-configure-hook report

Date: 2026-10-06. Test-plan Phase 4 ("Quality-gates wiring").

## Inputs

- **Test plan.** `context/foundation/test-plan.md`, §5 Quality Gates. Rows feeding the agent loop:
  - "lint + typecheck + UI-literal scan" (required, local + CI);
  - "unit (Vitest)" (required);
  - "post-edit / end-of-turn agent hooks" (recommended after §3 Phase 4; now required, in place);
  - "migration lint + compatibility smoke" (required, local + CI).

  The plan has no deferrals.

- **Harness: Claude Code.** Evidence: `.claude/skills/`, `CLAUDE.md`, `.claude/.10x-cli-manifest.json`, and this skill loaded from `.claude/skills/`. No `.cursor/`, `.codex/` or `.github/hooks/`. `.agents/skills/` was written by the 10x-cli (weak signal).
- **Toolchain** (timings measured on the untouched tree):
  - ESLint (`eslint.config.js`): `*.{js,jsx,ts,tsx}`, `scripts/**/*.mjs`, `*.astro`; `.claude/` globally ignored. One file takes 5.7 s (type-aware).
  - Vitest with a related mode. The whole suite took 1.3 s before this change and about 5 s with the hook test.
  - Typecheck: `astro check` takes 10.7 s, runs `astro sync` itself and covers `.astro` files. `tsc --noEmit` takes 5 s.
  - Repo checks: `scripts/check-ui-literals.mjs` and `scripts/check-migrations.mjs`.
  - Git hooks: husky + lint-staged (`eslint --fix`, `prettier --write` on staged files), left untouched.
  - **`jq` is not installed**, so the hooks are Node scripts instead of the reference's bash.
- **End-of-turn baseline:** green. Every check exited 0 on the untouched tree.

## Deferrals

None in the test plan.

## Audit

No existing hook config (`.claude/settings.json` and `.claude/hooks/` were absent) and no orphan scripts. Nothing replaced. `.claude/settings.json` is not gitignored (`git check-ignore` prints nothing).

## Configured (Claude Code)

`.claude/settings.json`. Commands find the script through `git rev-parse --show-toplevel`, with `$CLAUDE_PROJECT_DIR` only as a fallback:

| Event         | Matcher       | Script                          | Timeout | Checks                                                                                                                                                                                                                        |
| ------------- | ------------- | ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PostToolUse` | `Write\|Edit` | `.claude/hooks/after-edit.mjs`  | 60 s    | `eslint --quiet <file>` (no `--fix`); `vitest related <file> --run`; `node scripts/check-migrations.mjs` for `supabase/migrations/*.sql`                                                                                      |
| `Stop`        | —             | `.claude/hooks/end-of-turn.mjs` | 120 s   | Changed and untracked files from `git diff`: ESLint, UI-literal scan, migration lint (when a migration changed), whole `vitest run`, `astro check`. Docs-only turns are skipped. One retry (`stop_hook_active`, `loop_count`) |

Shared helpers live in `.claude/hooks/lib.mjs`:

- tolerant payload parsing (empty, invalid JSON and missing fields mean "nothing to check");
- plain output (`NO_COLOR`, ANSI stripped, because `astro check` colours regardless);
- checkout resolution from the edited file, with other repositories skipped;
- a per-session registry so sibling worktrees are swept;
- `block()`, which writes to stderr and exits 2.

Missing tools fail visibly through `npx --no-install`. End of turn takes about 17 s with real tools.

## Proof

- **Committed test.** `scripts/agent-hooks.test.mjs`, 17 cases, run by `npm test` (`vitest.config.ts` includes `scripts/**/*.test.mjs`).
- **How it runs.** Throwaway git repos; real git, Node and hook scripts. A fake `npx` on `PATH` stands in for eslint, vitest and astro check, reacting to `LINT_ERROR` / `TEST_FAIL` / `TYPE_ERROR` markers.
- **Cases covered:**
  - broken file, failing related test, migration lint;
  - clean file;
  - skipped type, missing file, empty / invalid / path-less payloads;
  - relative path;
  - other repository;
  - linter or typechecker missing;
  - Bash-written error swept at end of turn;
  - type error and test failure in one message;
  - retry flag;
  - nothing changed, docs only;
  - stale `CLAUDE_PROJECT_DIR`;
  - sibling worktree;
  - every `settings.json` command reachable from a worktree with a nonexistent `CLAUDE_PROJECT_DIR`.
- **Result:** 17/17 pass. The whole suite has 425 tests and `npm run lint` is clean.
- **Deliberate break.** Removing the `stop_hook_active` / `loop_count` guard turned "lets the agent finish on the retry" red. The guard was restored and the suite is green again.
- **Real-tool probe** in a throwaway worktree with `node_modules` linked:
  - an unused variable → after-edit exit 2 naming the file, and Stop exit 2;
  - a type error → Stop exit 2 (`astro check`, ts(2322));
  - a clean tree → exit 0;
  - the retry flag → exit 0.
- **Live in this session.** Writing `scripts/agent-hooks.test.mjs` made the PostToolUse hook report 4 prettier errors (exit 2), which were then fixed.

## Still required from the user

- **New sessions:** hooks in `.claude/settings.json` load at session start. Check them with `/hooks`, or with `claude --debug` for exit codes and output.
- **Cost:** each `Write`/`Edit` of a linted file costs about 6–10 s, and each turn that changed code about 15–20 s.

## Reference drift

None checked live (no browsing in this session). The reference is verified on 2026-09-25. The behaviour matched it: exit 2 + stderr reached the agent in this session.

## Out of reach

Lint, types and unit tests can pass while the running app is broken:

- a React island that never hydrates (`StatusControl`, `NotesPanel`, the sign-in form);
- middleware routing and the paused-project redirect;
- RLS and grants;
- the CV upload size limit in the Worker;
- the deploy gate against the cloud.

Those stay with:

- the HTTP smoke (`npm run smoke`);
- pgTAP;
- Playwright E2E in CI;
- the CI compatibility smoke and deploy gate.

## Recommended git gates (not written)

- **pre-commit:** keep husky + lint-staged. Optionally add `node scripts/check-migrations.mjs` when `supabase/migrations/` is staged.
- **pre-push:** `npm test && npm run lint && npx astro check` (about 20 s). Local Supabase-dependent suites stay in CI.

## Next step

In a fresh session:

1. Ask the agent to edit a file with a lint error, then a type error, and watch it fix both.
2. Ask it to rewrite a file through `cat > … <<EOF` with a lint error, and watch the Stop hook send it back.
