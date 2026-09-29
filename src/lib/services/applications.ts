import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APPLICATION_STATUSES, EMPLOYMENT_TYPES, WORK_MODES, type Application, type ApplicationStatus } from "@/types";
import { checkTransition, sortApplications } from "@/lib/domain/status";
import { diffFields, TRACKED_FIELDS, type TrackedField } from "@/lib/domain/changes";
import { addNote } from "@/lib/services/notes";

// Empty form fields arrive as "" — store them as null.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.union([z.enum(values), z.literal("").transform(() => null)]);

export const createApplicationSchema = z.object({
  company: z.string().trim().min(1, "Podaj nazwę firmy").max(200),
  position: z.string().trim().min(1, "Podaj stanowisko").max(200),
  posting_url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || URL.canParse(v), "Podaj pełny adres, np. https://…")
    .transform((v) => (v === "" ? null : v)),
  salary_range: optionalText(100),
  quoted_rate: optionalText(100),
  hr_contact_name: optionalText(200),
  hr_contact_phone: optionalText(50),
  applied_on: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Nieprawidłowa data")
    .transform((v) => (v === "" ? null : v)),
  employment_type: optionalEnum(EMPLOYMENT_TYPES),
  work_mode: optionalEnum(WORK_MODES),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type ApplicationFormValues = Record<keyof CreateApplicationInput, string>;
export type ApplicationFormErrors = Partial<Record<keyof CreateApplicationInput, string>>;

export function readApplicationForm(form: FormData): ApplicationFormValues {
  const get = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    company: get("company"),
    position: get("position"),
    posting_url: get("posting_url"),
    salary_range: get("salary_range"),
    quoted_rate: get("quoted_rate"),
    hr_contact_name: get("hr_contact_name"),
    hr_contact_phone: get("hr_contact_phone"),
    applied_on: get("applied_on"),
    employment_type: get("employment_type"),
    work_mode: get("work_mode"),
  };
}

export function validateApplicationForm(
  values: ApplicationFormValues,
): { ok: true; data: CreateApplicationInput } | { ok: false; errors: ApplicationFormErrors } {
  const result = createApplicationSchema.safeParse(values);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const errors: ApplicationFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof CreateApplicationInput;
    errors[field] ??= issue.message;
  }
  return { ok: false, errors };
}

export async function createApplication(supabase: SupabaseClient, input: CreateApplicationInput) {
  const { data, error } = await supabase.from("applications").insert(input).select("id").single<{ id: string }>();
  if (error) throw error;
  return data;
}

export const changeStatusSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
  confirm: z.literal("true").optional(),
});

export type ChangeStatusResult =
  | { ok: true; status: ApplicationStatus }
  | { ok: false; code: "not_found" | "not_allowed" | "needs_confirmation" | "conflict"; message: string };

export async function changeApplicationStatus(
  supabase: SupabaseClient,
  id: string,
  to: ApplicationStatus,
  confirmed: boolean,
): Promise<ChangeStatusResult> {
  const { data: current, error: readError } = await supabase
    .from("applications")
    .select("status")
    .eq("id", id)
    .maybeSingle<{ status: ApplicationStatus }>();
  if (readError) throw readError;
  if (!current) return { ok: false, code: "not_found", message: "Nie znaleziono aplikacji." };

  const transition = checkTransition(current.status, to);
  if (!transition.allowed) return { ok: false, code: "not_allowed", message: transition.reason };
  if (transition.requiresConfirmation && !confirmed) {
    return { ok: false, code: "needs_confirmation", message: "Cofnięcie statusu końcowego wymaga potwierdzenia." };
  }

  const now = new Date().toISOString();
  // Guard on the status we checked, so a concurrent change can't slip past the rule.
  const { data: updated, error: updateError } = await supabase
    .from("applications")
    .update({ status: to, last_activity_at: now, updated_at: now })
    .eq("id", id)
    .eq("status", current.status)
    .select("id");
  if (updateError) throw updateError;
  if (updated.length === 0) {
    return { ok: false, code: "conflict", message: "Status zmienił się w międzyczasie. Odśwież stronę." };
  }

  const { error: historyError } = await supabase.from("status_changes").insert({
    application_id: id,
    from_status: current.status,
    to_status: to,
    is_revert: transition.kind === "revert",
  });
  if (historyError) throw historyError;

  return { ok: true, status: to };
}

export async function listApplications(supabase: SupabaseClient): Promise<Application[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .overrideTypes<Application[], { merge: false }>();
  if (error) throw error;
  return sortApplications(data);
}

export type UpdateApplicationResult = { ok: true; changed: number } | { ok: false; code: "not_found"; message: string };

// Edits leave a trace: one field_changes row per changed field (PRD FR-003, FR-012).
// A quoted-rate change can carry an optional note explaining why; it lands on the notes timeline.
export async function updateApplication(
  supabase: SupabaseClient,
  id: string,
  input: CreateApplicationInput,
  rateChangeNote: string | null,
): Promise<UpdateApplicationResult> {
  const { data: current, error: readError } = await supabase
    .from("applications")
    .select(TRACKED_FIELDS.join(", "))
    .eq("id", id)
    .maybeSingle<Record<TrackedField, string | null>>();
  if (readError) throw readError;
  if (!current) return { ok: false, code: "not_found", message: "Nie znaleziono aplikacji." };

  const changes = diffFields(current, input);
  if (changes.length === 0) return { ok: true, changed: 0 };

  const { error: updateError } = await supabase
    .from("applications")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) throw updateError;

  const { error: logError } = await supabase
    .from("field_changes")
    .insert(changes.map((c) => ({ application_id: id, ...c })));
  if (logError) throw logError;

  const rateChange = changes.find((c) => c.field === "quoted_rate");
  if (rateChange && rateChangeNote) {
    await addNote(supabase, id, {
      kind: "comment",
      body: `Zmiana stawki: ${rateChange.old_value ?? "—"} → ${rateChange.new_value ?? "—"}. ${rateChangeNote}`,
      noted_at: new Date().toISOString(),
    });
  }
  return { ok: true, changed: changes.length };
}
