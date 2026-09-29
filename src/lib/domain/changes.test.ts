import { describe, expect, it } from "vitest";
import { diffFields, mergeHistory, TRACKED_FIELDS } from "@/lib/domain/changes";

const base = Object.fromEntries(TRACKED_FIELDS.map((f) => [f, null])) as Record<
  (typeof TRACKED_FIELDS)[number],
  string | null
>;

describe("diffFields", () => {
  it("returns nothing when nothing changed", () => {
    const values = { ...base, company: "Acme", quoted_rate: "22k" };
    expect(diffFields(values, { ...values })).toEqual([]);
  });

  it("reports each changed field with its old and new value", () => {
    const current = { ...base, company: "Acme", quoted_rate: "22k", work_mode: "remote" };
    const next = { ...current, quoted_rate: "24k", work_mode: "hybrid" };
    expect(diffFields(current, next)).toEqual([
      { field: "quoted_rate", old_value: "22k", new_value: "24k" },
      { field: "work_mode", old_value: "remote", new_value: "hybrid" },
    ]);
  });

  it("treats setting and clearing a value as changes", () => {
    const current = { ...base, hr_contact_phone: "600100200" };
    const next = { ...current, hr_contact_phone: null, hr_contact_name: "Anna" };
    expect(diffFields(current, next)).toEqual([
      { field: "hr_contact_name", old_value: null, new_value: "Anna" },
      { field: "hr_contact_phone", old_value: "600100200", new_value: null },
    ]);
  });
});

describe("mergeHistory", () => {
  it("interleaves field and status changes, newest first", () => {
    const history = mergeHistory(
      [
        { field: "quoted_rate", old_value: "22k", new_value: "24k", changed_at: "2026-10-03T10:00:00Z" },
        { field: "company", old_value: "Acme", new_value: "Acme Inc", changed_at: "2026-10-01T10:00:00Z" },
      ],
      [{ from_status: "sent", to_status: "interviews", is_revert: false, changed_at: "2026-10-02T10:00:00Z" }],
    );
    expect(history.map((h) => (h.type === "field" ? h.field : `${h.from}->${h.to}`))).toEqual([
      "quoted_rate",
      "sent->interviews",
      "company",
    ]);
  });

  it("ignores unknown field names", () => {
    const history = mergeHistory(
      [{ field: "legacy_column", old_value: "a", new_value: "b", changed_at: "2026-10-03T10:00:00Z" }],
      [],
    );
    expect(history).toEqual([]);
  });
});
