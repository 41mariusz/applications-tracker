import React, { useState } from "react";
import { cn } from "@/lib/utils";
import type { ApplicationFormErrors } from "@/lib/services/applications";
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS, WORK_MODES, WORK_MODE_LABELS } from "@/types";

const inputClass =
  "w-full rounded-lg border bg-white/10 px-3 py-2 text-white placeholder-white/40 focus:ring-2 focus:outline-none";
const labelClass = "mb-1 block text-sm text-blue-100/80";

interface FieldProps {
  name: keyof ApplicationFormErrors;
  label: string;
  error?: string;
  children?: React.ReactNode;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}

function Field({ name, label, error, children, type = "text", placeholder, defaultValue }: FieldProps) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      {children ?? (
        <input
          id={name}
          name={name}
          type={type}
          placeholder={placeholder}
          defaultValue={defaultValue}
          className={cn(
            inputClass,
            error ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
          )}
        />
      )}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

export default function ApplicationForm() {
  const [errors, setErrors] = useState<ApplicationFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(form: HTMLFormElement) {
    setPending(true);
    setServerError(null);
    try {
      const response = await fetch("/api/applications", { method: "POST", body: new FormData(form) });
      if (response.status === 201) {
        window.location.assign("/dashboard");
        return;
      }
      const body = (await response.json()) as { errors?: ApplicationFormErrors; error?: string };
      setErrors(body.errors ?? {});
      setServerError(body.error ?? null);
    } catch {
      setServerError("Brak połączenia. Spróbuj ponownie.");
    }
    setPending(false);
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit(e.currentTarget);
  }

  const selectClass = cn(inputClass, "border-white/20 focus:ring-purple-400");

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="company" label="Firma *" error={errors.company} />
        <Field name="position" label="Stanowisko *" error={errors.position} />
      </div>

      <Field
        name="posting_url"
        label="Link do ogłoszenia"
        type="url"
        placeholder="https://…"
        error={errors.posting_url}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="salary_range"
          label="Widełki z ogłoszenia"
          placeholder="np. 18–24k netto B2B"
          error={errors.salary_range}
        />
        <Field name="quoted_rate" label="Moja podana stawka" placeholder="np. 22k netto" error={errors.quoted_rate} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="hr_contact_name" label="Kontakt HR — imię i nazwisko" error={errors.hr_contact_name} />
        <Field name="hr_contact_phone" label="Kontakt HR — telefon" type="tel" error={errors.hr_contact_phone} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          name="applied_on"
          label="Data aplikowania"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          error={errors.applied_on}
        />
        <Field name="employment_type" label="Forma zatrudnienia" error={errors.employment_type}>
          <select id="employment_type" name="employment_type" defaultValue="" className={selectClass}>
            <option value="" className="text-black">
              —
            </option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t} className="text-black">
                {EMPLOYMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field name="work_mode" label="Tryb pracy" error={errors.work_mode}>
          <select id="work_mode" name="work_mode" defaultValue="" className={selectClass}>
            <option value="" className="text-black">
              —
            </option>
            {WORK_MODES.map((m) => (
              <option key={m} value={m} className="text-black">
                {WORK_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {serverError && <p className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200">{serverError}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-purple-600 px-5 py-2 font-medium transition-colors hover:bg-purple-500 disabled:opacity-60"
        >
          {pending ? "Zapisywanie…" : "Zapisz"}
        </button>
        <a href="/dashboard" className="text-sm text-purple-300 hover:underline">
          Anuluj
        </a>
      </div>
    </form>
  );
}
