# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

## Hard rules

- Single-user app: **no self sign-up**. The owner account is created in the Supabase dashboard; sign-ups are disabled in Supabase Auth settings.
- **Nothing is deleted** (PRD guardrail): no delete RLS policies; "removing" an application = status `withdrawn`; a removed note gets `deleted_at` and stays visible; note edits keep the old version in `note_revisions`; CV files are never removed.
- **Every change leaves a trace**: `status_changes`, `field_changes` (incl. field `cv`), `note_revisions`. A change and its trace are written by one SQL function (see `npx supabase test db` below).
- `PROTECTED_ROUTES` (page prefixes redirected to sign-in): `/dashboard`, `/applications`, `/cv`. API routes are not covered by it — each checks `context.locals.user` and returns 401 itself.
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (publishable/anon key only — copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev). `SUPABASE_SERVICE_ROLE_KEY` may sit in the local `.env` for `scripts/demo-data.mjs` only — the app must never read it. `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` in `.env` enable manual `wrangler` commands.
- **CI does not migrate the cloud database.** After adding a migration, the owner runs `npx supabase db push`; verify it is applied before pushing code that depends on it, or production breaks on deploy.
- Other scripts: `npm run demo-data` (`scripts/demo-data.mjs`) loads ~300 `[TEST]` applications plus CV PDFs for manual testing; `-- --reset` first **deletes all** of the target user's applications and CVs — never run it against production without the owner's explicit go-ahead.

## Product context

- `context/foundation/prd.md` — product requirements (FRs, business logic, non-goals). Read it before implementing a feature.
- `context/foundation/tech-stack.md` — chosen stack and why.

## Commands

- Standard scripts (`dev` — Cloudflare workerd runtime, `build`, `preview`, `lint`, `lint:fix`, `format`): @package.json
- `npm test` — Vitest unit tests (`src/**/*.test.ts`), e.g. the status-transition and list-ordering rule in `src/lib/domain/status.ts`.
- `npx supabase test db` — pgTAP database tests in `supabase/tests/` (local Supabase): writes that must be atomic go through SQL functions (`change_application_status`, `update_application`, `add_note`, `edit_note`, `set_application_cv`) so a change and its history row are saved together. Keep new "change + trace" writes in such functions.
- `npm run smoke` — dependency-free end-to-end smoke test (`scripts/smoke.mjs`): auth, adding an application, status transitions incl. terminal → terminal and the revert marker, importance ordering of the list, notes (add/edit/remove with history), editing with a field change log, search (`/dashboard?q=`), status filter (`?status=`), CV upload with deduplication, an oversized upload refused with 413, and the CV library page (`/cv`), per-user data isolation, the public health check (`/api/health`, after a fresh `keepalive_ping`). Runs against a live server (`BASE_URL`, default `http://localhost:4321`) and needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` of a **local** Supabase to create test users (no self sign-up). CI runs it against the production preview with a local Supabase. Extend it with each user-facing feature.

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro,mjs}` and `prettier --write` on `*.{json,css,md}`. The hook only sees staged files — run `npm run lint` before committing changes to anything else.

## Architecture

**Astro 7 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES` to `/auth/signin?next=<path+query>`; when Supabase is paused (HTTP 540) it redirects pages to `/paused` and answers `/api/*` with 503.
- Auth: `src/pages/api/auth/{signin,signout}.ts` and `src/pages/auth/signin.astro`; the form posts `next` as a hidden field and sign-in returns there only through `safeNextPath()` (`src/lib/domain/redirect.ts`, in-app paths only — no open redirect). There is **no sign-up** (PRD FR-001) — don't reintroduce it. A signed-in user hitting `/` is redirected to `/dashboard`.

### Domain and data

- **Pages**: `/dashboard` (list, search `?q=`, status filter `?status=`), `/applications/new`, `/applications/[id]` (details: call summary, notes, CV, history; malformed/unknown id → 404, failed read → 500), `/applications/[id]/edit`, `/cv` (CV library), `/paused` (public; Supabase project paused), `404.astro` ("Nie znaleziono"), `/dev/ui` (kitchen sink of the details view's components in 7 states; dev only — 404 in production builds, not linked).
- **Business rules live in `src/lib/domain/`** as pure functions with Vitest tests: `status.ts` (allowed transitions, list ordering), `search.ts` (search + status filter), `notes.ts`, `changes.ts` (field diff, merged history), `cv.ts` (file checks, SHA-256, grouping), `keepalive.ts` (health rule), `redirect.ts` (`safeNextPath`), `ids.ts` (`isUuid`). Put new rules there, not in components or routes.
- **Supabase access lives in `src/lib/services/`** (`applications.ts`, `notes.ts`, `cv.ts`, `keepalive.ts`).
- **CV files**: private bucket `cvs`, path `<user_id>/<sha256>.<ext>`, unique `(user_id, sha256)` in `cv_files` — identical content is stored once. Size is checked early: the browser runs `checkCvFile` before sending, and `POST /api/cv` answers 413 when `Content-Length` exceeds 5 MB + 64 KiB (`isUploadRequestTooLarge`), before parsing the body. Served only through `GET /api/cv/[id]` (inline; `?download=1` for attachment). Preview renders in the browser (`cv-render.ts`: pdf.js, docx-preview), loaded on demand.
- **Keepalive**: `wrangler.jsonc` `main` is the custom entry `src/worker.ts` — it serves Astro via `@astrojs/cloudflare/handler` and adds a `scheduled` handler (cron `0 */6 * * *`) that calls `keepalive_ping()` so Supabase is not paused when idle. Table `keepalive` (one row) has RLS with no policies and no anon/authenticated grants on purpose: access only through `keepalive_ping()` / `keepalive_status()` (`src/lib/services/keepalive.ts`). `GET /api/health` (public, no auth, `no-store`) returns 200 `{ status: "ok", pingedAt }` when the last ping is at most 24 h old, otherwise 503 with the reason (`ping_stale`, `paused`, `db_unreachable`) — rule in `src/lib/domain/keepalive.ts`; `.github/workflows/health.yml` probes it in production daily, so a failure becomes a GitHub email. A paused project answers HTTP 540: the server Supabase client (`src/lib/supabase.ts`) wraps `fetch` with `withPauseDetection()` and `isProjectPaused()` (`src/lib/supabase-paused.ts`) recognises it — middleware then redirects pages to the public `/paused` page (Polish restore instructions) and answers `/api/*` with 503 `{ error: "database_paused" }` (except `/api/health` and `/api/auth/signout`); sign-in redirects to `/paused`. Known limit: anyone with the publishable key can call `keepalive_ping()`, so a fresh heartbeat does not prove the cron itself ran — check the Cloudflare cron history if in doubt.
- UI text is Polish; code, comments and docs are English. Dates display in `Europe/Warsaw` (`src/lib/format.ts`).

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Where code goes**: pure business rules → `src/lib/domain/` (with a `.test.ts`); Supabase reads/writes → `src/lib/services/`; other helpers → `src/lib/`.
- **Shared types** (entities, DTOs) go in `src/types.ts`.
- **UI contract (design tokens)**: one dark theme. Colours, surfaces and focus come from tokens in `src/styles/global.css` (`:root`; values and the literals they replaced are on record in `context/archive/2026-10-05-fast-details-on-phone/tokens.md`), used as classes such as `bg-card`, `bg-muted`, `text-muted-foreground`, `text-supporting-foreground`, `text-link`, `text-destructive`, `text-warning`, `border-border`, `ring-ring`. Check `src/components/ui/` before creating a component; add missing ones with `npx shadcn@latest add <name>`. **No literal colours or arbitrary values in views** (`text-purple-300`, `bg-white/10`, `#hex`, `p-[13px]`) — use tokens. Views already on the contract are listed in `scripts/check-ui-literals.mjs`, which `npm run lint` runs (it fails on a literal); add a view there when you migrate it. The dev-only kitchen sink `/dev/ui` shows the components in all 7 states. Do not use the `destructive` Button variant as-is: `--destructive` is a text colour for the dark background.

### Environment

- Node.js v22.14.0 per `.nvmrc` (CI uses Node 22); local dev also runs on Node 24.
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: CI job `deploy` runs `npx wrangler deploy` after `ci` + `smoke` pass on `main` (GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). Manual: `npm run build && npx wrangler deploy` with the same two vars in `.env`. Production: https://applications-tracker.41mariusz.workers.dev (Worker secrets `SUPABASE_URL`, `SUPABASE_KEY` set via `wrangler secret`).

## CI

@.github/workflows/ci.yml — `ci` (lint, unit tests, `astro check`, build) → `smoke` (local Supabase, `supabase test db`, `npm run smoke`) → `deploy` (`main` only). @.github/workflows/health.yml — daily probe of production `/api/health` (schedule + manual `workflow_dispatch`).
