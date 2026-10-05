import React, { lazy, Suspense, useState } from "react";
import { Download, Eye, EyeOff, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { checkCvFile, formatFileSize } from "@/lib/domain/cv";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CvFile } from "@/types";

// Loaded only when the preview is opened.
const CvPreview = lazy(() => import("./CvPreview"));

interface Props {
  applicationId: string;
  current: CvFile | null;
  library: CvFile[];
}

async function attach(applicationId: string, cvFileId: string): Promise<string | null> {
  const body = new FormData();
  body.set("cv_file_id", cvFileId);
  const response = await fetch(`/api/applications/${applicationId}/cv`, { method: "POST", body });
  if (response.ok) return null;
  const data = (await response.json()) as { error?: string };
  return data.error ?? "Nie udało się podpiąć CV.";
}

// How long the "already in the library" message stays readable before the page refreshes.
const REUSED_MESSAGE_MS = 3000;

export default function CvPanel({ applicationId, current, library }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // reloadDelayMs is read after the action, so the action can decide whether a message needs reading time.
  async function run(action: () => Promise<string | null>, reloadDelayMs: () => number = () => 0) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const failure = await action();
      if (failure) setError(failure);
      else {
        // A delay leaves time to read an informational message before the page refreshes.
        setTimeout(() => {
          window.location.reload();
        }, reloadDelayMs());
        return;
      }
    } catch {
      setError("Brak połączenia. Spróbuj ponownie.");
    }
    setPending(false);
  }

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (id) void run(() => attach(applicationId, id));
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Same rule as the server: a file that would be refused is not sent at all.
    const check = checkCvFile(file);
    if (!check.ok) {
      setMessage(null);
      setError(check.message);
      return;
    }
    let reused = false;
    void run(
      async () => {
        const body = new FormData();
        body.set("file", file);
        const response = await fetch("/api/cv", { method: "POST", body });
        const data = (await response.json()) as { file?: CvFile; reused?: boolean; error?: string };
        if (!response.ok || !data.file) return data.error ?? "Nie udało się wgrać pliku.";
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
        <>
          <p className="flex flex-wrap items-center gap-2">
            <FileText className="text-link size-4" />
            <span data-testid="cv-current" className="min-w-0 break-words">
              {current.file_name}
            </span>
            <span className="text-muted-foreground text-xs">{formatFileSize(current.size_bytes)}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setPreviewOpen(!previewOpen);
              }}
              aria-expanded={previewOpen}
              className="h-auto gap-1 rounded-lg px-3 py-1.5 text-xs has-[>svg]:px-3"
            >
              {previewOpen ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {previewOpen ? "Ukryj podgląd" : "Podgląd"}
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-input hover:bg-muted hover:text-foreground h-auto gap-1 rounded-lg bg-transparent px-3 py-1.5 text-xs font-normal shadow-none has-[>svg]:px-3"
            >
              <a href={`/api/cv/${current.id}?download=1`}>
                <Download className="size-3.5" />
                Pobierz
              </a>
            </Button>
          </div>
          {previewOpen && (
            <Suspense fallback={<p className="text-muted-foreground mt-3 text-xs">Wczytywanie podglądu…</p>}>
              <CvPreview cvId={current.id} mimeType={current.mime_type} />
            </Suspense>
          )}
        </>
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
        <div className="min-w-0">
          <Label
            htmlFor={`cv-upload-${applicationId}`}
            className="text-supporting-foreground mb-1 block text-xs font-normal"
          >
            Wgraj nowe (PDF lub DOCX, do 5 MB)
          </Label>
          <input
            id={`cv-upload-${applicationId}`}
            type="file"
            disabled={pending}
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleUpload}
            className="text-supporting-foreground focus-visible:ring-ring file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 block w-full rounded-lg text-xs outline-none file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-1.5 focus-visible:ring-2"
          />
        </div>
      </div>
      {pending && !message && <p className="text-muted-foreground mt-2 text-xs">Zapisywanie…</p>}
      {message && <p className="text-supporting-foreground mt-2 text-xs">{message}</p>}
      {error && <p className="text-destructive mt-2 text-xs">{error}</p>}
    </section>
  );
}
