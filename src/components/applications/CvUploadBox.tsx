import type React from "react";
import ErrorText from "@/components/ErrorText";
import { Label } from "@/components/ui/label";
import type { ClientMessage } from "@/lib/domain/client-errors";
import { CV_ACCEPT } from "@/lib/domain/cv";

interface Props {
  id: string;
  label: string;
  pending: boolean;
  onFile: (file: File) => void;
}

// The file picker's markup, shared by the details view (CvPanel) and the CV library. The request logic stays
// in each island. The picker is at least 40 px tall for a thumb; keyboard focus draws the ring token.
export default function CvUploadBox({ id, label, pending, onFile }: Props) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared so picking the same file again fires a change.
    e.target.value = "";
    if (file) onFile(file);
  }

  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="text-supporting-foreground mb-1 block text-xs font-normal">
        {label}
      </Label>
      <input
        id={id}
        type="file"
        disabled={pending}
        accept={CV_ACCEPT}
        onChange={handleChange}
        className="text-supporting-foreground focus-visible:ring-ring file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 block min-h-10 w-full rounded-lg text-xs outline-none file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:px-3 file:py-1.5 focus-visible:ring-2"
      />
    </div>
  );
}

interface StatusProps {
  pending: boolean;
  // What the island is doing while pending ("Wgrywanie…", "Zapisywanie…").
  pendingLabel: string;
  // Informational line (e.g. the file was already in the library).
  message: string | null;
  error: ClientMessage | null;
}

// The status lines under an upload, separate from the picker so an island can place them under all of its
// controls (CvPanel: an attach error from the select must not read as an upload error).
export function CvUploadStatus({ pending, pendingLabel, message, error }: StatusProps) {
  return (
    <>
      {pending && !message && <p className="text-muted-foreground mt-2 text-xs">{pendingLabel}</p>}
      {message && (
        <p role="status" className="text-supporting-foreground mt-2 text-xs">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive mt-2 text-xs">
          <ErrorText message={error} />
        </p>
      )}
    </>
  );
}
