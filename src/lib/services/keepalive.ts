import type { SupabaseClient } from "@supabase/supabase-js";

// Heartbeat write: keeps the Supabase project active (called by the Worker's Cron Trigger).
export async function pingKeepalive(supabase: SupabaseClient): Promise<Date> {
  const result = await supabase.rpc("keepalive_ping");
  if (result.error) throw result.error;
  const pingedAt: unknown = result.data;
  if (typeof pingedAt !== "string") throw new Error("keepalive_ping returned no timestamp");
  return new Date(pingedAt);
}

// When the last heartbeat happened; null if the row is missing.
export async function getKeepaliveStatus(supabase: SupabaseClient): Promise<Date | null> {
  const result = await supabase.rpc("keepalive_status");
  if (result.error) throw result.error;
  const pingedAt: unknown = result.data;
  return typeof pingedAt === "string" ? new Date(pingedAt) : null;
}
