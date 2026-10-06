---
date: 2026-10-06T06:01:02+00:00
researcher: Claude (Opus 5.5) for Mariusz Michalak
git_commit: 7289510bd4ffb34e80be6ba1b6d0b1b455a63a1e
branch: main
repository: 10xdevs
topic: "Test-plan Phase 3 — how CI can stop a deploy when the cloud database lacks a repo migration, and how to prove the previous code version survives the new schema (risk #2)"
tags: [research, testing, migrations, ci, deploy, rollback, supabase, cloudflare]
status: complete
last_updated: 2026-10-06
last_updated_by: Claude (Opus 5.5)
---

# Research: Safe migrations (test-plan Phase 3)

**Date**: 2026-10-06T06:01:02+00:00
**Researcher**: Claude (Opus 5.5) for Mariusz Michalak
**Git Commit**: 7289510bd4ffb34e80be6ba1b6d0b1b455a63a1e (working tree: `context/` changes only)
**Branch**: main
**Repository**: 10xdevs

## Research Question

Risk #2 in `context/foundation/test-plan.md` (§2 row at `:43`, Risk Response Guidance at `:54`, §3 Phase 3 at `:70`, §5 gate at `:113`):

1. **Deploy gate.** How can CI stop a deploy when the cloud database is missing a migration that is in the repo? What credential would that need, and where does it fit in the pipeline?
2. **Rollback compatibility.** What does "the previous code version still works on the new schema" mean in this repo? How could a compatibility smoke prove it, and is it worth it?
3. **The anti-pattern to challenge.** Does anything today rely on "migrations applied to the local/CI database prove production is migrated"?

## Summary

- **No check exists today.** A push to `main` that carries an unapplied migration goes green and deploys code that is ahead of the cloud schema.
  - Migrations reach the cloud only through a manual `npx supabase db push` (`CLAUDE.md:12`, `context/foundation/lessons.md:5-10`, `context/foundation/infrastructure.md:79,101`).
  - CI applies migrations only to a throwaway local stack (`.github/workflows/ci.yml:42`, `supabase start`).
  - The `deploy` job (`ci.yml:92-127`) runs `wrangler deploy` without consulting the cloud database.
- **Production migration state is not reachable with today's CI secrets.** The workflows reference four secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
  - `supabase_migrations.schema_migrations` is not exposed through PostgREST, which serves `["public", "graphql_public"]` locally (`supabase/config.toml:13`).
  - The CLI link state lives in the gitignored `supabase/.temp/` (`supabase/.gitignore:3`), so a runner has no project ref.
  - Every option below needs either a new credential or a new migration.
- **There are four realistic ways to read the cloud state** (§2):
  - **F:** an app-level RPC over the existing publishable key. No new secret, but it needs one migration.
  - **A:** the Management API with a personal access token (PAT). Scoped tokens are in alpha; a classic token is account-wide.
  - **B:** the CLI `migration list`. Needs a PAT plus the database password.
  - **D:** a direct Postgres read. Needs a password and pooler handling.
  - `db push --dry-run` is rejected: it is the write command, one flag away from migrating production from CI.
- **Backward compatibility holds today, on the inspected history.** None of the 7 migrations would have broken the code version just before it (§3). Each one is additive, and `grep` finds no `drop`, `rename`, `alter … type` or `set not null` in `supabase/migrations/`.
- **Each migration landed in the same commit as its code.** Seven distinct commits added them (6624b85, 921bd8b, ccb2d8c, a2d3042, a181f7e, 02921a8, d2bf69e), out of 77 commits on `main`.
- **Old code on the new schema is the normal case, not a rare one.** "db push before pushing code" means the previous code always runs on the new schema between the owner's `db push` and CI's deploy, not only after a `wrangler rollback`.
- **Two cheap layers fit the second half of risk #2:**
  - a static SQL lint of new migration files: seconds per run, catches breaking statements by pattern;
  - a compatibility smoke in the `smoke` job: build the previous commit and run _its_ `scripts/smoke.mjs` against the new local schema, only when the push changes `supabase/migrations/`. A few minutes, on few commits.
  - Neither catches semantic breaks, such as an enum value the old code cannot render, or a redefined function nulling a column the old code doesn't send. Those stay a review rule.
- **Open product and ops choices for the plan:**
  - which credential option to use for the gate;
  - fail-closed versus warn when the gate cannot read the state;
  - whether this change also closes roadmap S-03 (`safe-rollback-after-migration`, `roadmap.md:51`);
  - whether to fix two rollback hazards outside the schema (cron and health on old versions, §4).

## Detailed Findings

### 1. Current pipeline and how migrations reach the cloud

- **Triggers:** push and PR to `main` (`ci.yml:3-7`).
- **`ci` job** (`ci.yml:10-26`): lint, unit tests, `astro check`, build. It uses `secrets.SUPABASE_URL` and `secrets.SUPABASE_KEY` (`:25-26`).
- **`smoke` job** (`ci.yml:28-90`): uses no repo secrets.
  - `supabase start` (`:42`) applies every repo migration to a local database.
  - Then `supabase test db` (`:45`), the smoke test (`:52-57`) and Playwright (`:72-82`) run against that stack. `supabase stop` (`:90`).
- **`deploy` job** (`ci.yml:92-127`):
  - `if: push to main` (`:94`) and `needs: [ci, smoke]` (`:95`).
  - `environment: SUPABASE` (`:98`) and concurrency group `deploy-production` (`:99-101`).
  - `wrangler whoami`, then `wrangler deploy` (`:125-126`), which passes no `--message` or `--tag`.
- **`health.yml`** curls production `/api/health`. That checks liveness and keepalive freshness, not the schema.
- **Rules today:**
  - **CLAUDE.md** (`:12`): "CI does not migrate the cloud database… the owner runs `npx supabase db push`".
  - **lessons.md** (`:5-10`): run `db push` before pushing code that includes a migration. The lesson records no incident. Git history has no fix or revert for a production break after a migration (searched with `git log | grep -iE "migrat|db push|rollback|schema"`).
  - **infrastructure.md** (`:79`): a human runs `db push` and approves rollbacks; an agent may push to `main`.
- **The anti-pattern already exists implicitly.** Every database-level check in CI (pgTAP, smoke, Playwright) runs against the local stack. A gate built from any of these would always pass:
  - `supabase migration list --local`;
  - a pgTAP assertion;
  - `supabase test db` passing;
  - a smoke step.

### 2. Reading production migration state from CI

| Option                               | Mechanism                                                                                                                                                                                                                 | Credential                                                                                                                                                                     | Read-only              | Notes                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F. App RPC**                       | New `security definer` function, e.g. `public.migration_versions()` returning the version list from `supabase_migrations.schema_migrations`, granted to `anon`. The gate calls `/rest/v1/rpc/…` with the publishable key. | **None new.** Uses `SUPABASE_URL` and `SUPABASE_KEY`, already repo secrets used by the `ci` job (`ci.yml:25-26`).                                                              | yes                    | Follows the existing `keepalive_status()` pattern (`supabase/migrations/20261004120000_keepalive.sql:26-38`: security definer, `search_path = ''`, revoke from public, grant to anon and authenticated).                                                                                                                   |
| **A. Management API**                | `GET /v1/projects/{ref}/database/migrations` returns `[{version, name}]` (https://supabase.com/docs/reference/api/v1-list-migration-history).                                                                             | PAT plus project ref.                                                                                                                                                          | yes                    | Classic PATs are account-wide (delete or pause projects). Scoped tokens are "public alpha, rolling out gradually" (https://supabase.com/docs/guides/platform/personal-access-tokens). Not confirmed: whether the endpoint returns the full history without paging, and whether scoped tokens are enabled for this account. |
| **B. CLI `migration list --linked`** | Compares local timestamps with remote `schema_migrations` (https://supabase.com/docs/reference/cli/supabase-migration-list).                                                                                              | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, project ref. This is the official GitHub Actions example (https://supabase.com/docs/guides/deployment/managing-environments). | listing yes            | Broadest credential (the full `postgres` password). Not confirmed: JSON output for this subcommand, and a password-less path.                                                                                                                                                                                              |
| **D. Direct Postgres**               | `select version from supabase_migrations.schema_migrations`.                                                                                                                                                              | Connection string for a dedicated SELECT-only role, created by the owner by hand (never in a repo migration).                                                                  | yes                    | Not confirmed today: the direct host is IPv6-only without the IPv4 add-on, and GitHub-hosted runners lack IPv6, so the pooler would be needed.                                                                                                                                                                             |
| ~~C. `db push --dry-run`~~           | Prints pending migrations.                                                                                                                                                                                                | Same as B.                                                                                                                                                                     | **no** (write command) | Rejected: one dropped flag migrates production from CI, against `infrastructure.md:79`.                                                                                                                                                                                                                                    |

The service-role key is not an option. `CLAUDE.md:11` says the app must never read it, it would not expose the `supabase_migrations` schema anyway, and putting the production key into CI is a large new exposure.

**Option F specifics:**

- **Chicken and egg.** The function arrives in a migration. Until the owner runs `db push`, the RPC returns 404, and a fail-closed gate blocks. That is the correct verdict, because that migration really is unapplied.
- **Compare the whole set, not the maximum.** Comparing only `max(version)` misses a migration with an older timestamp merged later. The gate should compare the repo's version prefixes (`ls supabase/migrations | cut -d_ -f1`) against the returned set.
- **Disclosure.** Anyone with the publishable key could read the list of migration versions. This is low-sensitivity metadata, but it is new.
- **Testing.** The function would get pgTAP coverage like `keepalive_status()`.

**Placement.** The cheapest fit is a step at the top of the `deploy` job, before `npm ci` (`ci.yml:103`). It inherits push-to-main only, `needs`, the `SUPABASE` environment and the concurrency group.

A separate job listed in `deploy.needs` would also work. On a PR it could warn instead, since a PR's migration is often legitimately unapplied.

**Gate failure semantics** (inference from the risk, not from existing code):

- **Missing versions:** fail with a distinct annotation (e.g. `::error title=Cloud DB missing migrations::<versions>`).
- **Gate cannot read the state** (network, 5xx, bad token, project paused with 540): fail closed with a different message, using bounded retries like `health.yml` (`curl --retry 2`).
- **Cost of blocking:** a delayed deploy, recovered by `db push` and re-running the job. A silent pass is exactly the risk.
- **Remote-only versions** (in the cloud, not in the repo): warn.

### 3. Rollback compatibility: what "old code on new schema" means here

| #   | Migration                                  | Added in | Change                                                                                              | Effect on the previous code                                                                                                                                              |
| --- | ------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `20260929180000_create_applications.sql`   | 6624b85  | enums `application_status`, `employment_type`, `work_mode`; table `applications` with RLS           | first schema                                                                                                                                                             |
| 2   | `20260929190000_create_status_changes.sql` | 921bd8b  | new table + RLS                                                                                     | additive                                                                                                                                                                 |
| 3   | `20260930090000_create_notes.sql`          | ccb2d8c  | enum `note_kind`; tables `notes`, `note_revisions`                                                  | additive                                                                                                                                                                 |
| 4   | `20260930120000_create_field_changes.sql`  | a2d3042  | new table                                                                                           | additive                                                                                                                                                                 |
| 5   | `20260930150000_atomic_writes.sql`         | a181f7e  | 4 new functions; execute granted to authenticated (`:131-138`)                                      | additive. The code before it (a2d3042) wrote directly to the history tables, and those grants and policies were unchanged, so a rollback still works, without atomicity. |
| 6   | `20261001090000_cv_files.sql`              | 02921a8  | bucket `cvs`, table `cv_files`, nullable `applications.cv_file_id` (`:38-39`), `set_application_cv` | additive (`select("*")` gains a column)                                                                                                                                  |
| 7   | `20261004120000_keepalive.sql`             | d2bf69e  | table `keepalive` with no grants; 2 definer functions                                               | additive                                                                                                                                                                 |

**How the code is coupled to the schema** (from the services), and so which future migrations would break the previous version:

- **RPC calls by name with named parameters:**
  - `change_application_status`: `applications.ts:116-121`;
  - `update_application`, including `p_note_body`: `applications.ts:170-176`;
  - `add_note`, `edit_note`: `notes.ts:20-25`, `:50-55`;
  - `set_application_cv`: `cv.ts:74`;
  - `keepalive_ping`, `keepalive_status`: `keepalive.ts:5,14`.

  Renaming a parameter, adding one without a DEFAULT, or replacing a signature (which creates an overload) breaks the old calls.

- **Explicit column lists** (`notes.ts:35,100,106`; `applications.ts:101,152`; `cv.ts:6,88`) and **direct inserts** (`applications.ts:79`, `cv.ts:33-40`) break on dropped or renamed columns. Inserts also break on a new NOT NULL column without a default.
- **Enums are duplicated by hand** in `src/types.ts` (`APPLICATION_STATUSES` `:1-10`, plus `EMPLOYMENT_TYPES`, `WORK_MODES`, `NOTE_KINDS`) and used as `Record<…>` keys (`STAGE_RANK` in `src/lib/domain/status.ts`, `STATUS_LABELS` in views). `alter type … add value` is additive in SQL but breaks old code that reads a row with the new value: undefined rank, no label, zod rejects it.
- **Silent data loss:** `update_application` copies a fixed key list from `p_fields` (`atomic_writes.sql:46-57`). If a future redefinition writes a new column from `p_fields`, old code that doesn't send it nulls that column without any error.
- **Tighter grants or policies,** e.g. revoking direct `update` on `notes`, which `removeNote` still uses (`notes.ts:68`).
- **Safe changes:** new tables, nullable or defaulted columns, new function names, optional parameters with defaults (watch for overloads), indexes, looser policies.

### 4. Rollback mechanics (Cloudflare)

- Official docs (`/workers/configuration/versions-and-deployments/rollbacks/`) say only the 100 most recently published versions can be rolled back to, and that "resources connected to your Worker will not be changed during a rollback". Supabase is external and never touched. This matches `infrastructure.md:32,59,78`.
- `wrangler deployments list` and `versions list` show 10 entries by default (`--json` available). `wrangler rollback [VERSION_ID] --message` targets the previous version when no id is given.
- **Not confirmed by docs (inference):** `wrangler secret put` creates a new version, and versions include bindings, so a rollback past a secret rotation may restore old secret values.
- **Rollback hazards outside the schema** (not the subject of risk #2, recorded for the plan):
  - Cron triggers deploy separately from versions. Rolling back before d2bf69e keeps the `0 */6 * * *` cron (`wrangler.jsonc:12-15`) on code with no `scheduled` handler, so keepalive stops.
  - Versions before bb88c7e have no `/api/health`, so the daily probe would return 404 and fail.
- The deploy passes no `--message`, so `wrangler deployments list` does not show which git SHA is live (`ci.yml:126`).

### 5. Compatibility smoke: feasibility

- **Which code counts as previous:** the code production runs during and after `db push`, which is the last deployed `main`.
  - On push: `github.event.before`.
  - On a PR: the base SHA.
  - `HEAD~1` is wrong for multi-commit pushes.
  - Recording the deployed SHA (`wrangler deploy --message $GITHUB_SHA`) would make the target exact and also help rollbacks.
- **When to run:** only if `git diff --name-only BASE..HEAD -- supabase/migrations` is non-empty. With no new migration, the previous code already ran on this exact schema in production, so the check proves nothing. That is most commits: 7 of 77 added a migration.
- **Mechanics in the `smoke` job:**
  1. `supabase start` already holds the new schema.
  2. `git worktree add` the base SHA, then `npm ci` and `npm run build` there, writing `.env`/`.dev.vars` the same way as the "Configure secrets" step (`ci.yml:46-51`).
  3. Preview it, then run **that commit's** `scripts/smoke.mjs`. It creates its own users through the admin API (`scripts/smoke.mjs:26`), so it fits a shared local database.
  4. Run sequentially: Astro 7 runs one preview per project, and CI already has to run `npx astro preview stop` (`ci.yml:76-80`). The worktree preview would also collide on port 4321.
- **Cost:** one more `npm ci`, build and smoke run, a few minutes, only on migration commits. Not measured (`gh` not installed; no CI timing data).
- **Limits:**
  - It does not see rows written by the new code (the enum and null-overwrite cases).
  - It does not see the cron and health rollback effects.
  - It says nothing about the cloud database, which is the gate's job.
- **Static SQL lint** (new or changed files in `supabase/migrations/`):
  - It flags `drop`, `rename`, `alter column … type`, `set not null`, `add column … not null` without a default, `create or replace function`, `drop function`, `alter type … add value`/`rename value`, `drop policy`, `revoke`, and changed `check` constraints.
  - It costs seconds and allows an explicit override comment for intentional breaks.
  - It cannot see semantic breaks.
  - It also covers the "edit an applied migration" mistake: the archived keepalive review chose to document instead of editing an applied migration (`context/archive/2026-10-04-app-available-after-idle-week/reviews/impl-review.md:73`).

## Code References

- `.github/workflows/ci.yml:42` — `supabase start` (local migrations only)
- `.github/workflows/ci.yml:92-127` — `deploy` job: environment `SUPABASE`, `wrangler deploy` without `--message`
- `.github/workflows/health.yml` — production liveness probe (not schema)
- `supabase/config.toml:13` — PostgREST exposed schemas `public`, `graphql_public`
- `supabase/.gitignore:3` — `.temp` (CLI link state) ignored
- `supabase/migrations/20261004120000_keepalive.sql:18-38` — security-definer function and grant pattern for an anon-callable status RPC
- `supabase/migrations/20260930150000_atomic_writes.sql:46-57` — `update_application` fixed key copy (silent-null hazard)
- `src/lib/services/applications.ts:79,101,116-121,152,170-176` — insert, explicit columns, named RPC parameters
- `src/lib/services/notes.ts:20-25,35,50-55,68` — RPC parameters, explicit columns, direct `deleted_at` update
- `src/lib/services/cv.ts:5,6,33-40,74` — bucket name, columns, insert, RPC
- `src/types.ts:1-10` — hand-copied enums
- `wrangler.jsonc:12-15` — cron trigger (deployed separately from versions)
- `context/foundation/infrastructure.md:59,78,79,88,101` — rollback reverts code only; additive rule; human `db push`; risk register; runbook
- `context/foundation/lessons.md:5-10` — db push before push
- `context/foundation/roadmap.md:31,51,123-134,169` — MS-03 and S-03 `safe-rollback-after-migration`

## Architecture Insights

- **Today's safety rests on two manual rules.** One is in place in three files: "db push before push" (lessons, CLAUDE.md, runbook). The other, "keep migrations additive", is only in `infrastructure.md:78,88` and an archived plan, not in CLAUDE.md or lessons. No automated check enforces either.
- **Risk #2 splits into two independent failures** with different cheapest layers:
  1. **Cloud behind the code.** A deploy-time gate that must read the cloud. Any local-only check is the anti-pattern.
  2. **Code behind the schema** (old code on the new schema, during every `db push → deploy` window and after a rollback). A pre-merge static lint, plus an optional compatibility smoke on migration commits.
- **The publishable-key RPC (option F) is the only option that adds no credential to CI.** It reuses an established pattern, so it fits the project's "no extra infra" shape (single-user, free plans). The cost is one migration and one new public read.

## Historical Context (from prior changes)

- `context/archive/2026-10-04-app-available-after-idle-week/plan.md:53,289,317` — "Migration before code"; "the migration is additive, so rolling back the Worker to a previous version stays safe"; `db push` was applied before the push (d2bf69e). Supported by migration 7's content.
- `context/archive/2026-10-04-app-available-after-idle-week/reviews/impl-review.md:73` — a fix documented instead of editing an already-applied migration. Current practice: applied migrations are never edited. Supported: each migration file has exactly one commit.
- `context/archive/2026-10-05-testing-status-rules-end-to-end/research.md` — the owner-level REST bypass is an accepted limit. Unrelated to migration ordering.
- `context/foundation/infrastructure.md:64` — the pre-mortem "rollback broke the details page" is **hypothetical**, not a recorded incident.
- Test-plan risk #2 cites "interview Q2" (`test-plan.md:43`), but the Q2 answer is not recorded anywhere in the repo, so the "burned before" evidence cannot be checked.
- Likelihood differs between documents: `infrastructure.md:88` and `roadmap.md:31,133` rate the rollback risk L/H, while `test-plan.md:43` rates the merged risk #2 High/Medium. Not a contradiction to resolve here; the test plan merged two failure modes.

## Related Research

- `context/archive/2026-10-05-testing-status-rules-end-to-end/research.md` — Phase 2 (status rules); its pgTAP and smoke patterns apply to any new RPC here.

## Open Questions

1. **Gate credential:** F (new anon RPC plus migration, no new secret), A (Management API plus PAT, scoped-token alpha), or B/D (DB password)? Decides security exposure and setup steps for the owner.
2. **Gate failure policy:** fail closed when the state cannot be read (recommended by the risk), or warn? And should PRs run the gate as a warning?
3. **Second half of risk #2:** static SQL lint only, compatibility smoke only, or both? The smoke costs minutes on migration commits; the lint costs seconds always.
4. **Scope versus roadmap S-03:** does this change close S-03/MS-03 (`roadmap.md:51,123-134`), or does S-03 stay a separate slice? Does it include recording the deployed SHA (`wrangler deploy --message`) and the cron/health rollback hazards (§4), or leave them to S-03?
5. **Rule placement:** should "keep migrations additive / backward-compatible with the previous code" move into CLAUDE.md or `lessons.md` next to "db push before push"?
6. **Not verified:**
   - the Management API's completeness and paging, and scoped-token availability;
   - JSON output for `migration list`;
   - IPv6 for the direct database host;
   - whether rollback restores old secret values;
   - real CI durations.
