// Health rule for the keepalive heartbeat: the app is healthy when the database answered and the
// Worker's cron (every 6 h) pinged it within the last 24 h.

export const MAX_PING_AGE_MS = 24 * 60 * 60 * 1000;

export type HealthOutcome = "ok" | "paused" | "unreachable";
export type HealthReason = "ok" | "ping_stale" | "paused" | "db_unreachable";

export interface HealthInput {
  pingedAt: Date | null;
  now: Date;
  outcome: HealthOutcome;
}

export interface HealthResult {
  healthy: boolean;
  reason: HealthReason;
}

export function evaluateHealth({ pingedAt, now, outcome }: HealthInput): HealthResult {
  if (outcome === "paused") return { healthy: false, reason: "paused" };
  if (outcome === "unreachable") return { healthy: false, reason: "db_unreachable" };
  if (!pingedAt || now.getTime() - pingedAt.getTime() > MAX_PING_AGE_MS) {
    return { healthy: false, reason: "ping_stale" };
  }
  return { healthy: true, reason: "ok" };
}
