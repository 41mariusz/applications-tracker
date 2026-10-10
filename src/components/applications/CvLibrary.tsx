import { useState } from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import CvFileActions from "@/components/applications/CvFileActions";
import CvUploadBox, { CvUploadStatus } from "@/components/applications/CvUploadBox";
import { apiRequest } from "@/lib/api-client";
import { errorMessage, type ClientMessage } from "@/lib/domain/client-errors";
import { checkCvFile, CV_LIMITS_TEXT, formatFileSize } from "@/lib/domain/cv";
import { isClosed } from "@/lib/domain/status";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type ApplicationStatus, type CvFile, type UploadCvResponse } from "@/types";

export interface CvLibraryEntry {
  file: CvFile;
  applications: { id: string; company: string; position: string; status: ApplicationStatus }[];
}

interface CvItemProps {
  entry: CvLibraryEntry;
  /** Usage list expanded on first render (the kitchen sink shows it open); collapsed by default. */
  initialListOpen?: boolean;
}

// Text-sized controls get a 40 px tall hit area for a thumb; keyboard focus draws the ring token.
const TAP_CLASS =
  "focus-visible:ring-ring inline-flex min-h-10 items-center rounded-sm outline-none hover:underline focus-visible:ring-2";

// One file of the library, on the list card surface (as ApplicationCard). Phone: the actions sit under the
// file name and each usage row stacks; names wrap anywhere, so an unbroken name cannot push the page sideways.
export function CvItem({ entry, initialListOpen = false }: CvItemProps) {
  const { file, applications } = entry;
  const [listOpen, setListOpen] = useState(initialListOpen);

  return (
    <li
      id={`cv-${file.id}`}
      className="border-border bg-muted rounded-xl border p-4 backdrop-blur-xl"
      data-cv-id={file.id}
    >
      <CvFileActions cvId={file.id} mimeType={file.mime_type}>
        <p className="flex items-start gap-2 font-semibold" data-testid="cv-file-name">
          <FileText className="text-link mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 wrap-anywhere">{file.file_name}</span>
        </p>
        <p className="text-muted-foreground text-xs">
          {formatFileSize(file.size_bytes)} · wgrano {formatDateTime(file.created_at)}
        </p>
      </CvFileActions>

      {applications.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-xs">Nie jest podpięte do żadnej aplikacji.</p>
      ) : (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => {
              setListOpen(!listOpen);
            }}
            aria-expanded={listOpen}
            className={cn(TAP_CLASS, "text-link gap-1 text-sm")}
            data-testid="cv-usage"
            data-usage-count={applications.length}
          >
            {listOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            Podpięte do aplikacji: {applications.length}
          </button>
          {listOpen && (
            <ul className="mt-1 text-sm">
              {applications.map((a) => {
                const closed = isClosed(a.status);
                return (
                  <li
                    key={a.id}
                    className="border-border flex flex-col border-t pb-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:pb-0"
                  >
                    {/* Closed: struck through and muted, never dimmed with opacity. */}
                    <a
                      href={`/applications/${a.id}`}
                      className={cn(TAP_CLASS, "min-w-0", closed && "text-muted-foreground line-through")}
                    >
                      <span className="min-w-0 wrap-anywhere">
                        {a.company}{" "}
                        <span className={closed ? "text-muted-foreground" : "text-supporting-foreground"}>
                          — {a.position}
                        </span>
                      </span>
                    </a>
                    <span className="text-muted-foreground text-xs sm:shrink-0">{STATUS_LABELS[a.status]}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function UploadToLibrary() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ClientMessage | null>(null);
  const [pending, setPending] = useState(false);

  async function upload(file: File) {
    setError(null);
    setMessage(null);
    // Same rule as the server: a file that would be refused is not sent at all.
    const check = checkCvFile(file);
    if (!check.ok) {
      setError({ text: check.message });
      return;
    }
    setPending(true);
    const body = new FormData();
    body.set("file", file);
    const result = await apiRequest<UploadCvResponse | null>("/api/cv", {
      method: "POST",
      body,
      op: "cv.upload",
    });
    if (result.kind !== "ok") {
      setError(errorMessage(result, "Nie udało się wgrać pliku."));
    } else if (!result.data?.file) {
      setError({ text: "Nie udało się wgrać pliku." });
    } else if (result.data.reused) {
      setMessage(`Ten plik jest już w bibliotece jako „${result.data.file.file_name}”.`);
    } else {
      window.location.reload();
      return;
    }
    setPending(false);
  }

  return (
    <div className="border-border bg-card mb-4 rounded-xl border p-4 text-sm">
      <CvUploadBox
        id="cv-library-upload"
        label={`Wgraj CV do biblioteki (${CV_LIMITS_TEXT}) — ten sam plik nie zapisze się drugi raz`}
        pending={pending}
        onFile={(file) => void upload(file)}
      />
      <CvUploadStatus pending={pending} pendingLabel="Wgrywanie…" message={message} error={error} />
    </div>
  );
}

export default function CvLibrary({ entries }: { entries: CvLibraryEntry[] }) {
  return (
    <>
      <UploadToLibrary />
      {entries.length === 0 ? (
        <p className="border-border bg-card text-supporting-foreground rounded-xl border p-6 text-center">
          Biblioteka jest pusta. Wgraj CV powyżej albo przy aplikacji.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="cv-library">
          {entries.map((entry) => (
            <CvItem key={entry.file.id} entry={entry} />
          ))}
        </ul>
      )}
    </>
  );
}
