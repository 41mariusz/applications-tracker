import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APPLICATION_STATUSES, EMPLOYMENT_TYPES, WORK_MODES, type Application, type ApplicationStatus } from "@/types";
import { checkTransition, sortApplications } from "@/lib/domain/status";
import { diffFields, TRACKED_FIELDS, type TrackedField } from "@/lib/domain/changes";
import { toServiceError } from "@/lib/services/errors";

// Maximum lengths of the form's text fields: the schema enforces them, the form sets them as maxLength
// (so zod's default over-length message cannot be reached from the form).
export const APPLICATION_FIELD_MAX = {
  company: 200,
  position: 200,
  posting_url: 2000,
  salary_range: 100,
  quoted_rate: 100,
  hr_contact_name: 200,
  hr_contact_phone: 50,
} as const;

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
  company: z.string().trim().min(1, "Podaj nazwę firmy").max(APPLICATION_FIELD_MAX.company),
  position: z.string().trim().min(1, "Podaj stanowisko").max(APPLICATION_FIELD_MAX.position),
  posting_url: z
    .string()
    .trim()
    .max(APPLICATION_FIELD_MAX.posting_url)
    .refine((v) => v === "" || URL.canParse(v), "Podaj pełny adres, np. https://…")
    .transform((v) => (v === "" ? null : v)),
  salary_range: optionalText(APPLICATION_FIELD_MAX.salary_range),
  quoted_rate: optionalText(APPLICATION_FIELD_MAX.quoted_rate),
  hr_contact_name: optionalText(APPLICATION_FIELD_MAX.hr_contact_name),
  hr_contact_phone: optionalText(APPLICATION_FIELD_MAX.hr_contact_phone),
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
  const { data, error, status } = await supabase
    .from("applications")
    .insert(input)
    .select("id")
    .single<{ id: string }>();
  if (error) throw toServiceError("application.create", { error, status });
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
  const {
    data: current,
    error: readError,
    status: readStatus,
  } = await supabase.from("applications").select("status").eq("id", id).maybeSingle<{ status: ApplicationStatus }>();
  if (readError) throw toServiceError("application.status.read", { error: readError, status: readStatus });
  if (!current) return { ok: false, code: "not_found", message: "Nie znaleziono aplikacji." };

  const transition = checkTransition(current.status, to);
  if (!transition.allowed) return { ok: false, code: "not_allowed", message: transition.reason };
  if (transition.requiresConfirmation && !confirmed) {
    return { ok: false, code: "needs_confirmation", message: "Cofnięcie statusu końcowego wymaga potwierdzenia." };
  }

  // One transaction: the status and its history row are saved together. The function only
  // updates if the status is still the one we checked, so a concurrent change can't slip past the rule.
  const {
    data: updated,
    error,
    status,
  } = await supabase
    .rpc("change_application_status", {
      p_application_id: id,
      p_from: current.status,
      p_to: to,
      p_is_revert: transition.kind === "revert",
    })
    .overrideTypes<boolean, { merge: false }>();
  if (error) throw toServiceError("application.status.change", { error, status });
  if (updated !== true) {
    return { ok: false, code: "conflict", message: "Status zmienił się w międzyczasie. Odśwież stronę." };
  }
  return { ok: true, status: to };
}

export async function listApplications(supabase: SupabaseClient): Promise<Application[]> {
  const { data, error, status } = await supabase
    .from("applications")
    .select("*")
    .overrideTypes<Application[], { merge: false }>();
  if (error) throw toServiceError("applications.list", { error, status });
  return sortApplications(data);
}

export type UpdateApplicationResult =
  { ok: true; changed: number } | { ok: false; code: "not_found" | "conflict"; message: string };

// Edits leave a trace: one field_changes row per changed field (PRD FR-003, FR-012).
// A quoted-rate change can carry an optional note explaining why; it lands on the notes timeline.
export async function updateApplication(
  supabase: SupabaseClient,
  id: string,
  input: CreateApplicationInput,
  rateChangeNote: string | null,
): Promise<UpdateApplicationResult> {
  const {
    data: current,
    error: readError,
    status: readStatus,
  } = await supabase
    .from("applications")
    .select([...TRACKED_FIELDS, "updated_at"].join(", "))
    .eq("id", id)
    .maybeSingle<Record<TrackedField | "updated_at", string | null>>();
  if (readError) throw toServiceError("application.update.read", { error: readError, status: readStatus });
  if (!current) return { ok: false, code: "not_found", message: "Nie znaleziono aplikacji." };

  const changes = diffFields(current, input);
  if (changes.length === 0) return { ok: true, changed: 0 };

  const rateChange = changes.find((c) => c.field === "quoted_rate");
  const noteBody =
    rateChange && rateChangeNote
      ? `Zmiana stawki: ${rateChange.old_value ?? "—"} → ${rateChange.new_value ?? "—"}. ${rateChangeNote}`
      : null;

  // One transaction: fields, their change-log rows and the optional note are saved together.
  // The update is guarded by updated_at, so a concurrent edit is not silently overwritten.
  const {
    data: updated,
    error,
    status,
  } = await supabase
    .rpc("update_application", {
      p_application_id: id,
      p_expected_updated_at: current.updated_at,
      p_fields: input,
      p_changes: changes,
      p_note_body: noteBody,
    })
    .overrideTypes<boolean, { merge: false }>();
  if (error) throw toServiceError("application.update", { error, status });
  if (updated !== true) {
    return { ok: false, code: "conflict", message: "Aplikacja zmieniła się w międzyczasie. Odśwież stronę." };
  }
  return { ok: true, changed: changes.length };
}
