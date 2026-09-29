import React, { useState } from "react";
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
      <label className="sr-only" htmlFor={`status-${applicationId}`}>
        Zmień status
      </label>
      <select
        id={`status-${applicationId}`}
        value=""
        disabled={pending}
        onChange={handleChange}
        className="rounded-full border border-white/20 bg-purple-500/30 px-3 py-1 text-xs text-white focus:ring-2 focus:ring-purple-400 focus:outline-none disabled:opacity-60"
      >
        <option value="" disabled className="text-black">
          {STATUS_LABELS[status]} ▾
        </option>
        <optgroup label={isTerminal(status) ? "Cofnij na (wymaga potwierdzenia)" : "Zmień na"} className="text-black">
          {targets.map((t) => (
            <option key={t.status} value={t.status} className="text-black">
              {STATUS_LABELS[t.status]}
            </option>
          ))}
        </optgroup>
      </select>
      {error && <p className="max-w-48 text-right text-xs text-red-300">{error}</p>}
    </div>
  );
}
