import type React from "react";
import { useState } from "react";
import { FileText } from "lucide-react";
import CvFileActions from "@/components/applications/CvFileActions";
import CvUploadBox, { CvUploadStatus } from "@/components/applications/CvUploadBox";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { apiRequest } from "@/lib/api-client";
import { applicationCvUrl } from "@/lib/cv-urls";
import { errorMessage, type ClientMessage } from "@/lib/domain/client-errors";
import { checkCvFile, CV_LIMITS_TEXT, formatFileSize } from "@/lib/domain/cv";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AttachCvResponse, CvFile, UploadCvResponse } from "@/types";

interface Props {
  applicationId: string;
  current: CvFile | null;
  library: CvFile[];
}

async function attach(applicationId: string, cvFileId: string): Promise<ClientMessage | null> {
  const body = new FormData();
  body.set("cv_file_id", cvFileId);
  const result = await apiRequest<AttachCvResponse | null>(applicationCvUrl(applicationId), {
    method: "POST",
    body,
    op: "application.cv",
  });
  return result.kind === "ok" ? null : errorMessage(result, "Nie udało się podpiąć CV.");
}

// How long the "already in the library" message stays readable before the page refreshes.
const REUSED_MESSAGE_MS = 3000;

export default function CvPanel({ applicationId, current, library }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ClientMessage | null>(null);
  const [pending, setPending] = useState(false);

  // reloadDelayMs is read after the action, so the action can decide whether a message needs reading time.
  async function run(action: () => Promise<ClientMessage | null>, reloadDelayMs: () => number = () => 0) {
    setPending(true);
    setError(null);
    setMessage(null);
    const failure = await action();
    if (!failure) {
      // A delay leaves time to read an informational message before the page refreshes.
      setTimeout(() => {
        window.location.reload();
      }, reloadDelayMs());
      return;
    }
    setError(failure);
    setPending(false);
  }

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (id) void run(() => attach(applicationId, id));
  }

  function handleUpload(file: File) {
    // Same rule as the server: a file that would be refused is not sent at all.
    const check = checkCvFile(file);
    if (!check.ok) {
      setMessage(null);
      setError({ text: check.message });
      return;
    }
    let reused = false;
    void run(
      async () => {
        const body = new FormData();
        body.set("file", file);
        const result = await apiRequest<UploadCvResponse | null>("/api/cv", {
          method: "POST",
          body,
          op: "cv.upload",
        });
        if (result.kind !== "ok") return errorMessage(result, "Nie udało się wgrać pliku.");
        const data = result.data;
        if (!data?.file) return { text: "Nie udało się wgrać pliku." };
        const failure = await attach(applicationId, data.file.id);
        // The same file was already in the library: nothing new was stored. Said only once attached.
        if (!failure && data.reused) {
          reused = true;
          setMessage(`Ten plik jest już w bibliotece jako „${data.file.file_name}” — użyto istniejącego.`);
        }
        return failure;
      },
      () => (reused ? REUSED_MESSAGE_MS : 0),
    );
  }

  const others = library.filter((f) => f.id !== current?.id);

  return (
    <section className="bg-card rounded-xl border p-4 text-sm" data-testid="cv-panel">
      <h2 className="mb-2 font-semibold">CV</h2>
      {current ? (
        <CvFileActions cvId={current.id} mimeType={current.mime_type}>
          <p className="flex items-start gap-2">
            <FileText className="text-link mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 wrap-anywhere">
              <span data-testid="cv-current">{current.file_name}</span>{" "}
              <span className="text-muted-foreground text-xs whitespace-nowrap">
                {formatFileSize(current.size_bytes)}
              </span>
            </span>
          </p>
        </CvFileActions>
      ) : (
        <p className="text-muted-foreground">Nie dołączono CV.</p>
      )}

      <div className={cn("mt-3 grid gap-3 sm:grid-cols-2", pending && "pointer-events-none opacity-60")}>
        {others.length > 0 && (
          <div className="min-w-0">
            <Label
              htmlFor={`cv-library-${applicationId}`}
              className="text-supporting-foreground mb-1 block text-xs font-normal"
            >
              {current ? "Zmień na CV z biblioteki" : "Wybierz z biblioteki"}
            </Label>
            <NativeSelect
              id={`cv-library-${applicationId}`}
              value=""
              disabled={pending}
              onChange={handleSelect}
              wrapperClassName="w-full"
              className="bg-muted"
            >
              <NativeSelectOption value="" disabled>
                —
              </NativeSelectOption>
              {others.map((f) => (
                <NativeSelectOption key={f.id} value={f.id}>
                  {f.file_name} ({formatFileSize(f.size_bytes)}, {formatDateTime(f.created_at)})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
        <CvUploadBox
          id={`cv-upload-${applicationId}`}
          label={`Wgraj nowe (${CV_LIMITS_TEXT})`}
          pending={pending}
          onFile={handleUpload}
        />
      </div>
      <CvUploadStatus pending={pending} pendingLabel="Zapisywanie…" message={message} error={error} />
    </section>
  );
}
