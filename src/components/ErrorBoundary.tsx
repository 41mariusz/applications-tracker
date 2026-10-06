import React from "react";
import { RotateCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/api-client";
import { buildReport } from "@/lib/domain/client-errors";

interface Props {
  // What the wrapped part does (e.g. "cv.preview"), for the report.
  op: string;
  fallback: React.ReactNode;
  // Extra context for the report (e.g. the CV id and its type).
  entityId?: string;
  mimeType?: string;
  children: React.ReactNode;
}

interface State {
  failed: boolean;
}

// Catches a render or lazy-chunk failure in its subtree: shows the fallback instead of an empty panel
// and reports the failure to /api/client-error (kind "boundary").
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const { op, entityId, mimeType } = this.props;
    reportClientError(buildReport({ kind: "boundary", op, error, path: window.location.pathname, entityId, mimeType }));
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// The fallback for a CV preview that could not load: reload, or open the file itself.
export function PreviewFallback({ fileUrl }: { fileUrl: string }) {
  return (
    <Alert variant="destructive" className="mt-3" data-testid="preview-fallback">
      <AlertDescription>
        <p>Nie udało się wczytać podglądu.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.reload();
            }}
            className="border-input hover:bg-muted hover:text-foreground text-foreground h-auto gap-1 rounded-lg bg-transparent px-3 py-1.5 text-xs font-normal shadow-none has-[>svg]:px-3"
          >
            <RotateCw className="size-3.5" />
            Odśwież stronę
          </Button>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link focus-visible:ring-ring rounded-sm text-xs underline outline-none focus-visible:ring-2"
          >
            Otwórz plik
          </a>
        </div>
      </AlertDescription>
    </Alert>
  );
}
