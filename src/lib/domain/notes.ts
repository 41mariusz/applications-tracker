// Notes rules (PRD FR-009, FR-010). Pure functions — no I/O.
import { z } from "zod";
import { NOTE_KINDS } from "@/types";

export const noteInputSchema = z.object({
  kind: z.enum(NOTE_KINDS, { error: "Wybierz typ notatki" }),
  body: z.string().trim().min(1, "Notatka nie może być pusta").max(5000, "Notatka jest za długa"),
  // Sent by the client as ISO 8601 (converted from the user's local time).
  noted_at: z.iso.datetime({ offset: true, error: "Nieprawidłowa data" }),
});

export type NoteInput = z.infer<typeof noteInputSchema>;

// The note shown at the top of the details screen: the most recent one that was not removed.
export function latestActiveNote<T extends { noted_at: string; deleted_at: string | null }>(
  notes: readonly T[],
): T | null {
  let latest: T | null = null;
  for (const note of notes) {
    if (note.deleted_at) continue;
    if (!latest || Date.parse(note.noted_at) > Date.parse(latest.noted_at)) latest = note;
  }
  return latest;
}

// Newest first; removed notes keep their place on the timeline.
export function sortNotes<T extends { noted_at: string; created_at: string }>(notes: readonly T[]): T[] {
  return [...notes].sort(
    (a, b) => Date.parse(b.noted_at) - Date.parse(a.noted_at) || Date.parse(b.created_at) - Date.parse(a.created_at),
  );
}

// An edit that changes nothing should not create a revision.
export function isNoteChanged(
  current: { kind: string; body: string; noted_at: string },
  next: { kind: string; body: string; noted_at: string },
): boolean {
  return (
    current.kind !== next.kind ||
    current.body.trim() !== next.body.trim() ||
    Date.parse(current.noted_at) !== Date.parse(next.noted_at)
  );
}
