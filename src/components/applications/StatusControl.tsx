import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { allowedTargets, isTerminal } from "@/lib/domain/status";
import { STATUS_LABELS, type ApplicationStatus } from "@/types";

interface Props {
  applicationId: string;
  status: ApplicationStatus;
}

export default function StatusControl({ applicationId, status }: Props) {
  const [error, setError] = useState<string | null>(null);
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
    try {
      const response = await fetch(`/api/applications/${applicationId}/status`, { method: "POST", body });
      if (response.ok) {
        window.location.reload();
        return;
      }
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Nie udało się zmienić statusu.");
    } catch {
      setError("Brak połączenia. Spróbuj ponownie.");
    }
    setPending(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const target = targets.find((t) => t.status === e.target.value);
    e.target.value = "";
    if (target) void change(target.status, target.requiresConfirmation);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Label className="sr-only" htmlFor={`status-${applicationId}`}>
        Zmień status
      </Label>
      {/* Status pill: the select's chevron replaces the former "▾" in the label. */}
      <NativeSelect
        id={`status-${applicationId}`}
        value=""
        disabled={pending}
        onChange={handleChange}
        className="bg-secondary text-secondary-foreground h-auto rounded-full py-1 pr-8 pl-3 text-xs"
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
      {error && <p className="text-destructive max-w-48 text-right text-xs">{error}</p>}
    </div>
  );
}
