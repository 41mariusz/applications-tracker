import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig, devices } from "@playwright/test";

// Local secrets (E2E_USERNAME, E2E_PASSWORD) come from the gitignored .env.e2e — never from .env,
// which holds production values. In CI the file is absent and the variables come from the job.
if (existsSync(".env.e2e")) process.loadEnvFile(".env.e2e");

// The e2e build (CLOUDFLARE_ENV=e2e) reads .dev.vars.e2e, then .dev.vars, and only then falls back
// to .env — production. Locally there is no .dev.vars, so refuse to run unless .dev.vars.e2e points
// at the local Supabase. CI writes both files from the job's local stack.
if (!process.env.CI) {
  const fix = "Create it from `npx supabase status`: SUPABASE_URL=<API_URL>, SUPABASE_KEY=<ANON_KEY>.";
  if (!existsSync(".dev.vars.e2e")) {
    throw new Error(`E2E stopped: .dev.vars.e2e is missing, so the app under test would use .env (production). ${fix}`);
  }
  const url = parseEnv(readFileSync(".dev.vars.e2e", "utf8")).SUPABASE_URL ?? "";
  const host = URL.canParse(url) ? new URL(url).hostname : "";
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`E2E stopped: SUPABASE_URL in .dev.vars.e2e is "${host}", not the local Supabase. ${fix}`);
  }
}

// 4321 is Astro's default preview port (astro.config.mjs sets no server.port).
// E2E_PORT overrides it when that port is taken on this machine.
const PORT = Number(process.env.E2E_PORT ?? 4321);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Production-like build + preview, on the port above.
    command: `npm run build && npm run preview -- --port ${String(PORT)}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // Astro 7 moves `astro preview` into a background daemon when it detects an agent; keep it in front.
      ASTRO_PREVIEW_BACKGROUND: "1",
      // The build bakes the Worker's env from .dev.vars.e2e (local Supabase) instead of .env (production).
      CLOUDFLARE_ENV: "e2e",
    },
  },
});
