---
bootstrapped_at: 2026-09-29T16:21:24Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: applications-tracker
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```markdown
---
starter_id: 10x-astro-starter
package_manager: npm
project_name: applications-tracker
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

A solo developer building a single-user web app to track job applications in a 3-week after-hours MVP needs a battle-tested, agent-friendly starter with auth and a relational database out of the box. The 10x Astro Starter (Astro + React + TypeScript + Supabase + Cloudflare) is the recommended default for a web app in JS/TS and clears all four agent-friendly gates. Supabase covers email + password sign-in, and the owner's single account can be created once outside the app, matching the PRD's no-sign-up decision. Its PostgreSQL database fits the relational core: applications, typed notes, status transitions and a change log. Payments, realtime, AI and background jobs are out of scope per PRD non-goals. Deployment goes to Cloudflare Pages, the starter default, with GitHub Actions auto-deploying on merge to main. Bootstrapper confidence is first-class, so expect mostly smooth scaffolding with occasional manual steps.
```

## Pre-scaffold verification

| Signal      | Value                                                               | Severity | Notes                                                                           |
| ----------- | ------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| npm package | not run                                                             | —        | cmd_template starts with `git clone`; no create-* CLI to check                  |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12T21:16:08Z | fresh    | from card.docs_url; `gh` not installed, read via public GitHub REST API instead |

Toolchain note: card pins `node 22`; local runtime is Node v24.21.0 (npm 11.19.0). Install succeeded.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 48
**Conflicts (.scaffold siblings)**: package-lock.json, CLAUDE.md, package.json
**.gitignore handling**: moved silently (absent in cwd)
**.bootstrap-scaffold cleanup**: deleted (cloned `.git/` deleted before move-up)

Deviations from the default conflict policy, approved/announced in conversation:

- `node_modules/` from the scaffold was not moved up (a per-file merge with the pre-existing `node_modules/` of the course CLI would produce a broken dependency tree; the directory is fully regenerable).
- With the user's approval, `package.json` was merged: the starter's manifest became `package.json` (name set to `applications-tracker`) with the pre-existing `@przeprogramowani/10x-cli` devDependency added; the starter's `package-lock.json` replaced the old one; old `node_modules/` removed and `npm install` re-run (exit 0). `package.json.scaffold` and `package-lock.json.scaffold` were removed after the merge.
- `CLAUDE.md.scaffold` (the starter's copy) remains for the user to review; the pre-existing course `CLAUDE.md` is unchanged.
- `npm install` reported install scripts not run (not covered by allowScripts): esbuild@0.28.2, esbuild@0.28.1, workerd@1.20260911.1 (postinstall). Review with `npm install-scripts ls`; approve with `npm install-scripts approve <pkg>` if builds fail. **Follow-up (same session):** approved via `npm install-scripts approve esbuild workerd` (recorded under `allowScripts` in `package.json`) and executed with `npm rebuild esbuild workerd` (exit 0).

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 0 HIGH, 4 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/1/0 direct of total 0/0/4/0

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

- **undici** (transitive, via miniflare) — "undici vulnerable to Denial of Service via unhandled error in WebSocket permessage-deflate decompression". Fix available.
- **miniflare** (transitive, via undici) — fix available.
- **@cloudflare/vite-plugin** (transitive, via miniflare, wrangler) — fix available.
- **wrangler** (direct, via miniflare) — fix available.

All four are one chain in local dev/deploy tooling (wrangler → miniflare → undici).

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | false                |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
