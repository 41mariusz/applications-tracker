# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Run db push before pushing code with a migration

- **Context**: Changes that add migrations in `supabase/migrations/`
- **Problem**: Without it, production breaks.
- **Rule**: Always run `npx supabase db push` before pushing code that includes a migration.
- **Applies to**: all
