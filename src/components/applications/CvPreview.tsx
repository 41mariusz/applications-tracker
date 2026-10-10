import { useEffect, useRef, useState } from "react";
import ErrorText from "@/components/ErrorText";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest, reportClientError } from "@/lib/api-client";
import { cvFileUrl } from "@/lib/cv-urls";
import { buildReport, errorMessage, type ClientMessage } from "@/lib/domain/client-errors";

interface Props {
  cvId: string;
  mimeType: string;
}

type State = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: ClientMessage };

const PREVIEW_FAILED: ClientMessage = { text: "Nie udało się pokazać podglądu." };

// Renders the CV inside the page (works on phones, where browsers often download PDFs instead
// of showing them). The rendering libraries are loaded only when a preview is opened.
export default function CvPreview({ cvId, mimeType }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const target = container.current;
    if (!target) return;
    // Aborted when the preview closes or switches to another file.
    const controller = new AbortController();
    // A function, so the checks after each await read the current value.
    const aborted = () => controller.signal.aborted;
    target.replaceChildren();

    // Import and render failures are the app's own: reported with the CV and its type.
    const fail = (step: "import" | "render", error: unknown) => {
      if (aborted()) return;
      reportClientError(
        buildReport({
          kind: "error",
          op: `cv.preview.${step}`,
          error,
          path: window.location.pathname,
          entityId: cvId,
          mimeType,
        }),
      );
      setState({ kind: "error", message: PREVIEW_FAILED });
    };

    void (async () => {
      // 1. The file (a server page instead of the file is reported by apiRequest).
      const result = await apiRequest(cvFileUrl(cvId), {
        op: "cv.preview",
        parse: "bytes",
        signal: controller.signal,
      });
      if (result.kind === "aborted" || aborted()) return;
      if (result.kind !== "ok") {
        setState({ kind: "error", message: errorMessage(result, "Nie udało się pobrać pliku.") });
        return;
      }
      // 2. The rendering libraries (a separate chunk, loaded on demand).
      let renderer: typeof import("./cv-render");
      try {
        renderer = await import("./cv-render");
      } catch (error) {
        fail("import", error);
        return;
      }
      if (aborted()) return;
      // 3. The render itself.
      try {
        await (mimeType === "application/pdf"
          ? renderer.renderPdf(result.data, target)
          : renderer.renderDocx(result.data, target));
        if (!aborted()) setState({ kind: "ready" });
      } catch (error) {
        fail("render", error);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [cvId, mimeType]);

  return (
    <div className="mt-3">
      {state.kind === "loading" && <p className="text-muted-foreground text-xs">Wczytywanie podglądu…</p>}
      {state.kind === "error" && (
        <Alert variant="destructive" data-testid="cv-preview-error">
          <AlertDescription>
            <p>
              <ErrorText message={state.message} />{" "}
              <a href={cvFileUrl(cvId)} target="_blank" rel="noopener noreferrer" className="text-link underline">
                Otwórz plik w nowej karcie
              </a>
              .
            </p>
          </AlertDescription>
        </Alert>
      )}
      {/* Paper: the rendered document assumes a white page. While empty (loading) it drops its padding, so no
          blank bar shows; it is never hidden, because renderPdf measures its width once at the start. */}
      <div
        ref={container}
        className="bg-paper text-paper-foreground max-h-[75vh] overflow-auto rounded-lg p-2 empty:p-0"
        hidden={state.kind === "error"}
        data-testid="cv-preview"
      />
    </div>
  );
}
