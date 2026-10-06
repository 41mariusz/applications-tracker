// Global browser failure listeners, bundled into every page by src/layouts/Layout.astro: uncaught errors,
// unhandled promise rejections and Astro island hydration failures go to /api/client-error.
// Noise (extensions, other origins, cancellations) is dropped; reportClientError dedupes and caps.
import { reportClientError } from "@/lib/api-client";
import { buildReport, isNoise, type ClientErrorKind } from "@/lib/domain/client-errors";

function stackOf(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

function nameOf(error: unknown): string | undefined {
  return error instanceof Error || error instanceof DOMException ? error.name : undefined;
}

function report(kind: ClientErrorKind, op: string, error: unknown, extra: { componentUrl?: string } = {}) {
  reportClientError(buildReport({ kind, op, error, path: window.location.pathname, ...extra }));
}

window.addEventListener("error", (event) => {
  // Resource load errors (img, script tags) reach window only in the capture phase; this listener sees script errors.
  const error: unknown = event.error ?? { name: "Error", message: event.message };
  if (
    isNoise(
      { message: event.message, name: nameOf(event.error), filename: event.filename, stack: stackOf(event.error) },
      window.location.origin,
    )
  ) {
    return;
  }
  report("error", "window.error", error);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason: unknown = event.reason;
  const message = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : undefined;
  if (isNoise({ message, name: nameOf(reason), stack: stackOf(reason) }, window.location.origin)) return;
  report("rejection", "window.unhandledrejection", reason);
});

// astro-island dispatches this after a failed island import or hydration (detail: { error, componentUrl }).
document.addEventListener("astro:hydration-error", (event) => {
  const detail = (event as CustomEvent<{ error?: unknown; componentUrl?: string } | null>).detail;
  const error = detail?.error;
  if (isNoise({ message: error instanceof Error ? error.message : undefined, name: nameOf(error) })) return;
  report("hydration", "astro.hydration", error, { componentUrl: detail?.componentUrl });
});
