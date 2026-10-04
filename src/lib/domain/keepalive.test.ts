import { describe, expect, it } from "vitest";
import { evaluateHealth, MAX_PING_AGE_MS } from "@/lib/domain/keepalive";

const now = new Date("2026-10-04T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("evaluateHealth", () => {
  it("is healthy with a recent ping", () => {
    expect(evaluateHealth({ pingedAt: ago(6 * 60 * 60 * 1000), now, outcome: "ok" })).toEqual({
      healthy: true,
      reason: "ok",
    });
  });

  it("is healthy with a ping exactly 24 h old", () => {
    expect(evaluateHealth({ pingedAt: ago(MAX_PING_AGE_MS), now, outcome: "ok" })).toEqual({
      healthy: true,
      reason: "ok",
    });
  });

  it("is stale with a ping 24 h + 1 ms old", () => {
    expect(evaluateHealth({ pingedAt: ago(MAX_PING_AGE_MS + 1), now, outcome: "ok" })).toEqual({
      healthy: false,
      reason: "ping_stale",
    });
  });

  it("is stale when there is no ping at all", () => {
    expect(evaluateHealth({ pingedAt: null, now, outcome: "ok" })).toEqual({ healthy: false, reason: "ping_stale" });
  });

  it("reports a paused project", () => {
    expect(evaluateHealth({ pingedAt: null, now, outcome: "paused" })).toEqual({ healthy: false, reason: "paused" });
  });

  it("reports an unreachable database even with a fresh ping", () => {
    expect(evaluateHealth({ pingedAt: ago(1000), now, outcome: "unreachable" })).toEqual({
      healthy: false,
      reason: "db_unreachable",
    });
  });
});
