import { lazy, Suspense, useState, type ReactNode } from "react";
import { Download, Eye, EyeOff } from "lucide-react";
import ErrorBoundary, { PreviewFallback } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { cvFileUrl } from "@/lib/cv-urls";
import { cn } from "@/lib/utils";

// Loaded only when the preview is opened.
const CvPreview = lazy(() => import("./CvPreview"));

interface Props {
  cvId: string;
  mimeType: string;
  // The file-info block (name, size, date), shown next to the actions.
  children: ReactNode;
}

// Controls at least 40 px tall for a thumb; focus from the Button ring.
const ACTION_CLASS = "h-auto min-h-10 gap-1 rounded-lg px-3 py-1.5 text-xs has-[>svg]:px-3";

// One CV file's info, "Podgląd"/"Pobierz" and the in-page preview, shared by the details view (CvPanel)
// and the CV library. Phone: the actions sit under the info; from 640 px to its right.
export default function CvFileActions({ cvId, mimeType, children }: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">{children}</div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setPreviewOpen(!previewOpen);
            }}
            aria-expanded={previewOpen}
            className={ACTION_CLASS}
          >
            {previewOpen ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {previewOpen ? "Ukryj podgląd" : "Podgląd"}
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className={cn(
              ACTION_CLASS,
              "border-input hover:bg-muted hover:text-foreground bg-transparent font-normal shadow-none",
            )}
          >
            <a href={cvFileUrl(cvId, { download: true })}>
              <Download className="size-3.5" />
              Pobierz
            </a>
          </Button>
        </div>
      </div>
      {previewOpen && (
        <ErrorBoundary
          op="cv.preview"
          entityId={cvId}
          mimeType={mimeType}
          fallback={<PreviewFallback fileUrl={cvFileUrl(cvId)} />}
        >
          <Suspense fallback={<p className="text-muted-foreground mt-3 text-xs">Wczytywanie podglądu…</p>}>
            <CvPreview cvId={cvId} mimeType={mimeType} />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
