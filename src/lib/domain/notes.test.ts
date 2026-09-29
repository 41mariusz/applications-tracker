import { describe, expect, it } from "vitest";
import { isNoteChanged, latestActiveNote, noteInputSchema, sortNotes } from "@/lib/domain/notes";

const note = (id: string, noted_at: string, deleted_at: string | null = null, created_at = noted_at) => ({
  id,
  noted_at,
  created_at,
  deleted_at,
});

describe("latestActiveNote", () => {
  it("returns the most recent note by its date, not by insertion order", () => {
    const notes = [note("older", "2026-10-01T09:00:00Z"), note("newer", "2026-10-03T09:00:00Z")];
    expect(latestActiveNote(notes)?.id).toBe("newer");
  });

  it("skips removed notes", () => {
    const notes = [
      note("kept", "2026-10-01T09:00:00Z"),
      note("removed", "2026-10-05T09:00:00Z", "2026-10-06T09:00:00Z"),
    ];
    expect(latestActiveNote(notes)?.id).toBe("kept");
  });

  it("returns null when there is nothing to show", () => {
    expect(latestActiveNote([])).toBeNull();
    expect(latestActiveNote([note("removed", "2026-10-01T09:00:00Z", "2026-10-02T09:00:00Z")])).toBeNull();
  });
});

describe("sortNotes", () => {
  it("orders newest first and keeps removed notes on the timeline", () => {
    const sorted = sortNotes([
      note("a", "2026-10-01T09:00:00Z"),
      note("b", "2026-10-03T09:00:00Z", "2026-10-04T09:00:00Z"),
      note("c", "2026-10-02T09:00:00Z"),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties on the same date by creation time", () => {
    const sorted = sortNotes([
      note("first", "2026-10-01T09:00:00Z", null, "2026-10-01T09:00:00Z"),
      note("second", "2026-10-01T09:00:00Z", null, "2026-10-01T10:00:00Z"),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(["second", "first"]);
  });
});

describe("noteInputSchema", () => {
  it("accepts a typed note with an ISO date", () => {
    const parsed = noteInputSchema.safeParse({
      kind: "phone_call",
      body: "  Stawka 22k OK  ",
      noted_at: "2026-10-01T09:00:00.000Z",
    });
    expect(parsed.success && parsed.data.body).toBe("Stawka 22k OK");
  });

  it("rejects an empty body, unknown type, and a non-ISO date", () => {
    expect(noteInputSchema.safeParse({ kind: "comment", body: "   ", noted_at: "2026-10-01T09:00:00Z" }).success).toBe(
      false,
    );
    expect(noteInputSchema.safeParse({ kind: "email", body: "x", noted_at: "2026-10-01T09:00:00Z" }).success).toBe(
      false,
    );
    expect(noteInputSchema.safeParse({ kind: "comment", body: "x", noted_at: "wczoraj" }).success).toBe(false);
  });
});

describe("isNoteChanged", () => {
  const current = { kind: "comment", body: "Stawka 22k", noted_at: "2026-10-01T09:00:00Z" };

  it("ignores whitespace-only and same-instant differences", () => {
    expect(isNoteChanged(current, { ...current, body: "Stawka 22k  ", noted_at: "2026-10-01T11:00:00+02:00" })).toBe(
      false,
    );
  });

  it("detects a changed body, type, or date", () => {
    expect(isNoteChanged(current, { ...current, body: "Stawka 24k" })).toBe(true);
    expect(isNoteChanged(current, { ...current, kind: "phone_call" })).toBe(true);
    expect(isNoteChanged(current, { ...current, noted_at: "2026-10-02T09:00:00Z" })).toBe(true);
  });
});
