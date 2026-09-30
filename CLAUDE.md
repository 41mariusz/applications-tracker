# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

## Product context

- `context/foundation/prd.md` — product requirements (FRs, business logic, non-goals). Read it before implementing a feature.
- `context/foundation/tech-stack.md` — chosen stack and why.
- Single-user app: **no self sign-up**. The owner account is created in the Supabase dashboard; sign-ups are disabled in Supabase Auth settings.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npm test` — Vitest unit tests (`src/**/*.test.ts`), e.g. the status-transition and list-ordering rule in `src/lib/domain/status.ts`.
- `npx supabase test db` — pgTAP database tests in `supabase/tests/` (local Supabase): writes that must be atomic go through SQL functions (`change_application_status`, `update_application`, `add_note`, `edit_note`, `set_application_cv`) so a change and its history row are saved together. Keep new "change + trace" writes in such functions.
- `npm run smoke` — dependency-free end-to-end smoke test (`scripts/smoke.mjs`): auth, adding an application, status transitions, notes (add/edit/remove with history), editing with a field change log, search (`/dashboard?q=`), status filter (`?status=`), CV upload with deduplication and the CV library page (`/cv`), per-user data isolation. Runs against a live server (`BASE_URL`, default `http://localhost:4321`) and needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` of a **local** Supabase to create test users (no self sign-up). CI runs it against the production preview with a local Supabase. Extend it with each user-facing feature.

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro,mjs}` and `prettier --write` on `*.{json,css,md}`. The hook only sees staged files — run `npm run lint` before committing changes to anything else.

Other scripts: `npm run demo-data` (`scripts/demo-data.mjs`) loads ~300 `[TEST]` applications plus CV PDFs for manual testing; `-- --reset` first **deletes all** of the target user's applications and CVs — never run it against production without the owner's explicit go-ahead.

## Architecture

**Astro 7 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- Auth: `src/pages/api/auth/{signin,signout}.ts` and `src/pages/auth/signin.astro`. There is **no sign-up** (PRD FR-001) — don't reintroduce it. A signed-in user hitting `/` is redirected to `/dashboard`.
- `PROTECTED_ROUTES` (page prefixes redirected to sign-in): `/dashboard`, `/applications`, `/cv`. API routes are not covered by it — each checks `context.locals.user` and returns 401 itself.

### Domain and data

- **Pages**: `/dashboard` (list, search `?q=`, status filter `?status=`), `/applications/new`, `/applications/[id]` (details: call summary, notes, CV, history), `/applications/[id]/edit`, `/cv` (CV library).
- **Business rules live in `src/lib/domain/`** as pure functions with Vitest tests: `status.ts` (allowed transitions, list ordering), `search.ts` (search + status filter), `notes.ts`, `changes.ts` (field diff, merged history), `cv.ts` (file checks, SHA-256, grouping). Put new rules there, not in components or routes.
- **Supabase access lives in `src/lib/services/`** (`applications.ts`, `notes.ts`, `cv.ts`).
- **Nothing is deleted** (PRD guardrail): no delete RLS policies; "removing" an application = status `withdrawn`; a removed note gets `deleted_at` and stays visible; note edits keep the old version in `note_revisions`; CV files are never removed.
- **Every change leaves a trace**: `status_changes`, `field_changes` (incl. field `cv`), `note_revisions`. A change and its trace are written by one SQL function (see `npx supabase test db` above).
- **CV files**: private bucket `cvs`, path `<user_id>/<sha256>.<ext>`, unique `(user_id, sha256)` in `cv_files` — identical content is stored once. Served only through `GET /api/cv/[id]` (inline; `?download=1` for attachment). Preview renders in the browser (`cv-render.ts`: pdf.js, docx-preview), loaded on demand.
- UI text is Polish; code, comments and docs are English. Dates display in `Europe/Warsaw` (`src/lib/format.ts`).

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

### Environment

- Node.js v22.14.0 per `.nvmrc` (CI uses Node 22); local dev also runs on Node 24.
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (publishable/anon key only — copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev). `SUPABASE_SERVICE_ROLE_KEY` may sit in the local `.env` for `scripts/demo-data.mjs` only — the app must never read it. `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` in `.env` enable manual `wrangler` commands.
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: CI job `deploy` runs `npx wrangler deploy` after `ci` + `smoke` pass on `main` (GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). Manual: `npm run build && npx wrangler deploy` with the same two vars in `.env`. Production: https://applications-tracker.41mariusz.workers.dev (Worker secrets `SUPABASE_URL`, `SUPABASE_KEY` set via `wrangler secret`).

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`), on every push and PR to `main`:

1. **ci** — `npm ci`, `astro sync`, lint, `npm test`, `astro check`, build.
2. **smoke** — local Supabase in the runner (storage enabled), `supabase test db`, production build + preview, `npm run smoke`.
3. **deploy** — pushes to `main` only, after both pass: `wrangler deploy` (job runs in the `SUPABASE` environment).

Secrets (repository scope): `SUPABASE_URL`, `SUPABASE_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

**CI does not migrate the cloud database.** After adding a migration, the owner runs `npx supabase db push`; verify it is applied before pushing code that depends on it, or production breaks on deploy.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit — Module 1, Lesson 3

Scaffold the project for the stack you picked in Lesson 2, with the **bootstrap chain**:

```
(/10x-init  →  /10x-shape  →  /10x-prd)  →  /10x-tech-stack-selector  →  /10x-bootstrapper
```

The PRD chain ships from Lesson 1 and the tech-stack-selector ships from Lesson 2 — both re-included in this lesson so you can fix the PRD or swap the stack mid-flight. `/10x-bootstrapper` is the lesson's main topic. The chain ends here in v1; a future Lesson 4 will set up agent context (`CLAUDE.md`, `AGENTS.md`).

### Task Router — Where to start

| Skill                                                                | Use it when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bootstrap (lesson focus)**                                         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/10x-bootstrapper`                                                  | You have a hand-off at `context/foundation/tech-stack.md` (written by `/10x-tech-stack-selector`) and you are ready to scaffold the project into the current directory. The skill reads the hand-off, looks up the chosen card in the starter registry, runs its CLI through one of three cwd strategies (scaffold into a temp directory then move files up; scaffold directly into the current directory; clone a starter repo without keeping its git history), preserves `context/` always, sidelines other clashes as `.scaffold` siblings, runs a light pre-scaffold recency check and a deeper post-scaffold audit, and writes a verification log to `context/changes/bootstrap-verification/verification.md`. Use AFTER `/10x-tech-stack-selector`. |
| **Re-run upstream if needed**                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/10x-init` / `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` | Bundled so you can fix the PRD or swap the stack mid-flight. If `/10x-bootstrapper` surfaces a registry-drift refusal or you change your mind on the starter, re-run `/10x-tech-stack-selector` to regenerate `tech-stack.md` and re-invoke.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### How the chain hands off

- `/10x-tech-stack-selector` (Lesson 2) writes `context/foundation/tech-stack.md` with a 4-key frontmatter (`starter_id`, `package_manager`, `project_name`, `hints`) plus a one-paragraph `## Why this stack` body.
- `/10x-bootstrapper` reads that file FULLY (no fallback to conversation history). If it is absent, the skill refuses with a one-sentence redirect to `/10x-tech-stack-selector` and stops — no inline mini-handoff, no standalone-mode in v1.
- The chosen `starter_id` is looked up in `/skills/10x-tech-stack-selector/references/starter-registry.yaml`. The skill consumes that registry; it does not own it. A CI validator (`scripts/validate-starter-registry-sync.mjs`) prevents bootstrapper from referencing a `starter_id` absent from the registry.
- The skill writes `context/changes/bootstrap-verification/verification.md` as the audit-trail log for the run. Schema in `/skills/10x-bootstrapper/references/verification-log-schema.md`.

### What bootstrapper captures (and what it does NOT)

- **Captured (v1)**: scaffold via the chosen card's `cmd_template` (CLI delegation, not inline file generation), three cwd strategies dispatched from `bootstrapper-config.yaml` (`subdir-then-move`, `native-cwd`, `git-clone`), strict conflict policy producing `.scaffold` siblings + always preserving `context/`, two verification slots (light pre-scaffold recency check + deep post-scaffold language-aware audit), severity-tiered audit summary, full verification log on disk.
- **NOT captured in v1 (deliberate)**: `AGENTS.md` / `CLAUDE.md` generation (deferred to a future Lesson 4 — "Memory Architecture"); per-starter cert-element placement overlays (live with the future agent-context skill, not here); CI workflow files; AI-as-bridge fallback for stacks outside the registry (deferred to v2 — in v1 chain-mode tech-stack-selector already gates on the registry, so the case cannot arise); standalone-mode where the user names a stack inline without a hand-off (deferred to v2); compensation actions for `bootstrapper_confidence: best-effort` or `quality_override: true` (surfaced in conversation but no automated follow-up — that, too, is the future memory-architecture skill's job).

### The conflict policy

When the skill moves files from a temp scaffold directory up into your current working directory, it applies a strict matrix:

- **`context/**`** — anything the scaffold tried to write under `context/` is **dropped**. Your `context/` is the source of truth for the bootstrap chain (PRD, tech-stack hand-off, plans, frames) and is never overwritten.
- **`.gitignore`** — append-merged: your existing lines stay in order, then the scaffold's lines are de-duped against your set and appended with a separator comment. Git's ignore semantics are additive, so combining is safe.
- **`package.json`, `README.md`, `CLAUDE.md`, `AGENTS.md`, root-level `*.md`** — your existing file wins; the scaffold's copy lands as `<filename>.scaffold` sibling. You can `diff README.md README.md.scaffold` to see what the starter shipped vs what you had.
- **Anything else** — moves silently if no conflict, sidelined as `<filename>.scaffold` if there is one. The matrix never deletes user files.

For the `git-clone` strategy (10x-astro-starter and similar): the cloned `.git/` is deleted before move-up, so the upstream starter's history does not leak into your repo. You initialise your own history afterwards (`git init`).

### Verification log

Every run writes `context/changes/bootstrap-verification/verification.md`. Sections:

- **`## Hand-off`** — verbatim copy of the tech-stack.md frontmatter and `## Why this stack` body.
- **`## Pre-scaffold verification`** — recency findings table (npm package version + `time.modified` for JS starters; GitHub `pushed_at` for any starter with a GitHub `docs_url`).
- **`## Scaffold log`** — the resolved CLI invocation, exit code, files moved, conflicts surfaced as `.scaffold` siblings, `.gitignore` handling.
- **`## Post-scaffold audit`** — full per-language audit output (`npm audit --json` for JS, `pip-audit` for Python, `cargo audit` for Rust, etc.). Severity-tiered: CRITICAL and HIGH surfaced inline in chat, MODERATE and LOW log-only. Direct-vs-transitive split where the tool supports it.
- **`## Hints recorded but not acted on`** — every hint from the hand-off bootstrapper read but did not act on in v1. Audit-trail completeness for the future memory-architecture skill.
- **`## Next steps`** — pointer text. v1 names "your project is scaffolded and verified — happy hacking" and flags the future Lesson 4 skill as the next chain link.

The folder (`context/changes/bootstrap-verification/`) deliberately has no `change.md`. Bootstrap runs are one-shot artifacts, not tracked workflow changes — the folder hosts the log and nothing else. Re-runs apply a warn-and-confirm guard before overwriting; the escape hatch is `verification-v2.md` (and so on).

### Foundation paths used by this lesson

- `context/foundation/tech-stack.md` — input (from Lesson 2)
- `context/changes/bootstrap-verification/verification.md` — output (the audit-trail log)
- `context/foundation/lessons.md` — recurring rules & pitfalls
- `docs/reference/contract-surfaces.md` — load-bearing names registry

### Universal language

The shipped skill carries no 10xDevs / cohort / certification references. The post-scaffold audit dispatches by `language_family` against a small lookup table; cohorts whose stack lands in `java`, `php`, `dart`, or a multi-language combination see a "no built-in audit tool for this ecosystem" log line and a recommended external tool, not a fake "0 findings" record.

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
