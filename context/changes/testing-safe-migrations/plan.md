# Safe Migrations (Test-Plan Phase 3) Implementation Plan

## Overview

This change protects production against test-plan risk #2, in two halves:

1. **Code ahead of the cloud schema.** A deploy from `main` must stop when the cloud database lacks a migration that is in the repo.
2. **Schema ahead of the old code.** The code version production already runs must keep working on the new schema. That old code runs on the new schema after every `db push`, and again after any `wrangler rollback`.

This change also closes roadmap slice S-03 (`safe-rollback-after-migration`, MS-03). It records the deployed git SHA on each Worker version and documents the rollback hazards that have nothing to do with the schema.

## Current State Analysis

From `context/changes/testing-safe-migrations/research.md`:

- **No check exists today.** Migrations reach the cloud only through a manual `npx supabase db push` (`CLAUDE.md:12`, `context/foundation/lessons.md:5-10`, `context/foundation/infrastructure.md:79,101`).
  - CI applies migrations only to a throwaway local stack (`.github/workflows/ci.yml:42`).
  - The `deploy` job (`ci.yml:92-127`) runs `wrangler deploy` without consulting the cloud database, and passes no `--message` (`:126`).
  - A push carrying an unapplied migration therefore goes green and deploys code that is ahead of the cloud schema.
- **The cloud migration state is unreachable with today's CI secrets.** `supabase_migrations` is not an exposed PostgREST schema (`supabase/config.toml:13`). The CLI link state lives in the gitignored `supabase/.temp/` (`supabase/.gitignore:3`).
  - Locally, `supabase_migrations.schema_migrations` is owned by `postgres` and holds the 7 versions `20260929180000` … `20261004120000` (verified with `psql`).
- **All 7 existing migrations are additive.** None contains `drop`, `rename`, `alter … type` or `set not null`.
  - Each landed in one commit together with its code (6624b85, 921bd8b, ccb2d8c, a2d3042, a181f7e, 02921a8, d2bf69e), out of 77 commits.
  - The "keep migrations additive" rule exists only in `infrastructure.md:78,88`.
- **Existing patterns to reuse:**
  - the anon-callable `security definer` status RPC `keepalive_status()` (`supabase/migrations/20261004120000_keepalive.sql:26-38`) and its pgTAP test (`supabase/tests/keepalive.test.sql`);
  - the dependency-free lint script `scripts/check-ui-literals.mjs`, wired into `npm run lint` (`package.json`);
  - `health.yml` (`curl --retry 2`) for bounded retries.
- **Toolchain facts:**
  - `wrangler deploy` supports `--message` and `--tag` (verified with `--help`).
  - Vitest only includes `src/**/*.test.ts` (`vitest.config.ts`).
  - CI checks out with the default depth of 1, since no `fetch-depth` is set (`ci.yml`).

## Desired End State

- **Deploy gate.** A push to `main` whose migrations are not all in the cloud fails the `deploy` job before `wrangler deploy`.
  - A clear annotation lists the missing versions, and production keeps the previous Worker.
  - If the gate cannot read the cloud state, the job also fails, with a different message.
  - After the owner runs `npx supabase db push` and re-runs the job, it deploys.
- **Migration lint.** `npm run lint` fails on a new migration containing a statement that would break the previous code version, unless an explicit override comment states the reason.
- **Compatibility smoke.** On a push or PR that changes `supabase/migrations/`, the `smoke` job:
  - builds the base commit;
  - runs that commit's own `scripts/smoke.mjs` against the new local schema;
  - fails if an already-existing migration file was edited.
- **Deploy SHA.** Every deployed Worker version carries the git SHA, so `wrangler deployments list` shows what is live.
- **Docs.** CLAUDE.md and `lessons.md` state the additive rule. The runbook explains how to unblock the gate and what a rollback to old versions does to the cron and health check. The test plan documents the new gates. Roadmap S-03 points at this change.

Verify locally:

- `npm run lint`;
- `npm test`;
- `npx supabase test db`;
- the gate script against the local stack, with and without a fake extra migration.

The CI path is proven on the push that carries this change's own migration.

### Key Discoveries:

- **The gate's own migration bootstraps the gate.** The RPC arrives in a migration. Until the owner pushes it to the cloud, the RPC returns 404 and a fail-closed gate blocks, which is the correct verdict. So `db push` must precede `git push` (`lessons.md`).
- **Compare full sets, not the maximum version.** Comparing only `max(version)` misses a migration with an older timestamp merged later.
- **"Previous code" means the code production runs during and after `db push`:**
  - on push, `github.event.before` (all zeros on a new branch, so skip);
  - on a PR, `github.event.pull_request.base.sha`;
  - not `HEAD~1`, which is wrong for multi-commit pushes.
- **The compatibility smoke runs only when `supabase/migrations/` changed** between base and head. Otherwise the previous code already ran on this exact schema in production.
- **Port and preview collision.** Astro 7 runs one preview per project, and CI already stops the smoke preview before Playwright (`ci.yml:76-80`). The base build must use its own worktree and run after the E2E step, after stopping any preview.
- **The lint applies only to migrations newer than the current last one (`20261004120000`).** The applied history contains `revoke all on table public.keepalive …` (`20261004120000_keepalive.sql:16`), which the new rules would flag. History is settled, and editing applied files is caught separately by the compatibility step.

## What We're NOT Doing

- **Migrating the cloud database from CI.** `db push` stays a human step (`infrastructure.md:79`). `supabase db push --dry-run` is not used, because it is the write command.
- **New CI credentials.** No Supabase personal access token, no database password and no production service-role key. The gate uses the existing `SUPABASE_URL` and `SUPABASE_KEY` repository secrets (decision: SQL function plus publishable key).
- **A gate on PRs.** The cloud gate runs only in the `deploy` job (push to `main`). A PR's migration is legitimately unapplied.
- **Code fixes for cron or health on very old versions.** These are documented in the runbook only (decision).
- **Semantic compatibility checks.** Examples: old code rendering a new enum value, or a redefined function nulling a column the old code doesn't send. These stay a review rule, written into the CLAUDE.md and `lessons.md` wording.
- **Rewriting or linting already-applied migrations.**
- **Pinning the runner OS.** The owner chose to keep `ubuntu-latest`.

## Implementation Approach

Work from the cheapest layer up:

1. A pure-rule lint that fails in seconds at edit time.
2. The tiny RPC and its pgTAP test.
3. The deploy gate, which depends on the RPC.
4. The compatibility smoke, which needs the CI context.
5. The docs.

Shared pure logic (version parsing, set comparison, lint rules) lives in one dependency-free module `scripts/lib/migrations.mjs`, unit-tested with Vitest. It sits next to the scripts because the CI scripts run as plain Node and cannot import TypeScript from `src/`. The CLAUDE.md "pure business rules → `src/lib/domain/`" rule covers app rules, not CI tooling. This placement is recorded in CLAUDE.md in Phase 5.

The test oracles come from the risk, not from the code:

- an unapplied migration must block;
- an unreadable state must block;
- a `drop column` must be flagged;
- the previous commit's own smoke must pass.

## Critical Implementation Details

- **Order of the first rollout.** Phases 1–5 land as local commits. Before the owner pushes them, they must run `npx supabase db push` so the cloud gets the Phase 2 migration. Otherwise the new gate correctly blocks this very deploy. The push then exercises both new CI paths for real:
  - the compatibility smoke (this push changes `supabase/migrations/`);
  - the deploy gate (it reads the RPC that `db push` created).
- **Shallow checkout.** The compatibility step must fetch the base commit explicitly (`git fetch --no-tags --depth=1 origin <base>`) or set `fetch-depth: 0`. With depth 1, neither the diff nor the worktree can see the base.

## Phase 1: Migration lint

### Overview

`npm run lint` fails on a new migration that would break the previous code version, using pure rules with unit tests.

### Changes Required:

#### 1. Shared migration rules

**File**: `scripts/lib/migrations.mjs` (new)

**Intent**: Dependency-free pure functions shared by the lint, the gate and their tests:

- read migration versions from file names;
- compare a repo set with a cloud set;
- scan SQL text for statements that break the previous code version, honouring an explicit override comment.

**Contract**:

- `migrationVersions(fileNames) → string[]`: the 14-digit prefix of `YYYYMMDDHHmmss_name.sql`. Throws on a malformed name.
- `compareMigrations(repoVersions, cloudVersions) → { missing: string[], remoteOnly: string[] }`: set difference both ways, sorted.
- `lintMigrationSql(sql) → { line, rule, text }[]`. The rules, case-insensitive and ignoring `--` comments and string bodies only as far as a simple scan allows:
  - `drop` (table, column, function, type, policy, view, index of a used constraint);
  - `rename` (table, column, value);
  - `alter column … type`;
  - `alter column … set not null`;
  - `add column … not null` without `default`;
  - `create or replace function`;
  - `alter type … add value` (old code cannot render the value);
  - `revoke` on tables or columns (`revoke execute on function` stays allowed, following the keepalive and atomic-writes pattern);
  - a tighter `check` constraint (`add constraint … check`).
- A finding is suppressed by a comment on the same line or the line above: `-- migration-lint: allow <rule> — <reason>`. An override without a reason is itself a finding.

#### 2. Unit tests

**File**: `scripts/lib/migrations.test.mjs` (new)

**Intent**: Prove each rule with literal SQL written from the list above (the oracle is the risk, not the regexes):

- every rule flags its statement, and the same statement with a reasoned override passes;
- additive statements pass: `create table`, `add column … null`, `add column … not null default …`, `create function`, `create index`, `create policy`, `grant`, `revoke execute on function`;
- `compareMigrations` reports missing and remote-only versions in both directions, an empty difference, and a migration with an older timestamp merged later (a `max()`-only check would miss it);
- a malformed file name throws.

**Contract**: `vitest.config.ts` `include` gains `scripts/**/*.test.mjs`.

#### 3. Lint entry point

**File**: `scripts/check-migrations.mjs` (new), `package.json`

**Intent**: Run `lintMigrationSql` over every `supabase/migrations/*.sql` whose version is greater than the baseline `20261004120000` (the last migration before this rule). Print `file:line rule: text` and exit 1 on findings. Otherwise print a one-line OK, like `check-ui-literals.mjs`.

**Contract**: the `lint` script becomes `eslint . && node scripts/check-ui-literals.mjs && node scripts/check-migrations.mjs`. The baseline is a named constant with a comment explaining why applied history is exempt.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new migration rules: `npm test`
- Lint passes on the current repo: `npm run lint`

#### Manual Verification:

- A temporary `supabase/migrations/29990101000000_lint_probe.sql` containing `alter table public.applications drop column quoted_rate;` makes `npm run lint` fail with that file and line; the same line with `-- migration-lint: allow drop — probe` passes; the probe file is deleted

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: `applied_migrations()` RPC

### Overview

A read-only, anon-callable function lets CI read the cloud's applied migration versions with the existing publishable key.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_applied_migrations.sql` (new; timestamp at implementation time, after `20261004120000`)

**Intent**: Expose only the list of applied migration versions, for the deploy gate. Follow the `keepalive_status()` pattern exactly.

**Contract**: `public.applied_migrations() returns text[]`:

- `language sql stable security definer set search_path = ''`;
- body `select coalesce(array_agg(version order by version), '{}') from supabase_migrations.schema_migrations`;
- `revoke execute … from public`;
- `grant execute … to anon, authenticated`.

The file must pass the Phase 1 lint with no override. A header comment states:

- why it exists (the deploy gate, test-plan risk #2);
- that it discloses only version strings;
- that it never writes.

#### 2. pgTAP test

**File**: `supabase/tests/applied_migrations.test.sql` (new)

**Intent**: Prove the contract:

- as `anon`, the function returns every repo version, including its own;
- the result equals `select version from supabase_migrations.schema_migrations` as a sorted array;
- `anon` still cannot read `supabase_migrations.schema_migrations` directly (permission denied);
- the function is `security definer` with an empty `search_path`.

**Contract**: same structure as `supabase/tests/keepalive.test.sql` (`begin`, `plan(N)`, `set local role anon`, `finish`, `rollback`).

### Success Criteria:

#### Automated Verification:

- Database tests pass with the new file: `npx supabase test db`
- The migration passes the Phase 1 lint with no override: `npm run lint`
- The RPC answers over HTTP with the local publishable key: `curl -s -X POST "$API_URL/rest/v1/rpc/applied_migrations" -H "apikey: $ANON_KEY"` returns 8 versions

#### Manual Verification:

- `npx supabase migration up` applies the new migration to the running LOCAL stack without errors (no `db reset` — it would wipe local data), and `select public.applied_migrations()` in `psql` lists it

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3. Do not push yet: the cloud needs `npx supabase db push` first (see Critical Implementation Details).

---

## Phase 3: Deploy gate and deploy SHA

### Overview

The `deploy` job refuses to deploy when the cloud lacks a repo migration, or when the cloud state cannot be read. Each deployed version carries its git SHA.

### Changes Required:

#### 1. Gate script

**File**: `scripts/check-cloud-migrations.mjs` (new)

**Intent**: Dependency-free:

1. Read `SUPABASE_URL` and `SUPABASE_KEY` from the environment.
2. Call `POST <SUPABASE_URL>/rest/v1/rpc/applied_migrations` with the publishable key. Use bounded retries: 3 attempts, short back-off, a timeout per attempt.
3. Compare the result with `migrationVersions(readdir("supabase/migrations"))` using `compareMigrations`.

Outcomes:

- **missing non-empty** → exit 1 with a GitHub annotation `::error title=Cloud DB missing migrations::<versions> — run npx supabase db push, then re-run this job`;
- **state unreadable** (network error, non-2xx including 404 before the RPC exists and 540 paused, unparsable body, missing env) → exit 1 with `::error title=Cannot read cloud migration state::<reason>`;
- **remoteOnly non-empty** → `::warning` and continue;
- **otherwise** → print the count and exit 0.

**Contract**: exit code 0 or 1 only. The messages distinguish "missing" from "unreadable" (decision: fail closed). The script never prints the key.

#### 2. Gate tests

**File**: `scripts/lib/migrations.test.mjs`

**Intent**: Add tests for the gate's decision function, extracted as pure `gateVerdict({ repo, cloud | error }) → { ok, level, message }`. Cases:

- missing versions block;
- an unreadable state blocks with the different message;
- remote-only versions only warn;
- equal sets pass.

**Contract**: `gateVerdict` lives in `scripts/lib/migrations.mjs`. The script only performs I/O.

#### 3. Deploy job

**File**: `.github/workflows/ci.yml`

**Intent**: In `deploy`, add a step "Cloud database has every repo migration" right after checkout and setup-node, before `npm ci`. It runs `node scripts/check-cloud-migrations.mjs` with `SUPABASE_URL` and `SUPABASE_KEY` from secrets.

Change the deploy command to `npx wrangler deploy --message "$GITHUB_SHA"` (plus `--tag` with the short SHA), keeping the existing logging and annotation wrapper.

**Contract**:

- The step sits inside the existing `deploy` job, so it inherits `if: push to main`, `needs: [ci, smoke]`, the `SUPABASE` environment and the `deploy-production` concurrency group.
- No new secrets: `SUPABASE_URL` and `SUPABASE_KEY` are already repository secrets used by the `ci` job (`ci.yml:25-26`).

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including `gateVerdict`: `npm test`
- Lint passes: `npm run lint`
- Against the local stack the gate passes: `SUPABASE_URL=<local API_URL> SUPABASE_KEY=<local ANON_KEY> node scripts/check-cloud-migrations.mjs` exits 0
- Against an unreachable URL the gate fails with the "Cannot read cloud migration state" message: `SUPABASE_URL=http://127.0.0.1:9 SUPABASE_KEY=x node scripts/check-cloud-migrations.mjs` exits 1

#### Manual Verification:

- With a temporary extra file `supabase/migrations/29990101000000_gate_probe.sql` (not applied locally), the gate against the local stack exits 1 and names `29990101000000`; the probe file is deleted
- The `ci.yml` diff shows the gate step before `npm ci` in `deploy` and `--message "$GITHUB_SHA"` on `wrangler deploy`

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 4.

---

## Phase 4: Compatibility smoke in CI

### Overview

When a push or PR changes migrations, CI proves that the previous code version still passes its own smoke test on the new schema, and that no applied migration file was edited.

### Changes Required:

#### 1. Compatibility step

**File**: `.github/workflows/ci.yml` (`smoke` job)

**Intent**: Add a step after the Playwright step and before the artifact upload. It runs in this order:

1. **Resolve the base SHA:**
   - on a PR, `github.event.pull_request.base.sha`;
   - on a push, `github.event.before`;
   - if the base is all zeros or empty → notice "no base; skipped" and exit 0.
2. **Fetch the base:** `git fetch --no-tags --depth=1 origin <base>`.
3. **Check for migration changes:** if `git diff --name-only <base> HEAD -- supabase/migrations` is empty → notice "no migration change; previous code already ran on this schema" and exit 0.
4. **Reject edited history:** if `git diff --name-only --diff-filter=MDR <base> HEAD -- supabase/migrations` is non-empty → `::error title=Applied migration edited::<files>` and exit 1. Applied migrations are never edited, renamed or deleted.
5. **Prepare the base worktree:**
   - `npx astro preview stop`;
   - `git worktree add ../prev <base>`;
   - in `../prev`, write `.env` and `.dev.vars` the same way as the "Configure secrets" step (`ci.yml:46-51`), from `supabase.env`;
   - in `../prev`, run `npm ci` and `npm run build`.
6. **Smoke the base build:**
   - start its preview on port 4321 and wait for it like the existing smoke step;
   - run `../prev/scripts/smoke.mjs` (the base commit's own smoke) with `BASE_URL`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` of the local stack;
   - stop the preview in `../prev`.

**Contract**:

- The local stack is still up at this point and holds the new schema (all head migrations applied by `supabase start`). The existing `supabase stop` step (`if: always()`) stays last.
- The step name says what it proves: "Previous code version passes its smoke on the new schema".
- The base's smoke creates its own users through the admin API, so it is independent of earlier data.

### Success Criteria:

#### Automated Verification:

- Workflow file parses as YAML: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`, and lint passes: `npm run lint`

#### Manual Verification:

- Local dry run of the step's commands with base = `7289510` (head = this change, which adds the Phase 2 migration): the base worktree builds, its preview starts, and its own `scripts/smoke.mjs` passes against the local stack that holds the new schema; the worktree is removed afterwards
- Local dry run shows the edited-history check: a temporary edit to an existing migration in a scratch commit makes `git diff --diff-filter=MDR` list it (no commit kept)
- After the owner's `db push` and `git push`, the GitHub run shows the compatibility step executing (not skipped), passing, and the deploy gate passing

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 5.

---

## Phase 5: Rules, runbook, test plan and roadmap

### Overview

Record the additive rule where agents read it, document how to unblock the gate and what rollbacks do, update the test plan, and point roadmap S-03 at this change.

### Changes Required:

#### 1. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**:

- Extend the hard rule "CI does not migrate the cloud database":
  - the `deploy` job now blocks when the cloud lacks a repo migration (unblock: `npx supabase db push`, then re-run the job);
  - migrations must stay additive and backward-compatible with the previous code version;
  - `npm run lint` enforces this through `scripts/check-migrations.mjs`, with the override comment format;
  - applied migrations are never edited.
- Mention `scripts/lib/` for CI-tooling pure rules under "Where code goes".
- Update the CI section to name the gate and the compatibility step.

**Contract**: the `## Hard rules`, `### Key conventions` ("Where code goes") and `## CI` sections.

#### 2. Lessons

**File**: `context/foundation/lessons.md`

**Intent**: Append one entry "Keep migrations additive — old code runs on the new schema", in the existing format (Context, Problem, Rule, Applies to). It names the semantic cases the lint cannot see: new enum values, a redefined function writing columns old code doesn't send.

**Contract**: a new H2 section, append-only.

#### 3. Runbook

**File**: `context/foundation/infrastructure.md`

**Intent**:

- In the runbook (`:78`, `:101-102`):
  - add the gate's two failure messages and their recovery;
  - say that `wrangler deployments list` now shows the git SHA in the message.
- Add a rollback note:
  - rolling back to a version before keepalive (d2bf69e) keeps the cron trigger but has no `scheduled` handler, so keepalive stops;
  - versions before `/api/health` (bb88c7e) make the daily health probe fail;
  - prefer the previous version.
- Update the risk-register mitigation (`:88`) to name the lint and the compatibility smoke.

**Contract**: the runbook and risk register sections only.

#### 4. Test plan

**File**: `context/foundation/test-plan.md`

**Intent**:

- §5: the gate "migration state before deploy" becomes required (in place), and a "migration lint + compatibility smoke" row is added.
- §4: add the new test files to the test-base profile.
- §6: add a cookbook subsection "Adding a migration" covering:
  - the additive rule;
  - the lint and its override;
  - `db push` before `git push`;
  - what the gate and compatibility step do;
  - how to test a new RPC in pgTAP.
- §6.6: add a Phase 3 note.

**Contract**: §4, §5 and §6. Leave the §3 Status column to `/10x-test-plan`.

#### 5. Roadmap

**File**: `context/foundation/roadmap.md`

**Intent**: Point S-03 at this change so `/10x-archive` closes it. Set its Change ID to `testing-safe-migrations` in the at-a-glance table and the item body. Note "closed by test-plan Phase 3".

**Contract**: the S-03 row and body only. Status changes stay with `/10x-implement` and `/10x-archive`.

### Success Criteria:

#### Automated Verification:

- Formatting passes on the edited docs: `npx prettier --check CLAUDE.md context/foundation/lessons.md context/foundation/infrastructure.md context/foundation/test-plan.md context/foundation/roadmap.md`
- Roadmap S-03 references this change: `grep -c "testing-safe-migrations" context/foundation/roadmap.md` is at least 2

#### Manual Verification:

- Reading only CLAUDE.md and test-plan §6, someone could add a migration, get it past the lint, push it in the right order and unblock a red gate

---

## Testing Strategy

### Unit Tests:

- **Lint rules:** literal SQL per rule, flagged and then overridden with a reason; an override without a reason is a finding; additive statements pass.
- **`compareMigrations`:** missing versions, remote-only versions, empty difference, and a migration with an older timestamp merged later.
- **`gateVerdict`:** missing versions block; an unreadable state blocks with a distinct message; remote-only versions warn; equal sets pass.

### Integration Tests:

- pgTAP: `applied_migrations()` as `anon` equals the table; direct table access is denied; definer and `search_path` settings.
- Gate script against the local stack: pass, missing (probe file), unreadable (bad URL).
- CI: the compatibility smoke on this change's own push. Base `7289510` code against the new schema.

### Manual Testing Steps:

1. A lint probe file is flagged, then passes with an override; delete it.
2. A gate probe file blocks against the local stack; delete it.
3. Local dry run of the compatibility commands with base `7289510`.
4. Owner: `npx supabase db push`, then `git push`. Watch the compatibility step run and the gate pass. `wrangler deployments list` shows the SHA.

## Performance Considerations

- **Lint:** milliseconds.
- **Gate:** one HTTP call (up to 3 tries) per deploy.
- **Compatibility smoke:** one extra `npm ci`, build and smoke, a few minutes, only when migrations change (7 of 77 commits so far).

## Migration Notes

- **One new migration** (`applied_migrations`), additive. The owner runs `npx supabase db push` **before** `git push`, per `lessons.md`. Otherwise the new gate blocks this deploy, correctly, with "Cannot read cloud migration state" (RPC 404).
- **Rollback safety:** older Worker versions don't call the RPC, so it is harmless to them.

## References

- Research: `context/changes/testing-safe-migrations/research.md`
- Test plan: `context/foundation/test-plan.md` §2 risk #2 (`:43`, `:54`), §3 Phase 3, §5
- Roadmap: `context/foundation/roadmap.md` S-03 (`:51`, `:123-134`)
- Patterns:
  - `supabase/migrations/20261004120000_keepalive.sql:26-38`
  - `supabase/tests/keepalive.test.sql`
  - `scripts/check-ui-literals.mjs`
  - `.github/workflows/health.yml`
  - `.github/workflows/ci.yml:46-57,76-80,92-127`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration lint

#### Automated

- [x] 1.1 Unit tests pass, including the new migration rules: `npm test`
- [x] 1.2 Lint passes on the current repo: `npm run lint`

#### Manual

- [x] 1.3 A lint probe migration is flagged, passes with a reasoned override, and is deleted

### Phase 2: `applied_migrations()` RPC

#### Automated

- [ ] 2.1 Database tests pass with the new file: `npx supabase test db`
- [ ] 2.2 The migration passes the Phase 1 lint with no override: `npm run lint`
- [ ] 2.3 The RPC answers over HTTP with the local publishable key and returns 8 versions

#### Manual

- [ ] 2.4 The new migration applies to the running local stack via migration up and is listed by the RPC

### Phase 3: Deploy gate and deploy SHA

#### Automated

- [ ] 3.1 Unit tests pass, including gateVerdict: `npm test`
- [ ] 3.2 Lint passes: `npm run lint`
- [ ] 3.3 Against the local stack the gate passes
- [ ] 3.4 Against an unreachable URL the gate fails with the unreadable-state message

#### Manual

- [ ] 3.5 A gate probe migration makes the gate fail and name its version; deleted
- [ ] 3.6 The ci.yml diff shows the gate before npm ci and the SHA on wrangler deploy

### Phase 4: Compatibility smoke in CI

#### Automated

- [ ] 4.1 Workflow YAML parses and lint passes

#### Manual

- [ ] 4.2 Local dry run: base 7289510 passes its own smoke on the new schema
- [ ] 4.3 Local dry run: an edited existing migration is listed by the history check
- [ ] 4.4 After db push and git push, CI runs the compatibility step and the gate passes

### Phase 5: Rules, runbook, test plan and roadmap

#### Automated

- [ ] 5.1 Prettier check passes on the edited docs
- [ ] 5.2 Roadmap S-03 references this change

#### Manual

- [ ] 5.3 CLAUDE.md and test-plan §6 are enough to add and ship a migration
