import { useEffect, useRef, useState } from "react";

interface Props {
  cvId: string;
  mimeType: string;
}

type State = "loading" | "ready" | "error";

// Renders the CV inside the page (works on phones, where browsers often download PDFs instead
// of showing them). The rendering libraries are loaded only when a preview is opened.
export default function CvPreview({ cvId, mimeType }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    const target = container.current;
    if (!target) return;
    // Aborted when the preview closes or switches to another file.
    const controller = new AbortController();
    target.replaceChildren();

    void (async () => {
      try {
        const response = await fetch(`/api/cv/${cvId}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
        const bytes = await response.arrayBuffer();
        const { renderPdf, renderDocx } = await import("./cv-render");
        if (controller.signal.aborted) return;
        await (mimeType === "application/pdf" ? renderPdf(bytes, target) : renderDocx(bytes, target));
        setState("ready");
      } catch {
        if (!controller.signal.aborted) setState("error");
      }
    })();

    return () => {
      controller.abort();
    };
  }, [cvId, mimeType]);

  return (
    <div className="mt-3">
      {state === "loading" && <p className="text-xs text-blue-100/60">Wczytywanie podglądu…</p>}
      {state === "error" && (
        <p className="text-xs text-red-300">
          Nie udało się pokazać podglądu.{" "}
          <a href={`/api/cv/${cvId}`} target="_blank" rel="noopener noreferrer" className="underline">
            Otwórz plik w nowej karcie
          </a>
          .
        </p>
      )}
      <div
        ref={container}
        className="max-h-[75vh] overflow-auto rounded-lg bg-white p-2 text-black"
        hidden={state === "error"}
        data-testid="cv-preview"
      />
    </div>
  );
}
