// Supabase reports failures as values ({ data, error, status }), and PostgREST errors are often plain
// objects without a stack. Services rethrow them through toServiceError, so the log line keeps the
// operation (and the failing step of a multi-query read), a stack from the service, and the original
// code, details, hint and HTTP status in `cause` — isProjectPaused() still sees a paused project there.

interface SupabaseFailure {
  error: unknown;
  status?: number;
}

export function toServiceError(op: string, result: SupabaseFailure): Error {
  const source: Record<string, unknown> =
    result.error !== null && typeof result.error === "object"
      ? (result.error as Record<string, unknown>)
      : { message: String(result.error) };
  const message = typeof source.message === "string" && source.message ? source.message : "unknown error";
  // name and message of an Error instance are not own enumerable properties: copy them explicitly.
  const cause: Record<string, unknown> = { name: source.name, message, ...source };
  // PostgREST puts the HTTP status on the result, not on the error; Storage errors carry their own.
  const status = result.status ?? source.status;
  if (status !== undefined) cause.status = status;
  return new Error(`${op}: ${message}`, { cause });
}
