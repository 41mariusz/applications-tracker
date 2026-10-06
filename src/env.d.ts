declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    // Set by logError, so the middleware hook and error-page renders do not log the same failure twice.
    errorLogged?: boolean;
  }
}

// Minimal local declaration (workers-types is not installed): the Worker env, as the adapter reads it.
declare module "cloudflare:workers" {
  export const env: {
    // wrangler.jsonc "version_metadata" binding — the deployed version, for release identity.
    CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
    [key: string]: unknown;
  };
}
