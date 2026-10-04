import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { evaluateHealth, type HealthOutcome } from "@/lib/domain/keepalive";
import { getKeepaliveStatus } from "@/lib/services/keepalive";

export const prerender = false;

// Public, read-only health check for the daily probe and the owner: only a status and a timestamp.
export const GET: APIRoute = async (context) => {
  let pingedAt: Date | null = null;
  let outcome: HealthOutcome = "unreachable";

  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    try {
      pingedAt = await getKeepaliveStatus(supabase);
      outcome = "ok";
    } catch (e) {
      // eslint-disable-next-line no-console -- server-side log for a failed health read
      console.error("health: keepalive_status failed", e);
    }
  }

  const { healthy, reason } = evaluateHealth({ pingedAt, now: new Date(), outcome });
  return Response.json(
    { status: reason, pingedAt: pingedAt ? pingedAt.toISOString() : null },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
};
