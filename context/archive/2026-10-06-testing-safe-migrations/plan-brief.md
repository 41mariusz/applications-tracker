# Safe Migrations (Test-Plan Phase 3) — Plan Brief

> Full plan: `context/changes/testing-safe-migrations/plan.md`
> Research: `context/changes/testing-safe-migrations/research.md`

## What & Why

Test-plan risk #2: a migration that passes locally can break production in two ways.

- The cloud database lacks a migration that the deployed code needs.
- The previous code version runs on a newer schema. This happens after every `db push` and after a `wrangler rollback`.

This plan adds a deploy gate for the first failure and two compatibility checks for the second. It also closes roadmap slice S-03 (MS-03).

## Starting Point

- Safety rests on two manual rules: "db push before push" and "keep migrations additive".
- CI applies migrations only to a throwaway local stack.
- The `deploy` job never looks at the cloud. A push with an unapplied migration goes green and deploys.
- All 7 existing migrations are additive, and each landed with its code.

## Desired End State

- A `main` deploy stops with a clear message when the cloud lacks a repo migration, or when the cloud state cannot be read. `db push` followed by a job re-run unblocks it.
- `npm run lint` flags a new migration that would break the previous code.
- CI proves that the previous commit passes its own smoke test on the new schema whenever migrations change.
- Each deployed Worker version carries its git SHA.

## Key Decisions Made

| Decision                          | Choice                                                                                                       | Why (1 sentence)                                                    | Source          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | --------------- |
| How CI reads the cloud state      | New `applied_migrations()` security-definer RPC, called with the existing publishable key                    | No new CI secret; follows the `keepalive_status()` pattern          | Plan            |
| Gate when the state can't be read | Fail closed, with a message distinct from "missing"                                                          | A silently passing deploy is exactly the risk; blocking only delays | Plan            |
| Old code on the new schema        | Both a migration lint (always) and a compatibility smoke (migration commits only)                            | The lint is seconds at edit time; the smoke proves real old code    | Plan            |
| Roadmap S-03                      | Closed by this change, plus the SHA on `wrangler deploy` and a runbook note for cron/health rollback hazards | One piece of work closes the test phase and the slice               | Plan            |
| Where the additive rule lives     | CLAUDE.md hard rule plus a `lessons.md` entry                                                                | Agents always see CLAUDE.md; plan and review skills read lessons    | Plan            |
| Credentials rejected              | No PAT, no database password, no production service-role key in CI                                           | Least privilege for a single-user app                               | Research + Plan |
| `db push --dry-run`               | Not used                                                                                                     | It is the write command, one flag away from migrating production    | Research        |
| What "previous code" means        | Push: `github.event.before`; PR: the base SHA                                                                | `HEAD~1` is wrong for multi-commit pushes                           | Research        |

## Scope

**In scope:**

- `scripts/lib/migrations.mjs` and its Vitest tests;
- `scripts/check-migrations.mjs` in `npm run lint`;
- the `applied_migrations` migration and its pgTAP test;
- `scripts/check-cloud-migrations.mjs` and the gate step in `deploy`;
- `--message` with the SHA on `wrangler deploy`;
- the compatibility step in `smoke`;
- updates to CLAUDE.md, `lessons.md`, `infrastructure.md`, `test-plan.md` and roadmap S-03.

**Out of scope:**

- migrating the cloud from CI;
- new secrets;
- a gate on PRs;
- code fixes for cron or health on very old versions;
- semantic compatibility checks (these stay a review rule);
- linting applied history;
- pinning the runner OS.

## Architecture / Approach

Pure, dependency-free rules (version parsing, set comparison, SQL lint rules, gate verdict) live in `scripts/lib/migrations.mjs` and are tested with Vitest. Three thin entry points use them:

- the lint runs locally and in the `ci` job;
- the gate runs in `deploy`, before `npm ci`, and reads the cloud through the new RPC;
- the compatibility step in `smoke` builds the base commit in a git worktree against the local stack, which holds the new schema.

## Phases at a Glance

| Phase                         | What it delivers                                                          | Key risk                                                       |
| ----------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Migration lint             | Rules + tests; `npm run lint` flags breaking statements in new migrations | Regex false positives; the override keeps them manageable      |
| 2. `applied_migrations()` RPC | Anon-callable version list + pgTAP                                        | Discloses version strings (low sensitivity)                    |
| 3. Deploy gate + SHA          | `deploy` blocks on missing or unreadable state; SHA on each version       | First deploy blocks if the owner forgets `db push` (by design) |
| 4. Compatibility smoke        | Base commit's own smoke on the new schema; edited-history check           | Preview/port collision; shallow checkout must fetch the base   |
| 5. Rules and docs             | CLAUDE.md, lessons, runbook, test plan §5/§6, roadmap S-03                | None significant                                               |

**Prerequisites:**

- Local Supabase running.
- Before the final `git push`, the owner runs `npx supabase db push` so the cloud has the Phase 2 migration.

**Estimated effort:** about 2 sessions across 5 phases. The real CI proof happens on the push.

## Open Risks & Assumptions

- The cloud project's `supabase_migrations.schema_migrations` is owned by `postgres`, like locally, so the security-definer function can read it. If not, the gate reports "unreadable" and blocks; the first push proves it.
- GitHub Actions instability (seen 2026-10-05) can delay the proof run, but does not change the design.
- The compatibility smoke cannot see semantic breaks (new enum values, columns nulled by old code). These stay a written review rule.

## Success Criteria (Summary)

- An unapplied migration can no longer reach production silently: the `deploy` job blocks with a clear way to unblock.
- A migration that would break the running code is flagged at lint time. If it gets past the lint, the previous commit's own smoke catches it in CI.
- `wrangler deployments list` shows which commit is live, so a rollback picks the right version.
