import { useState } from "react";
import { Button } from "@/components/ui/button";
import ErrorText from "@/components/ErrorText";
import { apiRequest } from "@/lib/api-client";
import { errorMessage, type ClientMessage } from "@/lib/domain/client-errors";

interface Props {
  applicationId: string;
  company: string;
  /** Kitchen sink (/dev/ui) only: show the pending state without sending anything. */
  forcePending?: boolean;
}

// Permanent delete of a crossed-out (Rejected/Withdrawn) application (PRD FR-004, update 2026-10-19).
// The details page renders it only when canDelete(status); the API and RLS refuse any other status.
export default function DeleteApplicationButton({ applicationId, company, forcePending = false }: Props) {
  const [error, setError] = useState<ClientMessage | null>(null);
  const [pending, setPending] = useState(forcePending);

  async function remove() {
    if (
      !window.confirm(
        `Usunąć trwale aplikację „${company}”? Notatki i historia zmian zostaną usunięte bez możliwości przywrócenia. Plik CV zostanie w bibliotece.`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await apiRequest(`/api/applications/${applicationId}`, {
      method: "DELETE",
      op: "application.delete",
    });
    if (result.kind === "ok") {
      window.location.assign("/dashboard");
      return;
    }
    setError(errorMessage(result, "Nie udało się usunąć aplikacji."));
    setPending(false);
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => void remove()}
        className="text-destructive min-h-10"
        data-testid="delete-application"
      >
        {pending ? "Usuwanie…" : "Usuń trwale"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          <ErrorText message={error} />
        </p>
      )}
    </div>
  );
}
