// Shared JSON answers for API routes. Imports src/lib/log.ts (`cloudflare:workers`), so nothing Vitest runs may import it.
import type { APIContext } from "astro";
import { isUuid } from "@/lib/domain/ids";
import { logError, type LogErrorExtra } from "@/lib/log";
import { isProjectPaused } from "@/lib/supabase-paused";

export const MALFORMED_BODY_MESSAGE = "Nieprawidłowe dane formularza.";

export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

// The route's [id]. Anything but a UUID cannot name a row, so it is "not found" before the body is read
// or Postgres is asked — a mistyped link must not become a logged 500 (and an alert). Like pages, not logged.
export function routeId(context: APIContext): string | Response {
  const id = context.params.id;
  return isUuid(id) ? id : jsonError(404, "Nie znaleziono.");
}

// The request's form body. A malformed or truncated body (e.g. multipart without a boundary) is the
// client's 400, logged with step "parse" — not an empty 500 thrown past the route's catch.
export async function readFormData(context: APIContext, extra: LogErrorExtra): Promise<FormData | Response> {
  try {
    return await context.request.formData();
  } catch (e) {
    logError(context, e, { ...extra, status: 400, step: "parse" });
    return jsonError(400, MALFORMED_BODY_MESSAGE);
  }
}

// A failed read or write in a route's catch: a paused project answers like the middleware does
// (503 database_paused); anything else is logged with its context and answers 500 with the route's message.
export function failureResponse(context: APIContext, error: unknown, extra: LogErrorExtra, message: string): Response {
  if (isProjectPaused(error)) {
    return Response.json({ error: "database_paused" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  logError(context, error, { status: 500, ...extra });
  return jsonError(500, message);
}
