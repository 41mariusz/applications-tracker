# Safe switch to real data (S-05) — Plan Brief

> Full plan: `context/changes/switch-to-real-data/plan.md`

## What & Why

Before entering real job applications, the owner must wipe the ~300 `[TEST]` applications and the demo CV files from production. That is a one-way operation and nothing can undo it. Today the only tool, `demo-data --reset`, deletes everything at once with no preview, no confirmation and no protection, and then reseeds demo data. This plan makes the wipe safe and wipe-only. The wipe itself happens later, on the owner's go-ahead.

## Starting Point

`scripts/demo-data.mjs`:

- seeds demo data by default;
- with `--reset`, it first deletes all of the account's applications (cascading notes and history), its CV rows and its stored CV files, then seeds again.

Before deleting, it prints only the account and URL.

## Desired End State

`npm run demo-data -- --clear-only`:

- **Preview:** shows the account, the URL and how many applications, notes, history rows, CV rows and files would be deleted, then stops.
- **Confirmed run:** deletes only when run again with `--confirm=<account e-mail>`, and does not seed anything new.
- **Real-data guard:** refuses while any application lacks the `[TEST]` prefix, unless `--include-real` is given.
- **`--reset`:** has the same protections.

## Key Decisions Made

| Decision                | Choice                                                                     | Why (1 sentence)                                                                                              |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Wipe now or later       | Prepare the tool now, wipe production later on "czyść"                     | The owner is still testing on demo data.                                                                      |
| What the switch deletes | Everything on the account: applications, notes, history, CV rows and files | Decided earlier (Q-01, PRD FR-004 update).                                                                    |
| Confirmation            | Preview by default; delete only with `--confirm=<account e-mail>`          | Nothing disappears by mistake, the account is named on purpose, and it works without an interactive terminal. |
| Real-data guard         | Refuse while non-`[TEST]` applications exist, unless `--include-real`      | After the switch, an accidental run cannot destroy real data.                                                 |
| `--reset`               | Same preview, confirmation and guard                                       | Both destructive modes are equally dangerous.                                                                 |
| Where the rules live    | Pure module `scripts/lib/demo-data-guard.mjs` with Vitest tests            | Follows the repo's rule for script logic and is testable without a database.                                  |

## Scope

**In scope:**

- the decision rule with tests;
- `--clear-only`, the preview counts, `--confirm=` and `--include-real` in `scripts/demo-data.mjs`;
- `--reset` behind the same rules;
- a local proof of every branch;
- CLAUDE.md with the production switch command.

**Out of scope:**

- the production wipe;
- app or schema changes;
- backups or export;
- an interactive prompt;
- changes to the demo data set.

## Architecture / Approach

The script reads the account's companies and counts, then asks a pure function what to do: seed, preview, proceed or refuse. Only "proceed" reaches the existing delete code. The guard is checked before the confirmation, so a confirmed run cannot slip past it.

## Phases at a Glance

| Phase                   | What it delivers                                | Key risk                                                                                                              |
| ----------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1. Safe clear-only mode | Rule + tests, guarded script, local proof, docs | A local test pointed at production by `.env`; every run sets the local URL explicitly, and the preview shows it first |

**Prerequisites:** a local Supabase stack running (`npx supabase start`).
**Estimated effort:** one short session.

## Open Risks & Assumptions

- `[TEST]` on `company` is the only marker of demo data. A real application whose company starts with `[TEST]` would be treated as demo (acceptable: the owner controls the names).
- The Storage listing in the script reads up to 1000 files per folder, which is enough for this account (demo has 4).

## Success Criteria (Summary)

- Running the switch without `--confirm` deletes nothing and shows exactly what would go.
- A run cannot delete real (non-`[TEST]`) applications by accident.
- With the right confirmation, the account ends up empty and ready for real data.
