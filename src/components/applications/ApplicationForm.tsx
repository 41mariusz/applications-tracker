import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
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

type FieldName = keyof ApplicationFormErrors;

// Render order of the fields: after a failed validation the first invalid one (in this order) receives focus.
const FIELD_ORDER: readonly FieldName[] = [
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
];

// Accessibility attributes tying a control to its error message (the message element gets `errorId`).
function errorAttrs(error: string | undefined, errorId: string) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
  } as const;
}

interface FieldProps {
  name: FieldName;
  label: string;
  error?: string;
  // Id of the error message element, built with useId by the form.
  errorId: string;
  required?: boolean;
  children?: React.ReactNode;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  maxLength?: number;
}

function Field({
  name,
  label,
  error,
  errorId,
  required,
  children,
  type = "text",
  placeholder,
  defaultValue,
  maxLength,
}: FieldProps) {
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
          aria-required={required ? true : undefined}
          {...errorAttrs(error, errorId)}
          className={cn(FORM_CONTROL_CLASS, error && "border-destructive")}
        />
      )}
      {error && (
        <p id={errorId} role="alert" className={FORM_ERROR_CLASS}>
          {error}
        </p>
      )}
    </div>
  );
}

interface Props {
  // Present in edit mode: the application being edited and its current values.
  application?: { id: string; values: ApplicationFormValues };
  // Kitchen sink (/dev/ui) only: seed the initial state so the server render shows a given state of the real form.
  // Omitted by the app's pages (new.astro, [id]/edit.astro).
  initialErrors?: ApplicationFormErrors;
  initialServerError?: ClientMessage;
  initialPending?: boolean;
  // Kitchen sink only: the quoted rate as if already edited, so the "why" note shows (edit mode).
  initialQuotedRate?: string;
}

export default function ApplicationForm({
  application,
  initialErrors,
  initialServerError,
  initialPending,
  initialQuotedRate,
}: Props) {
  const [errors, setErrors] = useState<ApplicationFormErrors>(initialErrors ?? {});
  const [serverError, setServerError] = useState<ClientMessage | null>(initialServerError ?? null);
  const [pending, setPending] = useState(initialPending ?? false);
  // Set on each failed validation (a new object even for the same field), so focus moves every time.
  const [focusRequest, setFocusRequest] = useState<{ name: FieldName } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const idBase = useId();
  const errorId = (name: FieldName) => `${idBase}-${name}-error`;
  // The form has no native action: until the island hydrates, a submit would be a GET with the values in the URL.
  // The server snapshot is false, so SSR and the first client render agree and the button enables after hydration.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const initial = application?.values;
  const [quotedRate, setQuotedRate] = useState(initialQuotedRate ?? initial?.quoted_rate ?? "");
  // Editing the quoted rate offers an optional "why" note (PRD FR-012).
  const rateChanged = application !== undefined && quotedRate.trim() !== (initial?.quoted_rate ?? "").trim();
  // A validation-only failure (field errors, no server message) gets a summary above the buttons.
  const showInvalidSummary = serverError === null && Object.keys(errors).length > 0;

  // Runs after React has rendered the new errors, so the messages exist when focus lands on the field.
  useEffect(() => {
    if (!focusRequest) return;
    const control = formRef.current?.elements.namedItem(focusRequest.name);
    if (control instanceof HTMLElement) control.focus();
  }, [focusRequest]);

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
    const validationOnly = fieldErrors !== undefined && result.kind === "http" && !result.data.error;
    setErrors(fieldErrors ?? {});
    setServerError(validationOnly ? null : errorMessage(result, "Nie udało się zapisać."));
    setPending(false);
    const firstInvalid = validationOnly ? FIELD_ORDER.find((name) => fieldErrors[name]) : undefined;
    if (firstInvalid) setFocusRequest({ name: firstInvalid });
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit(e.currentTarget);
  }

  return (
    <form
      ref={formRef}
      className="space-y-4"
      aria-busy={pending ? true : undefined}
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
          required
          defaultValue={initial?.company}
          maxLength={APPLICATION_FIELD_MAX.company}
          error={errors.company}
          errorId={errorId("company")}
        />
        <Field
          name="position"
          label="Stanowisko *"
          required
          defaultValue={initial?.position}
          maxLength={APPLICATION_FIELD_MAX.position}
          error={errors.position}
          errorId={errorId("position")}
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
        errorId={errorId("posting_url")}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="salary_range"
          label="Widełki z ogłoszenia"
          placeholder="np. 18–24k netto B2B"
          defaultValue={initial?.salary_range}
          maxLength={APPLICATION_FIELD_MAX.salary_range}
          error={errors.salary_range}
          errorId={errorId("salary_range")}
        />
        <Field
          name="quoted_rate"
          label="Moja podana stawka"
          placeholder="np. 22k netto"
          defaultValue={initialQuotedRate ?? initial?.quoted_rate}
          maxLength={APPLICATION_FIELD_MAX.quoted_rate}
          error={errors.quoted_rate}
          errorId={errorId("quoted_rate")}
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
          errorId={errorId("hr_contact_name")}
        />
        <Field
          name="hr_contact_phone"
          label="Kontakt HR — telefon"
          type="tel"
          defaultValue={initial?.hr_contact_phone}
          maxLength={APPLICATION_FIELD_MAX.hr_contact_phone}
          error={errors.hr_contact_phone}
          errorId={errorId("hr_contact_phone")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          name="applied_on"
          label="Data aplikowania"
          type="date"
          defaultValue={initial ? initial.applied_on : new Date().toISOString().slice(0, 10)}
          error={errors.applied_on}
          errorId={errorId("applied_on")}
        />
        <Field
          name="employment_type"
          label="Forma zatrudnienia"
          error={errors.employment_type}
          errorId={errorId("employment_type")}
        >
          <NativeSelect
            id="employment_type"
            name="employment_type"
            defaultValue={initial?.employment_type ?? ""}
            wrapperClassName="w-full"
            {...errorAttrs(errors.employment_type, errorId("employment_type"))}
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
        <Field name="work_mode" label="Tryb pracy" error={errors.work_mode} errorId={errorId("work_mode")}>
          <NativeSelect
            id="work_mode"
            name="work_mode"
            defaultValue={initial?.work_mode ?? ""}
            wrapperClassName="w-full"
            {...errorAttrs(errors.work_mode, errorId("work_mode"))}
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

      {showInvalidSummary && (
        <Alert variant="destructive">
          <AlertDescription>
            <p>Popraw zaznaczone pola.</p>
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
