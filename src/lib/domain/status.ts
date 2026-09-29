// Domain rule from PRD "Business Logic": which status changes are allowed,
// and how the application list is ordered. Pure functions — no I/O.
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/types";

export const ACTIVE_STATUSES = ["sent", "hr_contact", "interviews", "offer"] as const satisfies ApplicationStatus[];
export const TERMINAL_STATUSES = ["accepted", "rejected", "withdrawn"] as const satisfies ApplicationStatus[];
export const CLOSED_STATUSES = ["rejected", "withdrawn"] as const satisfies ApplicationStatus[];

// Forward order of the pipeline; "accepted" is the step after "offer".
const PIPELINE: ApplicationStatus[] = ["sent", "hr_contact", "interviews", "offer", "accepted"];

export function isTerminal(status: ApplicationStatus): boolean {
  return (TERMINAL_STATUSES as readonly ApplicationStatus[]).includes(status);
}

export function isClosed(status: ApplicationStatus): boolean {
  return (CLOSED_STATUSES as readonly ApplicationStatus[]).includes(status);
}

export type TransitionKind = "forward" | "close" | "revert";

export type Transition =
  { allowed: true; kind: TransitionKind; requiresConfirmation: boolean } | { allowed: false; reason: string };

export function checkTransition(from: ApplicationStatus, to: ApplicationStatus): Transition {
  if (from === to) {
    return { allowed: false, reason: "Aplikacja ma już ten status." };
  }
  // Leaving a terminal status (to an active one or another terminal one) is a revert:
  // allowed, but only after explicit confirmation.
  if (isTerminal(from)) {
    return { allowed: true, kind: "revert", requiresConfirmation: true };
  }
  if (isClosed(to)) {
    return { allowed: true, kind: "close", requiresConfirmation: false };
  }
  if (PIPELINE.indexOf(to) > PIPELINE.indexOf(from)) {
    return { allowed: true, kind: "forward", requiresConfirmation: false };
  }
  return { allowed: false, reason: "Status może zmieniać się tylko do przodu albo na zamknięty." };
}

export function allowedTargets(
  from: ApplicationStatus,
): { status: ApplicationStatus; requiresConfirmation: boolean }[] {
  return APPLICATION_STATUSES.flatMap((to) => {
    const t = checkTransition(from, to);
    return t.allowed ? [{ status: to, requiresConfirmation: t.requiresConfirmation }] : [];
  });
}

// List order: Accepted, Offer, Interviews, HR contact, Sent, then closed ones at the bottom.
const STAGE_RANK: Record<ApplicationStatus, number> = {
  accepted: 0,
  offer: 1,
  interviews: 2,
  hr_contact: 3,
  sent: 4,
  rejected: 5,
  withdrawn: 5,
};

export function sortApplications<T extends { status: ApplicationStatus; last_activity_at: string }>(
  applications: readonly T[],
): T[] {
  return [...applications].sort(
    (a, b) =>
      STAGE_RANK[a.status] - STAGE_RANK[b.status] || Date.parse(b.last_activity_at) - Date.parse(a.last_activity_at),
  );
}
