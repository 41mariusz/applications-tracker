import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Local secrets (E2E_USERNAME, E2E_PASSWORD) come from the gitignored .env.e2e — never from .env,
// which holds production values. In CI the file is absent and the variables come from the job.
if (existsSync(".env.e2e")) process.loadEnvFile(".env.e2e");

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
