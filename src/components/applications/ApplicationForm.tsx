import React, { useState, useSyncExternalStore } from "react";
import ErrorText from "@/components/ErrorText";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api-client";
import { errorMessage, type ClientMessage } from "@/lib/domain/client-errors";
import { cn } from "@/lib/utils";
import {
  APPLICATION_FIELD_MAX,
  type ApplicationFormErrors,
  type ApplicationFormValues,
} from "@/lib/services/applications";
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS, WORK_MODES, WORK_MODE_LABELS } from "@/types";
import {
  FORM_CONTROL_CLASS,
  FORM_ERROR_CLASS,
  FORM_LABEL_CLASS,
  FORM_TEXT_ACTION_CLASS,
} from "@/components/applications/form-classes";

const noopSubscribe = () => () => undefined;

interface FieldProps {
  name: keyof ApplicationFormErrors;
  label: string;
  error?: string;
  children?: React.ReactNode;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  maxLength?: number;
}

function Field({ name, label, error, children, type = "text", placeholder, defaultValue, maxLength }: FieldProps) {
  return (
    <div>
      <Label htmlFor={name} className={FORM_LABEL_CLASS}>
        {label}
      </Label>
      {children ?? (
        <Input
          id={name}
          name={name}
          type={type}
          placeholder={placeholder}
          defaultValue={defaultValue}
          maxLength={maxLength}
          className={cn(FORM_CONTROL_CLASS, error && "border-destructive")}
        />
      )}
      {error && <p className={FORM_ERROR_CLASS}>{error}</p>}
    </div>
  );
}

interface Props {
  // Present in edit mode: the application being edited and its current values.
  application?: { id: string; values: ApplicationFormValues };
}

export default function ApplicationForm({ application }: Props) {
  const [errors, setErrors] = useState<ApplicationFormErrors>({});
  const [serverError, setServerError] = useState<ClientMessage | null>(null);
  const [pending, setPending] = useState(false);
  // The form has no native action: until the island hydrates, a submit would be a GET with the values in the URL.
  // The server snapshot is false, so SSR and the first client render agree and the button enables after hydration.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const initial = application?.values;
  const [quotedRate, setQuotedRate] = useState(initial?.quoted_rate ?? "");
  // Editing the quoted rate offers an optional "why" note (PRD FR-012).
  const rateChanged = application !== undefined && quotedRate.trim() !== (initial?.quoted_rate ?? "").trim();

  async function submit(form: HTMLFormElement) {
    setPending(true);
    setServerError(null);
    const result = await apiRequest(application ? `/api/applications/${application.id}` : "/api/applications", {
      method: application ? "PATCH" : "POST",
      body: new FormData(form),
      op: application ? "application.update" : "application.create",
    });
    if (result.kind === "ok") {
      window.location.assign(application ? `/applications/${application.id}` : "/dashboard");
      return;
    }
    // Validation answers with field errors only; anything else gets one message above the buttons.
    const fieldErrors = result.kind === "http" ? result.data.errors : undefined;
    setErrors(fieldErrors ?? {});
    setServerError(
      fieldErrors && result.kind === "http" && !result.data.error
        ? null
        : errorMessage(result, "Nie udało się zapisać."),
    );
    setPending(false);
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit(e.currentTarget);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit}
      onChange={(e) => {
        // Change events bubble up from the inputs; only the quoted rate matters here.
        const target: EventTarget = e.target;
        if (target instanceof HTMLInputElement && target.name === "quoted_rate") setQuotedRate(target.value);
      }}
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="company"
          label="Firma *"
          defaultValue={initial?.company}
          maxLength={APPLICATION_FIELD_MAX.company}
          error={errors.company}
        />
        <Field
          name="position"
          label="Stanowisko *"
          defaultValue={initial?.position}
          maxLength={APPLICATION_FIELD_MAX.position}
          error={errors.position}
        />
      </div>

      <Field
        name="posting_url"
        label="Link do ogłoszenia"
        type="url"
        placeholder="https://…"
        defaultValue={initial?.posting_url}
        maxLength={APPLICATION_FIELD_MAX.posting_url}
        error={errors.posting_url}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="salary_range"
          label="Widełki z ogłoszenia"
          placeholder="np. 18–24k netto B2B"
          defaultValue={initial?.salary_range}
          maxLength={APPLICATION_FIELD_MAX.salary_range}
          error={errors.salary_range}
        />
        <Field
          name="quoted_rate"
          label="Moja podana stawka"
          placeholder="np. 22k netto"
          defaultValue={initial?.quoted_rate}
          maxLength={APPLICATION_FIELD_MAX.quoted_rate}
          error={errors.quoted_rate}
        />
      </div>

      {rateChanged && (
        <div>
          <Label htmlFor="rate_change_note" className={FORM_LABEL_CLASS}>
            Dlaczego zmieniasz stawkę? (opcjonalnie — trafi do notatek)
          </Label>
          <Textarea
            id="rate_change_note"
            name="rate_change_note"
            rows={2}
            placeholder="np. po rozmowie technicznej podniosłem do 24k"
            className={FORM_CONTROL_CLASS}
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="hr_contact_name"
          label="Kontakt HR — imię i nazwisko"
          defaultValue={initial?.hr_contact_name}
          maxLength={APPLICATION_FIELD_MAX.hr_contact_name}
          error={errors.hr_contact_name}
        />
        <Field
          name="hr_contact_phone"
          label="Kontakt HR — telefon"
          type="tel"
          defaultValue={initial?.hr_contact_phone}
          maxLength={APPLICATION_FIELD_MAX.hr_contact_phone}
          error={errors.hr_contact_phone}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          name="applied_on"
          label="Data aplikowania"
          type="date"
          defaultValue={initial ? initial.applied_on : new Date().toISOString().slice(0, 10)}
          error={errors.applied_on}
        />
        <Field name="employment_type" label="Forma zatrudnienia" error={errors.employment_type}>
          <NativeSelect
            id="employment_type"
            name="employment_type"
            defaultValue={initial?.employment_type ?? ""}
            wrapperClassName="w-full"
            className={cn(FORM_CONTROL_CLASS, errors.employment_type && "border-destructive")}
          >
            <NativeSelectOption value="">—</NativeSelectOption>
            {EMPLOYMENT_TYPES.map((t) => (
              <NativeSelectOption key={t} value={t}>
                {EMPLOYMENT_TYPE_LABELS[t]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field name="work_mode" label="Tryb pracy" error={errors.work_mode}>
          <NativeSelect
            id="work_mode"
            name="work_mode"
            defaultValue={initial?.work_mode ?? ""}
            wrapperClassName="w-full"
            className={cn(FORM_CONTROL_CLASS, errors.work_mode && "border-destructive")}
          >
            <NativeSelectOption value="">—</NativeSelectOption>
            {WORK_MODES.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {WORK_MODE_LABELS[m]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>

      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>
            <p>
              <ErrorText message={serverError} />
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-4 pt-2">
        {/* size lg is h-10: the submit is 40 px tall like the controls. */}
        <Button type="submit" size="lg" disabled={pending || !hydrated}>
          {pending ? "Zapisywanie…" : "Zapisz"}
        </Button>
        <a href={application ? `/applications/${application.id}` : "/dashboard"} className={FORM_TEXT_ACTION_CLASS}>
          Anuluj
        </a>
      </div>
    </form>
  );
}
