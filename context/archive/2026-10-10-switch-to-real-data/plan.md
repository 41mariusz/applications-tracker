# Safe switch to real data (S-05) Implementation Plan

## Overview

The roadmap's S-05 (MS-06) is the one-time switch from demo data to real data. It needs a tool that wipes the owner's account safely, so this plan builds that tool:

- **Clear-only mode:** `scripts/demo-data.mjs` gets `--clear-only`, which empties the account without seeding new demo data.
- **Preview by default:** every destructive run first shows what would be deleted.
- **Explicit confirmation:** a destructive run deletes only with `--confirm=<account e-mail>`.
- **Real-data guard:** the script refuses while non-`[TEST]` applications exist, unless `--include-real` is passed.
- **`--reset`** goes through the same guard.

The production wipe itself is **not** part of this plan. The owner decided on 2026-10-10 to prepare the tool now and wipe later, on an explicit "czyść".

## Current State Analysis

- **`--reset` wipes, then reseeds, with no safeguard.** `scripts/demo-data.mjs:187-201` (`resetUser`) does, in order:
  - deletes the user's `applications`, which cascades to notes, note revisions, status and field history (comment `:188`);
  - lists and removes `cvs/<user_id>/*` from Storage;
  - deletes the user's `cv_files` rows.

  The script then always seeds new demo data (`:364-377`). There is no preview, no confirmation and no wipe-only mode. Before deleting it prints only `Account: <email> (<URL>)` (`:365`).

- **Account and environment.** `findUser` (`:172-185`) picks the only user, or `DEMO_EMAIL`. Environment variables take precedence over `.env` (`:17`), so a local run can point at local Supabase explicitly.
- **Decisions already made:**
  - The switch wipes **everything** — applications, notes, history, CV rows and files. It runs once, before the first real application, and only with the owner's go-ahead. Sources: `context/foundation/prd.md:72` (FR-004 update), `context/foundation/roadmap.md:158`, `CLAUDE.md` ("Other scripts" bullet), and domain distillation Q-01.
  - Demo applications are recognisable by the `[TEST] ` prefix on `company` (`:337`).
- **Test conventions.** Pure rules for scripts live in `scripts/lib/` with a `.test.mjs`, which `npm test` runs (`vitest.config.ts:9`; example `scripts/lib/migrations.mjs` + `migrations.test.mjs`).

## Desired End State

- **Preview by default.** `node scripts/demo-data.mjs --clear-only` (or `--reset`) without `--confirm` prints the target and counts, then exits **without deleting anything**:
  - account e-mail and Supabase URL;
  - number of applications, notes, status changes, field changes, CV rows and stored CV files that would be deleted.
- **Deleting needs a matching e-mail.** With `--confirm=<that account's e-mail>`, `--clear-only` deletes everything and seeds nothing, then reports what it deleted. A different e-mail refuses.
- **Real-data guard.** When any application's `company` does not start with `[TEST]`, a destructive run refuses. It lists up to 5 such applications (company and position) and tells the owner to pass `--include-real` to delete them anyway.
- **`--reset`** follows the same preview, confirmation and guard rules, then seeds as before.
- **Default mode unchanged.** The default run (no flags) seeds exactly as today.
- **Docs.** `CLAUDE.md` documents the modes and gives the exact production switch command.

### Key Discoveries:

- `scripts/demo-data.mjs:189` deletes with `.delete({ count: "exact" })`. Counts for the preview can use `select("*", { count: "exact", head: true })` per table with the same `user_id` filter. No rows are fetched.
- `db.storage.from("cvs").list(userId, { limit: 1000 })` (`:192`) is how the script finds stored files. The preview counts the same list.
- The script is plain Node ESM using `@supabase/supabase-js` only. A pure rule module must not import it, so Vitest can test the rule without a database.

## What We're NOT Doing

- Wiping production. That is a separate step on the owner's explicit "czyść", before the first real entry, so S-05 stays open after this plan.
- Changes to the app, migrations, RLS or the "nothing is deleted" rules for the app itself.
- Changes to the default seeding mode or the demo data set.
- Backups or export before wiping. The decision is to wipe everything, and the data is demo data.
- An interactive terminal prompt. Confirmation is the `--confirm=` flag, so the script also works through `!` in Claude Code.

## Implementation Approach

1. Put the decision logic in a pure module under `scripts/lib/`: given the mode, flags, account e-mail and the companies currently on the account, return preview, proceed or refuse with a reason. Unit-test it.
2. Wire it into `scripts/demo-data.mjs`.
3. Prove the whole path against local Supabase with the target set explicitly.
4. Document it.

## Critical Implementation Details

- **Target safety during local proof:** every local run in this plan sets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` of the **local** stack (from `npx supabase status -o env`) in the command's environment. `.env` may point at production and is never edited. The preview prints the URL first; a run whose URL is not `http://127.0.0.1:54321` is stopped before any `--confirm`.
- **Guard before confirmation:** the real-data guard is checked before the confirmation. A refusal for real data does not depend on whether `--confirm` was given, so a confirmed run cannot slip past the guard.

## Phase 1: Safe clear-only mode with preview, confirmation and real-data guard

### Overview

A pure decision rule plus its tests, the script wired to it, a local proof of every branch, and the docs.

### Changes Required:

#### 1. Decision rule

**File**: `scripts/lib/demo-data-guard.mjs` (+ `scripts/lib/demo-data-guard.test.mjs`)

**Intent**: Decide, without I/O, whether a destructive run previews, proceeds or refuses, so the rules are testable and the script stays thin.

**Contract**:

- `parseDemoArgs(argv) → { mode: "seed" | "reset" | "clear-only", confirm: string | null, includeReal: boolean }`.
  - `--reset` and `--clear-only` together → an error result, not a silent pick.
  - `--confirm=<e-mail>` is read case-insensitively and trimmed.
- `decideWipe({ mode, confirm, includeReal, accountEmail, companies }) → { action: "seed" | "preview" | "proceed" | "refuse", reason?: string, realExamples?: string[] }`.
  - `seed` mode → `seed`.
  - Destructive mode and any company not starting with `[TEST]` without `includeReal` → `refuse`, with up to 5 examples. This is checked first.
  - Destructive mode with no `confirm` → `preview`.
  - Destructive mode with `confirm` ≠ `accountEmail` (case-insensitive) → `refuse`.
  - Otherwise → `proceed`.
- Tests cover every branch, including:
  - an empty account (no companies) → preview/proceed;
  - a guard refusal even with a correct `confirm`;
  - `includeReal` lifting the guard;
  - e-mail case differences.

#### 2. Script wiring

**File**: `scripts/demo-data.mjs`

**Intent**: Use the rule for `--reset` and the new `--clear-only`, add the preview counts, and keep the default seed path unchanged.

**Contract**:

- **Header comment** documents the three modes and the two flags.
- **Destructive modes, in order:**
  1. print the account e-mail and URL;
  2. read the account's companies;
  3. compute counts for `applications`, `notes`, `status_changes`, `field_changes`, `cv_files` and the stored files under `cvs/<user_id>/`;
  4. call `decideWipe`.
- **Outcomes:**
  - `preview` prints the counts and the exact command to proceed (`--confirm=<e-mail>`), exits 0, deletes nothing;
  - `refuse` prints the reason (and examples), exits non-zero, deletes nothing;
  - `proceed` runs the existing `resetUser` and prints what was deleted. Then `--clear-only` stops, while `--reset` seeds as today.
- **Argument errors** from `parseDemoArgs` exit non-zero before any database call.

#### 3. Docs

**File**: `CLAUDE.md`

**Intent**: Replace the "Other scripts" description of `--reset` with the guarded modes and the production switch command.

**Contract**: the "Other scripts" bullet says:

- `npm run demo-data` seeds;
- `-- --clear-only` and `-- --reset` preview by default and delete only with `--confirm=<account e-mail>`;
- they refuse while non-`[TEST]` applications exist unless `--include-real` is passed;
- the one sanctioned production use is the S-05 switch, `npm run demo-data -- --clear-only --confirm=<owner e-mail>`, run once before the first real application with the owner's go-ahead.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, incl. `scripts/lib/demo-data-guard.test.mjs`: `npm test`
- Lint and types pass: `npm run lint` and `npx astro check`

#### Manual Verification:

All runs are against **local** Supabase with the env set explicitly.

- **Preview:** after `npm run demo-data` seeds a local user, `--clear-only` without `--confirm` shows the local URL and non-zero counts, and afterwards the counts are unchanged (nothing deleted).
- **Wrong e-mail:** `--clear-only --confirm=wrong@example.com` refuses with a non-zero exit, and nothing is deleted.
- **Real-data guard:**
  - after inserting one application without `[TEST]`, `--clear-only --confirm=<e-mail>` refuses and names it;
  - with `--include-real` it proceeds.
- **Proceed:** `--clear-only --confirm=<e-mail>` leaves 0 applications, notes, history rows and `cv_files` rows for the user, and an empty `cvs/<user_id>/` folder. No demo data is seeded.
- **Reset:** `--reset --confirm=<e-mail>` wipes and seeds ~300 `[TEST]` applications again, as before.
- **Break check:** with the guard check removed from `decideWipe` (worktree only), the guard unit test goes red. Restored afterwards.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `parseDemoArgs`:
  - each mode;
  - `--confirm=` parsing (case, spaces);
  - `--include-real`;
  - `--reset` together with `--clear-only` → error.
- `decideWipe`:
  - seed;
  - preview;
  - proceed;
  - refuse for a wrong e-mail;
  - refuse for real data even with a correct e-mail;
  - `includeReal`;
  - an empty account;
  - at most 5 examples.

### Integration Tests:

- The local runs under Manual Verification exercise the real Supabase calls: counts, the cascade, Storage removal.

### Manual Testing Steps:

1. Seed a local user, preview, then confirm the counts are unchanged.
2. Try a wrong e-mail, then a real-data application with and without `--include-real`.
3. Clear and check all six counts and the bucket folder.
4. Run `--reset` to confirm it still seeds.

## Performance Considerations

None. The preview uses head-only count queries; the delete path is unchanged.

## Migration Notes

No migration. The production wipe is a separate, later step:

```
npm run demo-data -- --clear-only
npm run demo-data -- --clear-only --confirm=<owner e-mail>
```

Run the first command (preview) first, check the URL and counts, then the second. Run it once, before the first real application, on the owner's "czyść".

## References

- Roadmap S-05: `context/foundation/roadmap.md` (`### S-05: Switch to real data`)
- Decision: `context/foundation/prd.md:72` (FR-004 update, domain distillation Q-01)
- Script: `scripts/demo-data.mjs:172-201,364-377`
- Pattern for script rules: `scripts/lib/migrations.mjs`, `scripts/lib/migrations.test.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Safe clear-only mode with preview, confirmation and real-data guard

#### Automated

- [x] 1.1 Unit tests pass incl. demo-data-guard.test.mjs: `npm test` — 5c39abe
- [x] 1.2 Lint and types pass: `npm run lint` and `npx astro check` — 5c39abe

#### Manual

- [x] 1.3 Local: preview shows local URL and counts and deletes nothing — 5c39abe
- [x] 1.4 Local: wrong --confirm e-mail refuses and deletes nothing — 5c39abe
- [x] 1.5 Local: a non-[TEST] application makes the run refuse; --include-real proceeds — 5c39abe
- [x] 1.6 Local: --clear-only --confirm leaves 0 rows in all six places and an empty bucket folder, no seeding — 5c39abe
- [x] 1.7 Local: --reset --confirm wipes and seeds ~300 [TEST] applications again — 5c39abe
- [x] 1.8 Break check: guard removed from decideWipe turns the unit test red; restored — 5c39abe
