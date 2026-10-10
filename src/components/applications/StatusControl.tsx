import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import ErrorText from "@/components/ErrorText";
import { apiRequest } from "@/lib/api-client";
import { errorMessage, type ClientMessage } from "@/lib/domain/client-errors";
import { allowedTargets, isTerminal } from "@/lib/domain/status";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type ApplicationStatus } from "@/types";

// The status pill; also used by the kitchen sink (/dev/ui) to show its disabled state.
export const STATUS_PILL_CLASS =
  "bg-secondary text-secondary-foreground h-auto min-h-10 rounded-full py-1 pr-8 pl-3 text-xs";

interface Props {
  applicationId: string;
  status: ApplicationStatus;
  /** "end" (default): right-aligned, as on the details view. "responsive": start-aligned below 640 px, where
   * the list stacks it under the title, and right-aligned from 640 px. */
  align?: "end" | "responsive";
}

export default function StatusControl({ applicationId, status, align = "end" }: Props) {
  const [error, setError] = useState<ClientMessage | null>(null);
  const [pending, setPending] = useState(false);
  const targets = allowedTargets(status);

  async function change(to: ApplicationStatus, requiresConfirmation: boolean) {
    if (
      requiresConfirmation &&
      !window.confirm(
        `Cofnąć status „${STATUS_LABELS[status]}” na „${STATUS_LABELS[to]}”? Zmiana zostanie zapisana w historii.`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    const body = new FormData();
    body.set("status", to);
    if (requiresConfirmation) body.set("confirm", "true");
    const result = await apiRequest(`/api/applications/${applicationId}/status`, {
      method: "POST",
      body,
      op: "application.status",
    });
    if (result.kind === "ok") {
      window.location.reload();
      return;
    }
    setError(errorMessage(result, "Nie udało się zmienić statusu."));
    setPending(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const target = targets.find((t) => t.status === e.target.value);
    e.target.value = "";
    if (target) void change(target.status, target.requiresConfirmation);
  }

  return (
    <div className={cn("flex flex-col gap-1", align === "responsive" ? "items-start sm:items-end" : "items-end")}>
      <Label className="sr-only" htmlFor={`status-${applicationId}`}>
        Zmień status
      </Label>
      {/* Status pill: the select's chevron replaces the former "▾" in the label. */}
      <NativeSelect
        id={`status-${applicationId}`}
        value=""
        disabled={pending}
        onChange={handleChange}
        className={STATUS_PILL_CLASS}
      >
        <NativeSelectOption value="" disabled>
          {STATUS_LABELS[status]}
        </NativeSelectOption>
        <NativeSelectOptGroup label={isTerminal(status) ? "Cofnij na (wymaga potwierdzenia)" : "Zmień na"}>
          {targets.map((t) => (
            <NativeSelectOption key={t.status} value={t.status}>
              {STATUS_LABELS[t.status]}
            </NativeSelectOption>
          ))}
        </NativeSelectOptGroup>
      </NativeSelect>
      {pending && (
        <p className="text-muted-foreground text-xs" role="status">
          Zapisywanie…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className={cn("text-destructive max-w-48 text-xs", align === "responsive" ? "sm:text-right" : "text-right")}
        >
          <ErrorText message={error} />
        </p>
      )}
    </div>
  );
}
