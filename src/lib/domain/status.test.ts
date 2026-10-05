import { describe, expect, it } from "vitest";
import { allowedTargets, checkTransition, sortApplications } from "@/lib/domain/status";
import type { ApplicationStatus } from "@/types";

// Exhaustive transition matrix, typed by hand from the PRD (context/foundation/prd.md:111-113)
// plus the testing-status-rules-end-to-end plan decision that Accepted is a forward move from
// ANY active status. Deliberately not derived from status.ts exports (PIPELINE, STAGE_RANK, …):
// it is the oracle the implementation is checked against.
//   F = forward (no confirmation), C = close (no confirmation),
//   R = revert from a terminal status (confirmation required), - = refused.
type Expected = "F" | "C" | "R" | "-";

// Column order matches the order allowedTargets reports targets in.
const COLUMNS: ApplicationStatus[] = ["sent", "hr_contact", "interviews", "offer", "accepted", "rejected", "withdrawn"];

const MATRIX: Record<ApplicationStatus, Expected[]> = {
  //                 sent hr   int  off  acc  rej  wd
  sent: /*       */ ["-", "F", "F", "F", "F", "C", "C"],
  hr_contact: /* */ ["-", "-", "F", "F", "F", "C", "C"],
  interviews: /* */ ["-", "-", "-", "F", "F", "C", "C"],
  offer: /*      */ ["-", "-", "-", "-", "F", "C", "C"],
  accepted: /*   */ ["R", "R", "R", "R", "-", "R", "R"],
  rejected: /*   */ ["R", "R", "R", "R", "R", "-", "R"],
  withdrawn: /*  */ ["R", "R", "R", "R", "R", "R", "-"],
};

const PAIRS = COLUMNS.flatMap((from) =>
  COLUMNS.map((to, i) => [from, to, MATRIX[from][i]] as [ApplicationStatus, ApplicationStatus, Expected]),
);

describe("transition matrix (PRD oracle)", () => {
  it("covers all 49 (from, to) pairs", () => {
    expect(PAIRS).toHaveLength(49);
  });

  it.each(PAIRS)("%s → %s is %s", (from, to, expected) => {
    const t = checkTransition(from, to);
    switch (expected) {
      case "F":
        expect(t).toEqual({ allowed: true, kind: "forward", requiresConfirmation: false });
        break;
      case "C":
        expect(t).toEqual({ allowed: true, kind: "close", requiresConfirmation: false });
        break;
      case "R":
        expect(t).toEqual({ allowed: true, kind: "revert", requiresConfirmation: true });
        break;
      case "-":
        expect(t.allowed).toBe(false);
        break;
    }
  });

  it.each(COLUMNS)("allowedTargets(%s) equals its matrix row", (from) => {
    const expected = COLUMNS.flatMap((to, i) => {
      const cell = MATRIX[from][i];
      return cell === "-" ? [] : [{ status: to, requiresConfirmation: cell === "R" }];
    });
    expect(allowedTargets(from)).toEqual(expected);
  });
});

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
  const app = (
    id: string,
    status: ApplicationStatus,
    last_activity_at: string,
    created_at = "2026-09-01T10:00:00Z",
  ) => ({
    id,
    status,
    last_activity_at,
    created_at,
  });

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

  it("keeps a newer item in a lower stage below an older item in a higher stage", () => {
    const sorted = sortApplications([
      app("sent-newest", "sent", "2026-10-05T10:00:00Z"),
      app("offer-oldest", "offer", "2026-08-01T10:00:00Z"),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["offer-oldest", "sent-newest"]);
  });

  it("puts the most recently active first even when it was created earlier", () => {
    const sorted = sortApplications([
      app("created-new-idle", "sent", "2026-10-01T10:00:00Z", "2026-09-30T10:00:00Z"),
      app("created-old-active", "sent", "2026-10-04T10:00:00Z", "2026-08-01T10:00:00Z"),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["created-old-active", "created-new-idle"]);
  });

  it("interleaves Rejected and Withdrawn by activity when Withdrawn is newer", () => {
    const sorted = sortApplications([
      app("rejected-old", "rejected", "2026-09-01T10:00:00Z"),
      app("withdrawn-new", "withdrawn", "2026-10-01T10:00:00Z"),
      app("rejected-mid", "rejected", "2026-09-15T10:00:00Z"),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["withdrawn-new", "rejected-mid", "rejected-old"]);
  });

  it("interleaves Rejected and Withdrawn by activity when Rejected is newer", () => {
    const sorted = sortApplications([
      app("withdrawn-old", "withdrawn", "2026-09-01T10:00:00Z"),
      app("rejected-new", "rejected", "2026-10-01T10:00:00Z"),
      app("withdrawn-mid", "withdrawn", "2026-09-15T10:00:00Z"),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["rejected-new", "withdrawn-mid", "withdrawn-old"]);
  });

  it("breaks an activity tie by the newer created_at", () => {
    const sorted = sortApplications([
      app("a-created-old", "sent", "2026-10-01T10:00:00Z", "2026-09-01T10:00:00Z"),
      app("b-created-new", "sent", "2026-10-01T10:00:00Z", "2026-09-20T10:00:00Z"),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["b-created-new", "a-created-old"]);
  });

  it("breaks a full tie by id ascending, whatever the input order", () => {
    const tied = [
      app("c", "interviews", "2026-10-01T10:00:00Z", "2026-09-01T10:00:00Z"),
      app("a", "interviews", "2026-10-01T10:00:00Z", "2026-09-01T10:00:00Z"),
      app("b", "interviews", "2026-10-01T10:00:00Z", "2026-09-01T10:00:00Z"),
    ];
    expect(sortApplications(tied).map((a) => a.id)).toEqual(["a", "b", "c"]);
    expect(sortApplications([...tied].reverse()).map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input", () => {
    const input = [app("a", "sent", "2026-10-01T10:00:00Z"), app("b", "offer", "2026-10-01T10:00:00Z")];
    sortApplications(input);
    expect(input.map((a) => a.id)).toEqual(["a", "b"]);
  });
});
