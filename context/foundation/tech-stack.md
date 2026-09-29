---
starter_id: 10x-astro-starter
package_manager: npm
project_name: applications-tracker
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
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

A solo developer building a single-user web app to track job applications in a 3-week after-hours MVP needs a battle-tested, agent-friendly starter with auth and a relational database out of the box. The 10x Astro Starter (Astro + React + TypeScript + Supabase + Cloudflare) is the recommended default for a web app in JS/TS and clears all four agent-friendly gates. Supabase covers email + password sign-in, and the owner's single account can be created once outside the app, matching the PRD's no-sign-up decision. Its PostgreSQL database fits the relational core: applications, typed notes, status transitions and a change log. Payments, realtime, AI and background jobs are out of scope per PRD non-goals. Deployment goes to Cloudflare Workers with static assets (the starter's actual `wrangler.jsonc` setup; originally recorded as Pages), with GitHub Actions auto-deploying on merge to main. Bootstrapper confidence is first-class, so expect mostly smooth scaffolding with occasional manual steps.
