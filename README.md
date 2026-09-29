# Applications Tracker

A personal job-application tracker — an "ATS for the candidate". When a recruiter calls unexpectedly, find the right application in seconds and see the salary range, the rate you quoted, its status, and what was agreed in earlier calls. Built for one user, on phone and desktop.

**Live:** https://applications-tracker.41mariusz.workers.dev (single provisioned account; no self sign-up)

## Features

- **Applications** — company, position, posting link, salary range, the rate you quoted, HR contact, application date, employment type, work mode. Only company and position are required.
- **Business rule: statuses and ordering** — Sent → HR contact → Interviews → Offer → Accepted, plus Rejected / Withdrawn. Status only moves forward (skipping is fine) or to closed; leaving a closed status needs confirmation. The list is ordered by stage, then most recent activity; closed applications sit at the bottom, crossed out.
- **Search** — by company, position, HR name, or HR phone; ignores case, Polish diacritics, and phone formatting (`+48 600 100 200` = `600-100-200`). Filters as you type; `/dashboard?q=…` works without JavaScript.
- **Details for a call** — rates, status, and the latest agreement first; tap-to-call HR.
- **Notes** — typed (phone call / comment), dated, newest first.
- **Nothing is lost** — edits to fields, statuses, and notes are logged with old and new values; "removing" an application sets it to Withdrawn, and a removed note stays on the timeline crossed out. A change and its history entry are saved in one transaction.

Product requirements, decisions, and scope: [`context/foundation/prd.md`](context/foundation/prd.md).

## Tech stack

Astro 7 (SSR) · React 19 · TypeScript · Tailwind 4 · Supabase (Postgres, Auth, RLS) · Cloudflare Workers · Vitest · pgTAP · GitHub Actions. Rationale: [`context/foundation/tech-stack.md`](context/foundation/tech-stack.md).

## Project layout

| Path                        | What lives there                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `src/lib/domain/`           | Pure business rules (status transitions, ordering, search, notes, change log) + unit tests |
| `src/lib/services/`         | Supabase reads and writes                                                                  |
| `src/pages/`                | Pages and API routes (`src/pages/api/`)                                                    |
| `src/components/`           | Astro and React components                                                                 |
| `supabase/migrations/`      | Schema, RLS policies, and atomic write functions                                           |
| `supabase/tests/`           | pgTAP database tests                                                                       |
| `scripts/smoke.mjs`         | End-to-end smoke test                                                                      |
| `context/foundation/`       | Shape notes, PRD, tech-stack decision                                                      |
| `CLAUDE.md` (= `AGENTS.md`) | Rules for AI coding agents                                                                 |

## Running locally

Requirements: Node.js 22+ (`.nvmrc`), npm, Docker (for local Supabase).

```bash
npm install
cp .env.example .env
```

Point `.env` at a Supabase project — either:

- **Local** (recommended for development): `npx supabase start`, then copy `API URL` and the anon / publishable key from its output. Migrations are applied automatically.
- **Cloud**: Project Settings → API — the project URL and the **publishable (anon)** key. Never use the secret / service-role key in the app: it bypasses RLS.

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon or publishable key>
```

Create your account in Supabase (Authentication → Users → Add user, with _Auto Confirm_). Sign-ups are disabled by design.

```bash
npm run dev   # http://localhost:4321
```

## Tests

| Command                | What it checks                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`             | Vitest unit tests of the business rules in `src/lib/domain/`                                                                                                                   |
| `npx supabase test db` | pgTAP: atomic writes roll back together, stale updates are refused, RLS holds through the functions                                                                            |
| `npm run smoke`        | End-to-end against a running server: sign-in, adding / editing / searching applications, status rules, notes, and that a second user can't see or change the first user's data |

The smoke test creates its users through the Supabase admin API, so it needs a **local** Supabase:

```bash
npm run build && npm run preview &
BASE_URL=http://localhost:4321 SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_ROLE_KEY=<from `npx supabase status`> npm run smoke
```

`npm run lint` and `npx astro check` cover style and types.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) on every push and PR to `main`:

1. **ci** — lint, unit tests, type check, build.
2. **smoke** — local Supabase in the runner, database tests, production build, smoke test.
3. **deploy** — on `main` only, after both pass: `wrangler deploy` to Cloudflare Workers.

Repository secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. The Worker's own `SUPABASE_URL` / `SUPABASE_KEY` are set with `wrangler secret put`.

**Database changes** are not applied by CI: after adding a migration, run `npx supabase db push` against the cloud project **before** pushing code that depends on it.

## Built with AI agents

Discovery, PRD, and stack choice were done in structured sessions with an AI agent (`context/foundation/`); implementation was agent-assisted, with the agent's rules in `CLAUDE.md`.
