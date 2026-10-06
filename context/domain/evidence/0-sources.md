# Sources: code

- repo_root: /home/dev/10xdevs
- code_scope: . (single application)
- head: c5dd734 (clean)

## Stack

- TypeScript, Astro 7 (SSR, `output: "server"`) with React 19 islands, Tailwind 4, shadcn/ui
- Supabase (Postgres + Auth + Storage) via `@supabase/ssr` / `@supabase/supabase-js`; SQL migrations and pgTAP tests
- Runtime: Cloudflare Workers (custom entry `src/worker.ts`, cron trigger in `wrangler.jsonc`)
- Validation: zod; unit tests: Vitest; E2E: Playwright; dependency-free smoke script (Node)

## Layers

| layer                | path patterns                                                                                                                                                                                                                                                     | notes                                                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| entry points         | `src/pages/**/*.astro` (server-rendered pages), `src/pages/api/**/*.ts` (HTTP endpoints, uppercase `GET`/`POST`/... exports), `src/middleware.ts` (runs on every request), `src/worker.ts` (Worker entry + `scheduled` handler), `wrangler.jsonc` (cron schedule) | file-system routing; `[id]` = dynamic segment                                                                                                                                                  |
| application logic    | `src/lib/services/*.ts` (database reads/writes), `src/lib/http.ts`, `src/lib/api-client.ts`                                                                                                                                                                       | services take a database client; no separate use-case layer                                                                                                                                    |
| domain types / rules | `src/lib/domain/*.ts` (pure functions, each with a `.test.ts`), `src/types.ts` (shared types and DTOs)                                                                                                                                                            | the codebase keeps pure rules in their own folder                                                                                                                                              |
| persistence          | `supabase/migrations/*.sql` (tables, constraints, RLS policies, SQL functions), `supabase/config.toml`                                                                                                                                                            | several writes go through SQL functions called by name from services                                                                                                                           |
| UI                   | `src/components/**/*.tsx                                                                                                                                                                                                                                          | astro`(React islands and Astro components),`src/components/ui/`(generic shadcn primitives),`src/layouts/`, user-facing copy is inline Polish text in components/pages (no translation catalog) |     |
| tests                | `src/**/*.test.ts` (Vitest), `supabase/tests/*.test.sql` (pgTAP), `tests/e2e/*.spec.ts` (Playwright), `scripts/smoke.mjs` (HTTP smoke)                                                                                                                            | tests often state rules in their names                                                                                                                                                         |

## Excluded

| path                                                                                                             | reason                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `context/domain/`, `context/archive/*-domain-distillation/`                                                      | this skill's own output (none exists yet)                                                        |
| `context/map/`                                                                                                   | an earlier repo analysis — would feed its conclusions back in                                    |
| `.claude/`, `.agents/`, `skills-lock.json`, `.10x-cli.json`                                                      | agent configuration and vendored course skills, not the product                                  |
| `scripts/check-*.mjs`, `scripts/lib/`, `.github/`, `.husky/`, eslint/prettier/vitest/playwright/tsconfig configs | developer and release tooling                                                                    |
| `scripts/demo-data.mjs`                                                                                          | operator tool that seeds test data; may be read to confirm data shapes, not as product behaviour |
| `src/pages/dev/`                                                                                                 | dev-only kitchen sink (404 in production)                                                        |
| `src/components/ui/`                                                                                             | generic UI primitives (still in the UI layer list for completeness; no domain logic expected)    |
| `package-lock.json`, `public/`                                                                                   | generated / static assets                                                                        |
| `CLAUDE.md`, `AGENTS.md`                                                                                         | agent instruction files that describe the product — reference documents for the docs agent only  |
