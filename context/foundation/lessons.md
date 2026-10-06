# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Run db push before pushing code with a migration

- **Context**: Changes that add migrations in `supabase/migrations/`
- **Problem**: Without it, production breaks.
- **Rule**: Always run `npx supabase db push` before pushing code that includes a migration.
- **Applies to**: all

## Keep migrations additive — old code runs on the new schema

- **Context**: Changes that add migrations in `supabase/migrations/`
- **Problem**: The previous code version runs on the new schema between `npx supabase db push` and the deploy, and again after any `wrangler rollback`. A drop, rename, signature change or new NOT NULL column breaks it in production even though every test passed on the new code.
- **Rule**: Write migrations that the previous code version still works with: new tables, nullable or defaulted columns, new functions under new names. Never edit an applied migration. `npm run lint` flags breaking statements; an intentional break needs `-- migration-lint: allow <rule> — <reason>` and a two-step rollout. Review what the lint cannot see: new enum values old code cannot render, and redefined functions that write columns old code doesn't send.
- **Applies to**: all
