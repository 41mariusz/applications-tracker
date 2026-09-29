import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPLOYMENT_TYPES, WORK_MODES, type Application } from "@/types";

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

export async function listApplications(supabase: SupabaseClient): Promise<Application[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .order("last_activity_at", { ascending: false });
  if (error) throw error;
  return data as Application[];
}
