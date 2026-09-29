import React, { useState } from "react";
import { FileText } from "lucide-react";
import { formatFileSize } from "@/lib/domain/cv";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CvFile } from "@/types";

interface Props {
  applicationId: string;
  current: CvFile | null;
  library: CvFile[];
}

const selectClass =
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-purple-400 focus:outline-none";

async function attach(applicationId: string, cvFileId: string): Promise<string | null> {
  const body = new FormData();
  body.set("cv_file_id", cvFileId);
  const response = await fetch(`/api/applications/${applicationId}/cv`, { method: "POST", body });
  if (response.ok) return null;
  const data = (await response.json()) as { error?: string };
  return data.error ?? "Nie udało się podpiąć CV.";
}

export default function CvPanel({ applicationId, current, library }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<string | null>) {
    setPending(true);
    setError(null);
    try {
      const failure = await action();
      if (failure) setError(failure);
      else window.location.reload();
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
    void run(async () => {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/cv", { method: "POST", body });
      const data = (await response.json()) as { file?: CvFile; reused?: boolean; error?: string };
      if (!response.ok || !data.file) return data.error ?? "Nie udało się wgrać pliku.";
      // The same file was already in the library: nothing new was stored.
      if (data.reused) setMessage(`Ten plik jest już w bibliotece jako „${data.file.file_name}” — użyto istniejącego.`);
      return attach(applicationId, data.file.id);
    });
  }

  const others = library.filter((f) => f.id !== current?.id);

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm" data-testid="cv-panel">
      <h2 className="mb-2 font-semibold">CV</h2>
      {current ? (
        <p className="flex flex-wrap items-center gap-2">
          <FileText className="size-4 text-purple-300" />
          <a href={`/api/cv/${current.id}`} className="text-purple-300 underline" data-testid="cv-current">
            {current.file_name}
          </a>
          <span className="text-xs text-blue-100/50">{formatFileSize(current.size_bytes)}</span>
        </p>
      ) : (
        <p className="text-blue-100/60">Nie dołączono CV.</p>
      )}

      <div className={cn("mt-3 grid gap-3 sm:grid-cols-2", pending && "pointer-events-none opacity-60")}>
        {others.length > 0 && (
          <div>
            <label htmlFor={`cv-library-${applicationId}`} className="mb-1 block text-xs text-blue-100/70">
              {current ? "Zmień na CV z biblioteki" : "Wybierz z biblioteki"}
            </label>
            <select id={`cv-library-${applicationId}`} value="" onChange={handleSelect} className={selectClass}>
              <option value="" disabled className="text-black">
                —
              </option>
              {others.map((f) => (
                <option key={f.id} value={f.id} className="text-black">
                  {f.file_name} ({formatFileSize(f.size_bytes)}, {formatDateTime(f.created_at)})
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={`cv-upload-${applicationId}`} className="mb-1 block text-xs text-blue-100/70">
            Wgraj nowe (PDF lub DOCX, do 5 MB)
          </label>
          <input
            id={`cv-upload-${applicationId}`}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleUpload}
            className="block w-full text-xs text-blue-100/80 file:mr-3 file:rounded-lg file:border-0 file:bg-purple-600 file:px-3 file:py-1.5 file:text-white hover:file:bg-purple-500"
          />
        </div>
      </div>
      {pending && <p className="mt-2 text-xs text-blue-100/60">Zapisywanie…</p>}
      {message && <p className="mt-2 text-xs text-blue-100/70">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </section>
  );
}
