// Custom Worker entry: serves the Astro app exactly like @astrojs/cloudflare's default entry and
// adds a Cron Trigger (wrangler.jsonc "triggers.crons") that pings Supabase so the free-tier
// project is not paused after a week without activity.
import { handle } from "@astrojs/cloudflare/handler";
import { createClient } from "@supabase/supabase-js";
import { pingKeepalive } from "@/lib/services/keepalive";

// Minimal local types instead of the global `wrangler types` runtime declarations, which would
// override DOM typings (e.g. Response.json) for the browser code too.
interface KeepaliveEnv {
  SUPABASE_URL?: string;
  SUPABASE_KEY?: string;
}

interface ScheduledContext {
  waitUntil(promise: Promise<unknown>): void;
}

async function ping(env: KeepaliveEnv): Promise<void> {
  // astro:env is not available outside a request; read the secrets from the Worker env.
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    // eslint-disable-next-line no-console -- shows in Workers observability
    console.error("keepalive: SUPABASE_URL or SUPABASE_KEY is not set, skipping ping");
    return;
  }
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const pingedAt = await pingKeepalive(supabase);
    // eslint-disable-next-line no-console -- shows in Workers observability
    console.log(`keepalive: ping ok at ${pingedAt.toISOString()}`);
  } catch (error) {
    // eslint-disable-next-line no-console -- shows in Workers observability
    console.error("keepalive: ping failed", error);
    // Re-throw so the run shows as failed in the Cloudflare cron history.
    throw error;
  }
}

export default {
  fetch: handle,
  scheduled(_controller: unknown, env: KeepaliveEnv, ctx: ScheduledContext): void {
    ctx.waitUntil(ping(env));
  },
};
