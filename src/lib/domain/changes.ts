// Change-log rules (PRD FR-003, FR-012). Pure functions — no I/O.
import type { ApplicationStatus } from "@/types";

export const TRACKED_FIELDS = [
  "company",
  "position",
  "posting_url",
  "salary_range",
  "quoted_rate",
  "hr_contact_name",
  "hr_contact_phone",
  "applied_on",
  "employment_type",
  "work_mode",
] as const;
export type TrackedField = (typeof TRACKED_FIELDS)[number];

// Fields that appear in the change log: form fields plus the attached CV (set separately).
export const HISTORY_FIELDS = [...TRACKED_FIELDS, "cv"] as const;
export type HistoryField = (typeof HISTORY_FIELDS)[number];

export const FIELD_LABELS: Record<HistoryField, string> = {
  company: "Firma",
  position: "Stanowisko",
  posting_url: "Link do ogłoszenia",
  salary_range: "Widełki",
  quoted_rate: "Moja stawka",
  hr_contact_name: "Kontakt HR",
  hr_contact_phone: "Telefon HR",
  applied_on: "Data aplikowania",
  employment_type: "Forma zatrudnienia",
  work_mode: "Tryb pracy",
  cv: "CV",
};

export interface FieldChange {
  field: TrackedField;
  old_value: string | null;
  new_value: string | null;
}

type Values = Record<TrackedField, string | null>;

// Which fields an edit actually changes; unchanged fields produce no log entry.
export function diffFields(current: Values, next: Values): FieldChange[] {
  return TRACKED_FIELDS.flatMap((field) =>
    current[field] === next[field] ? [] : [{ field, old_value: current[field], new_value: next[field] }],
  );
}

export type HistoryEntry =
  | { type: "field"; at: string; field: HistoryField; old_value: string | null; new_value: string | null }
  | { type: "status"; at: string; from: ApplicationStatus; to: ApplicationStatus; is_revert: boolean };

// One timeline for the details screen: field edits and status changes, newest first.
export function mergeHistory(
  fieldChanges: readonly { field: string; old_value: string | null; new_value: string | null; changed_at: string }[],
  statusChanges: readonly {
    from_status: ApplicationStatus;
    to_status: ApplicationStatus;
    is_revert: boolean;
    changed_at: string;
  }[],
): HistoryEntry[] {
  const entries: HistoryEntry[] = [
    ...fieldChanges
      .filter((c): c is typeof c & { field: HistoryField } => (HISTORY_FIELDS as readonly string[]).includes(c.field))
      .map((c) => ({
        type: "field" as const,
        at: c.changed_at,
        field: c.field,
        old_value: c.old_value,
        new_value: c.new_value,
      })),
    ...statusChanges.map((c) => ({
      type: "status" as const,
      at: c.changed_at,
      from: c.from_status,
      to: c.to_status,
      is_revert: c.is_revert,
    })),
  ];
  return entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
