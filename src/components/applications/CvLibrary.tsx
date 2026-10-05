import React, { lazy, Suspense, useState } from "react";
import { ChevronDown, ChevronRight, Download, Eye, EyeOff, FileText } from "lucide-react";
import { checkCvFile, formatFileSize } from "@/lib/domain/cv";
import { isClosed } from "@/lib/domain/status";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type ApplicationStatus, type CvFile } from "@/types";

// Loaded only when a preview is opened.
const CvPreview = lazy(() => import("./CvPreview"));

export interface CvLibraryEntry {
  file: CvFile;
  applications: { id: string; company: string; position: string; status: ApplicationStatus }[];
}

function CvItem({ entry }: { entry: CvLibraryEntry }) {
  const { file, applications } = entry;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  return (
    <li className="rounded-xl border border-white/10 bg-white/10 p-4 backdrop-blur-xl" data-cv-id={file.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <FileText className="size-4 text-purple-300" />
            {file.file_name}
          </p>
          <p className="text-xs text-blue-100/60">
            {formatFileSize(file.size_bytes)} · wgrano {formatDateTime(file.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setPreviewOpen(!previewOpen);
            }}
            aria-expanded={previewOpen}
            className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium hover:bg-purple-500"
          >
            {previewOpen ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {previewOpen ? "Ukryj" : "Podgląd"}
          </button>
          <a
            href={`/api/cv/${file.id}?download=1`}
            className="inline-flex items-center gap-1 rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10"
          >
            <Download className="size-3.5" />
            Pobierz
          </a>
        </div>
      </div>

      {previewOpen && (
        <Suspense fallback={<p className="mt-3 text-xs text-blue-100/60">Wczytywanie podglądu…</p>}>
          <CvPreview cvId={file.id} mimeType={file.mime_type} />
        </Suspense>
      )}

      {applications.length === 0 ? (
        <p className="mt-3 text-xs text-blue-100/50">Nie jest podpięte do żadnej aplikacji.</p>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setListOpen(!listOpen);
            }}
            aria-expanded={listOpen}
            className="inline-flex items-center gap-1 text-sm text-purple-300 hover:underline"
            data-testid="cv-usage"
            data-usage-count={applications.length}
          >
            {listOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            Podpięte do aplikacji: {applications.length}
          </button>
          {listOpen && (
            <ul className="mt-2 space-y-1 text-sm">
              {applications.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/10 pt-1"
                >
                  <a
                    href={`/applications/${a.id}`}
                    className={cn("hover:underline", isClosed(a.status) && "line-through opacity-60")}
                  >
                    {a.company} <span className="text-blue-100/60">— {a.position}</span>
                  </a>
                  <span className="text-xs text-blue-100/60">{STATUS_LABELS[a.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function UploadToLibrary() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function upload(file: File) {
    setError(null);
    setMessage(null);
    // Same rule as the server: a file that would be refused is not sent at all.
    const check = checkCvFile(file);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setPending(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/cv", { method: "POST", body });
      const data = (await response.json()) as { file?: CvFile; reused?: boolean; error?: string };
      if (!response.ok || !data.file) {
        setError(data.error ?? "Nie udało się wgrać pliku.");
      } else if (data.reused) {
        setMessage(`Ten plik jest już w bibliotece jako „${data.file.file_name}”.`);
      } else {
        window.location.reload();
        return;
      }
    } catch {
      setError("Brak połączenia. Spróbuj ponownie.");
    }
    setPending(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void upload(file);
  }

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
      <label htmlFor="cv-library-upload" className="mb-1 block text-xs text-blue-100/70">
        Wgraj CV do biblioteki (PDF lub DOCX, do 5 MB) — ten sam plik nie zapisze się drugi raz
      </label>
      <input
        id="cv-library-upload"
        type="file"
        disabled={pending}
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleChange}
        className="block w-full text-xs text-blue-100/80 file:mr-3 file:rounded-lg file:border-0 file:bg-purple-600 file:px-3 file:py-1.5 file:text-white hover:file:bg-purple-500 disabled:opacity-60"
      />
      {pending && <p className="mt-2 text-xs text-blue-100/60">Wgrywanie…</p>}
      {message && <p className="mt-2 text-xs text-blue-100/70">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}

export default function CvLibrary({ entries }: { entries: CvLibraryEntry[] }) {
  return (
    <>
      <UploadToLibrary />
      {entries.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-blue-100/70">
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
