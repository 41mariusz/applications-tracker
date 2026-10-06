import type { APIRoute } from "astro";
import { clientErrorReportSchema, MAX_REPORT_BYTES } from "@/lib/domain/client-errors";
import { logError } from "@/lib/log";

export const prerender = false;

// Browser failure reports (src/lib/api-client.ts reportClientError): one error-level line each, which
// Workers Issues turns into an alert. Signed-in users only; small, validated bodies only. The browser
// dedupes and caps reports per page load. Kind "test" is the manual production proof of the alert path.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }

  const contentLength = context.request.headers.get("content-length");
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_REPORT_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  let raw: string;
  try {
    raw = await context.request.text();
  } catch {
    // The browser went away mid-send: nothing to report, and not a server failure.
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  // Content-Length may be missing (chunked): check what actually arrived.
  if (new TextEncoder().encode(raw).length > MAX_REPORT_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = clientErrorReportSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "invalid_report" }, { status: 400 });
  }

  const report = parsed.data;
  // The browser's error as the line's error; where it happened (the page, the action, the island) in details.
  const where = {
    clientOp: report.op,
    path: report.path,
    ...(report.componentUrl ? { componentUrl: report.componentUrl } : {}),
    ...(report.mimeType ? { mimeType: report.mimeType } : {}),
  };
  logError(
    context,
    { name: report.name || "Error", message: report.message, details: where },
    { op: `client.${report.kind}`, status: report.status, entityId: report.entityId },
  );
  return new Response(null, { status: 204 });
};
