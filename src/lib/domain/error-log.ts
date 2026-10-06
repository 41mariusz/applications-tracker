// The one structured server error line: built from the request context and whatever was thrown.
// Errors, PostgREST-style plain objects and `cause` chains are serialised explicitly (how workerd's
// console prints them is not guaranteed). Only allow-listed fields are copied, so no PII such as the
// user's e-mail reaches the log; `details` is truncated but not scrubbed.

export const MAX_MESSAGE_LENGTH = 500;
export const MAX_STACK_LENGTH = 2000;
export const MAX_DETAILS_LENGTH = 500;
const MAX_CAUSE_DEPTH = 3;

export interface ErrorLineInput {
  // "warn" for expected-but-notable failures (e.g. a rejected session token); Issues records "error" only.
  level?: "error" | "warn";
  op?: string;
  route: string;
  method: string;
  path: string;
  status?: number;
  userId?: string | null;
  version: string;
  step?: string;
  entityId?: string;
  error?: unknown;
}

export interface SerializedError {
  name: string;
  message: string;
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  stack?: string;
  cause?: SerializedError;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function asText(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") return truncate(value, max);
  try {
    return truncate(JSON.stringify(value), max);
  } catch {
    // Circular or BigInt values cannot be stringified; say so instead of "[object Object]".
    return "[unserializable]";
  }
}

function serializeError(error: unknown, depth = 0): SerializedError {
  if (error === null || typeof error !== "object") {
    return { name: typeof error, message: truncate(String(error), MAX_MESSAGE_LENGTH) };
  }

  const source = error as Record<string, unknown>;
  const name =
    error instanceof Error ? error.name : typeof source.name === "string" && source.name ? source.name : "Object";
  const message =
    typeof source.message === "string"
      ? source.message
      : error instanceof Error
        ? ""
        : (asText(error, MAX_MESSAGE_LENGTH) ?? "");

  const out: SerializedError = { name, message: truncate(message, MAX_MESSAGE_LENGTH) };
  if (typeof source.code === "string" || typeof source.code === "number") out.code = String(source.code);
  if (typeof source.status === "number") out.status = source.status;
  const details = asText(source.details, MAX_DETAILS_LENGTH);
  if (details !== undefined) out.details = details;
  const hint = asText(source.hint, MAX_MESSAGE_LENGTH);
  if (hint !== undefined) out.hint = hint;
  if (typeof source.stack === "string") out.stack = truncate(source.stack, MAX_STACK_LENGTH);
  if (source.cause !== undefined && depth < MAX_CAUSE_DEPTH) out.cause = serializeError(source.cause, depth + 1);
  return out;
}

// The path without its query string or fragment (search terms may carry personal data).
function stripQuery(path: string): string {
  return path.split(/[?#]/, 1)[0];
}

export function formatErrorLine(input: ErrorLineInput): Record<string, unknown> {
  const line: Record<string, unknown> = {
    level: input.level ?? "error",
    route: input.route,
    method: input.method,
    path: stripQuery(input.path),
    version: input.version,
  };
  if (input.op !== undefined) line.op = input.op;
  if (input.status !== undefined) line.status = input.status;
  if (input.userId) line.userId = input.userId;
  if (input.step !== undefined) line.step = input.step;
  if (input.entityId !== undefined) line.entityId = input.entityId;
  if (input.error !== undefined) line.error = serializeError(input.error);
  return line;
}
