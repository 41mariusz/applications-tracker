# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.63.0
- config: playwright.config.ts
- single-spec command: npx playwright test tests/e2e/<name>.spec.ts
- full-suite command: npx playwright test
- base URL: http://localhost:4321
- port: 4321 (detected from the Astro preview default — astro.config.mjs sets no server.port; detected default 4321, override with E2E_PORT)
- web server command: npm run build && npm run preview -- --port $E2E_PORT, with CLOUDFLARE_ENV=e2e (the build bakes the Worker env from the gitignored .dev.vars.e2e — local Supabase — instead of .env, which is production) and ASTRO_PREVIEW_BACKGROUND=1 (keeps Astro 7 preview in the foreground); reuseExistingServer outside CI
- auth setup project: setup (tests/e2e/auth.setup.ts), credentials from E2E_USERNAME / E2E_PASSWORD in .env.e2e (gitignored); the user exists only in the local Supabase stack (created via the local admin API, no sign-up in the app)
- storageState: playwright/.auth/user.json (gitignored)
- seed: tests/e2e/seed.spec.ts — protects #6 (signing in from a protected link lands on that page and survives a reload)
- browser CLI: playwright-cli (global, @playwright/cli 0.1.22), command skill at .claude/skills/playwright-cli/SKILL.md
- updated: 2026-10-05
