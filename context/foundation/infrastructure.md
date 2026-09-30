---
project: applications-tracker
researched_at: 2026-09-30
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7 (SSR) + React 19 islands
  runtime: Cloudflare Workers (workerd) via @astrojs/cloudflare 14, wrangler 4
---

## Recommendation

**Deploy on Cloudflare Workers** (Workers with static assets — not Pages), with Supabase as the external data layer (Postgres, Auth, Storage).

It is the only candidate that passes all five agent-friendly criteria: one-command deploy and rollback (`wrangler deploy`, `wrangler rollback`), managed serverless runtime, markdown docs with `llms.txt`, and official MCP servers. At a single user's traffic it costs $0, it is the platform the owner already knows, and the app has run there in production since the MVP shipped. The interview answers did not change the pick: request/response only (no realtime or background jobs in `tech-stack.md`), single region, cost and DX weighted equally. The owner's preference for co-located services is recorded but not acted on — Supabase carries auth, RLS and the atomic "change + trace" SQL functions, and moving them is out of MVP scope.

## Platform Comparison

Researched 2026-09-30 from official docs and pricing pages. Pass = 1, Partial = 0.5.

| Platform           | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total   |
| ------------------ | --------- | ------------------ | ------------------- | ----------------- | ----------------- | ------- |
| Cloudflare Workers | Pass      | Pass               | Pass                | Pass              | Pass              | **5.0** |
| Vercel             | Pass      | Pass               | Pass                | Pass              | Partial           | **4.5** |
| Netlify            | Partial   | Pass               | Pass                | Partial           | Pass              | 4.0     |
| Render             | Partial   | Pass               | Pass                | Partial           | Pass              | 4.0     |
| Railway            | Partial   | Pass               | Pass                | Partial           | Partial           | 3.5     |
| Fly.io             | Pass      | Partial            | Pass                | Partial           | Partial           | 3.5     |

- **Cloudflare Workers** — `wrangler` covers deploy, versions, rollback (last 100 versions) and `tail`. Docs: `developers.cloudflare.com/llms.txt`, `/index.md` on any page. Official MCP servers (Bindings, Observability, Docs). Free plan: 100k requests/day, 10 ms CPU per request, 50 subrequests per request; static assets free. `@astrojs/cloudflare` v13+ dropped Pages support; Pages docs say "Start new projects with Workers". The `cf` CLI is **beta**.
- **Vercel** — `vercel deploy / promote / rollback / logs`; `llms.txt` and `.md` pages. Hobby is free but **non-commercial only**; rollback on Hobby only to the previous production deploy; runtime logs kept 1 h. One function region on Hobby, `fra1` selectable. Vercel MCP is **beta**; WebSockets **public beta** (2026-06-22). `@astrojs/vercel` Astro 7 peer range not confirmed.
- **Netlify** — CLI has `deploy` and `logs` but **no rollback command** (UI or `netlify api restoreSiteDeploy`). Credit-based since 2025-09-04: Free = 300 credits hard cap (sites pause when exhausted), **15 credits per production deploy** — our deploy-on-every-push-to-main flow would exhaust it in ~20 pushes. EU function regions are **Pro/Enterprise only**; Free runs in US East. MCP server GA; `@astrojs/netlify` 8.2.6 supports Astro 7.
- **Render** — CLI deploys and tails logs, **no rollback command** (dashboard/API). Free web services sleep after 15 min, ~1 min cold start — fails the PRD's "< 10 s during a call". Cheapest always-on instance $7/month; Hobby bandwidth cut to 5 GB (2026-08-01). MCP server documented without a beta label but cannot roll back. Preview environments are Pro-only.
- **Railway** — `railway up / redeploy / logs`; rollback is **dashboard-only** (72 h window on Hobby). $5/month Hobby with $5 usage included. Co-located Postgres and Tigris-backed buckets (no public buckets / lifecycle rules yet). MCP server exists, GA/beta status not stated. Nixpacks deprecated in favour of Railpack.
- **Fly.io** — `fly deploy / logs`; rollback = redeploy a previous image (no single command). No free tier for orgs created after 2024-10-07. **Warsaw (waw) region retired Sept 2025** — nearest is fra. Managed Postgres from $38/month. `fly mcp server` is **experimental**.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Full marks on the criteria, $0 at this scale, deterministic deploy and rollback from the CLI, and a working production setup with CI auto-deploy. The edge runtime is a good fit for a request/response SSR app with no persistent processes.

#### 2. Vercel

The closest alternative: strong CLI, Git-integrated previews, `fra1` region, free for personal use. It loses half a point on a beta MCP server, and switching would mean a new adapter, Node runtime and re-verifying the Astro 7 adapter range — cost with no gain for this project.

#### 3. Railway

The best match for the co-location preference (Postgres and object storage on the same bill) and a long-running Node process with no cold starts unless sleeping is enabled. It trails on rollback (dashboard only) and an unlabelled MCP status, and costs ~$5/month.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **10 ms CPU per request on the free plan.** CV upload parses a multipart body of up to 5 MB and computes SHA-256 on the server (`src/lib/domain/cv.ts:27`); a large file can exceed the limit and return a 503. Tests so far used small files.
2. **Split between edge and a single-region database.** The Worker runs near the user; Supabase sits in one region. Pages that make several sequential Supabase calls pay the round trip each time — this matters for the PRD's "< 10 s during a call".
3. **Rollback reverts code, not data.** `wrangler rollback` restores the previous Worker version, but an applied migration stays — old code then runs against the new schema.
4. **50 subrequests per request on the free plan.** Every Supabase call is a subrequest; today's pages are far below it, but a feature that loops over records could hit it silently.

### Pre-Mortem — How This Could Fail

February: six months after the MVP, the owner starts job-hunting in earnest. A recruiter calls, the owner opens the app — and it errors. The free Supabase project had paused after a week without activity; Cloudflare was up the whole time, but a front end without its database is useless, and CI never noticed because nothing had been pushed. Earlier, a new 4 MB CV had failed to upload with a 503 from the CPU limit, and there was no trace of it because nobody was watching `wrangler tail` and Workers observability was never checked. While fixing it, the owner rolled back the Worker, but the previous version did not match the schema after the latest migration, so the rollback broke the details page too. No single decision was wrong; the failure came from never checking the free-plan limits of both vendors and having no monitoring on the one path that matters — opening the app during a call.

### Unknown Unknowns

- **Supabase pauses free-tier projects after about a week of inactivity** — the largest availability risk in this setup, and it lives outside Cloudflare. Verify the current policy.
- **Preview URLs are public.** `wrangler versions upload --preview-alias` publishes on `*.workers.dev` with no auth unless Cloudflare Access protects it.
- **Adapter version drift.** `@astrojs/cloudflare` v13+ removed `Astro.locals.runtime` (use `astro:env`, `cloudflare:workers` `env`, or `Astro.locals.cfContext`), dropped Pages, and `astro dev` now runs in workerd. Tutorials from before 2025 are misleading.
- **`compatibility_date` freezes runtime behaviour.** The project pins `2026-05-08` with `nodejs_compat`; Node APIs on by default only apply from `2026-08-04`, so new defaults need a deliberate date bump.
- **Hyperdrive does not help supabase-js.** It speeds up direct Postgres connections (`pg`, postgres.js), not the REST client this app uses.

## Operational Story

- **Preview deploys**: none today — CI deploys `main` only. If needed, `npx wrangler versions upload --preview-alias <branch>` gives a stable `*.workers.dev` URL; it is public unless protected with Cloudflare Access, and it would hit the production Supabase unless pointed elsewhere.
- **Secrets**: Worker runtime secrets `SUPABASE_URL`, `SUPABASE_KEY` (publishable key only) via `npx wrangler secret put`; CI secrets `SUPABASE_URL`, `SUPABASE_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` in GitHub repository secrets. The service-role key never goes to the Worker. Rotation: update in Supabase, then `wrangler secret put` and the GitHub secret.
- **Rollback**: `npx wrangler deployments list`, then `npx wrangler rollback [version-id]` — seconds. Database migrations do not roll back; write migrations backward-compatible with the previous code version.
- **Approval**: a human runs `npx supabase db push` (cloud migrations), rotates secrets, and approves any rollback in production. An agent may push to `main` (CI deploys after `ci` + `smoke` pass), read logs, and list deployments.
- **Logs**: `npx wrangler tail applications-tracker` for live runtime logs; `observability.enabled` is on in `wrangler.jsonc`, so recent invocations are also queryable in the dashboard or through the Cloudflare Observability MCP server; CI logs via `gh run view --log`.

## Risk Register

| Risk                                                                      | Source                        | Likelihood | Impact | Mitigation                                                                                                                                                                   |
| ------------------------------------------------------------------------- | ----------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase free project pauses after inactivity; app unusable during a call | Unknown unknowns / Pre-mortem | M          | H      | Verify the current pause policy; add a scheduled keep-alive (e.g. a GitHub Actions cron hitting a read endpoint weekly) or move to a paid Supabase plan before relying on it |
| CV upload exceeds 10 ms CPU on the free plan (503)                        | Devil's advocate              | M          | M      | Upload a 5 MB PDF against production; if it fails, move to Workers Paid ($5/month, 30M CPU-ms) or hash in the browser and verify server-side                                 |
| Rollback after a migration runs old code on a new schema                  | Devil's advocate / Pre-mortem | L          | H      | Keep migrations additive and backward-compatible; follow `context/foundation/lessons.md` (db push before pushing code)                                                       |
| Latency from multiple sequential Supabase calls per page                  | Devil's advocate              | L          | M      | Measure the details page on a phone; consolidate calls into one SQL function or enable Smart Placement if > 1–2 s                                                            |
| Public preview URLs expose the app if previews are added                  | Unknown unknowns              | L          | M      | Protect `*.workers.dev` previews with Cloudflare Access before enabling them                                                                                                 |
| Adapter / compatibility-date drift breaks a routine upgrade               | Unknown unknowns              | M          | L      | Upgrade `@astrojs/cloudflare` and `compatibility_date` deliberately, one at a time, with `npm run smoke` against the preview build                                           |
| Silent errors with nobody watching logs                                   | Pre-mortem                    | M          | M      | Check Workers observability after each deploy; consider an error tracker later (course Module 3)                                                                             |

## Getting Started

The project is already deployed; these are the version-accurate commands for `@astrojs/cloudflare` 14 and `wrangler` 4:

1. Local dev: `npm run dev` — `astro dev` already runs in workerd, so a separate `wrangler dev` is not needed. Secrets for local runs go in `.dev.vars`.
2. Production deploy: push to `main` (CI runs `ci` + `smoke`, then `npx wrangler deploy`), or manually `npm run build && npx wrangler deploy` with `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` in `.env`.
3. Runtime secrets: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.
4. Before pushing code with a migration: `npx supabase db push` and confirm it applied.
5. Incident: `npx wrangler tail applications-tracker`, then `npx wrangler deployments list` and `npx wrangler rollback [version-id]` if needed.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
- Migrating the data layer off Supabase to satisfy the co-location preference
