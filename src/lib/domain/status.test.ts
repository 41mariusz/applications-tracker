import { describe, expect, it } from "vitest";
import { allowedTargets, checkTransition, sortApplications } from "@/lib/domain/status";
import type { ApplicationStatus } from "@/types";

describe("checkTransition", () => {
  it.each<[ApplicationStatus, ApplicationStatus]>([
    ["sent", "hr_contact"],
    ["sent", "interviews"], // skipping a stage is allowed
    ["hr_contact", "offer"],
    ["offer", "accepted"],
    ["sent", "accepted"],
  ])("allows forward move %s → %s without confirmation", (from, to) => {
    expect(checkTransition(from, to)).toEqual({ allowed: true, kind: "forward", requiresConfirmation: false });
  });

  it.each<[ApplicationStatus, ApplicationStatus]>([
    ["sent", "rejected"],
    ["interviews", "withdrawn"],
    ["offer", "rejected"],
  ])("allows closing %s → %s without confirmation", (from, to) => {
    expect(checkTransition(from, to)).toEqual({ allowed: true, kind: "close", requiresConfirmation: false });
  });

  it.each<[ApplicationStatus, ApplicationStatus]>([
    ["offer", "sent"],
    ["interviews", "hr_contact"],
    ["hr_contact", "sent"],
  ])("refuses backward move %s → %s", (from, to) => {
    expect(checkTransition(from, to).allowed).toBe(false);
  });

  it.each<[ApplicationStatus, ApplicationStatus]>([
    ["rejected", "interviews"],
    ["withdrawn", "sent"],
    ["accepted", "offer"],
    ["rejected", "withdrawn"], // terminal → terminal
    ["accepted", "withdrawn"],
  ])("allows reverting terminal %s → %s only with confirmation", (from, to) => {
    expect(checkTransition(from, to)).toEqual({ allowed: true, kind: "revert", requiresConfirmation: true });
  });

  it("refuses keeping the same status", () => {
    expect(checkTransition("interviews", "interviews").allowed).toBe(false);
    expect(checkTransition("rejected", "rejected").allowed).toBe(false);
  });
});

describe("allowedTargets", () => {
  it("offers only later stages and closing from an active status", () => {
    expect(allowedTargets("interviews").map((t) => t.status)).toEqual(["offer", "accepted", "rejected", "withdrawn"]);
  });

  it("offers every other status, all needing confirmation, from a terminal status", () => {
    const targets = allowedTargets("rejected");
    expect(targets.map((t) => t.status)).toEqual([
      "sent",
      "hr_contact",
      "interviews",
      "offer",
      "accepted",
      "withdrawn",
    ]);
    expect(targets.every((t) => t.requiresConfirmation)).toBe(true);
  });
});

describe("sortApplications", () => {
  const app = (id: string, status: ApplicationStatus, last_activity_at: string) => ({ id, status, last_activity_at });

  it("orders by stage, then most recent activity, with closed ones at the bottom", () => {
    const sorted = sortApplications([
      app("rejected-new", "rejected", "2026-10-05T10:00:00Z"),
      app("sent-old", "sent", "2026-10-01T10:00:00Z"),
      app("interviews", "interviews", "2026-10-02T10:00:00Z"),
      app("sent-new", "sent", "2026-10-04T10:00:00Z"),
      app("withdrawn-old", "withdrawn", "2026-09-20T10:00:00Z"),
      app("offer", "offer", "2026-09-25T10:00:00Z"),
      app("accepted", "accepted", "2026-09-01T10:00:00Z"),
      app("hr", "hr_contact", "2026-10-03T10:00:00Z"),
    ]);
    expect(sorted.map((a) => a.id)).toEqual([
      "accepted",
      "offer",
      "interviews",
      "hr",
      "sent-new",
      "sent-old",
      "rejected-new",
      "withdrawn-old",
    ]);
  });

  it("does not mutate the input", () => {
    const input = [app("a", "sent", "2026-10-01T10:00:00Z"), app("b", "offer", "2026-10-01T10:00:00Z")];
    sortApplications(input);
    expect(input.map((a) => a.id)).toEqual(["a", "b"]);
  });
});
