// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // Workers Issues → Telegram alerts (src/pages/api/alerts/issue.ts); set with `wrangler secret put`.
      ISSUES_WEBHOOK_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
      TELEGRAM_BOT_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),
      TELEGRAM_CHAT_ID: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
