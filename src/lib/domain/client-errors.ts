// Browser failure rules. Pure functions — no I/O beyond reading a Response body.
// - classifyResponse / classifyThrown: what a fetch outcome means (network, paused, a server page, a JSON error);
// - errorMessage: the Polish text the user sees for it;
// - isNoise / buildReport / createReportGate: what the browser reports to /api/client-error, and how often;
// - clientErrorReportSchema: what that endpoint accepts.
import { z } from "zod";

// The JSON error body API routes send: a message, field errors, or a code from the middleware.
export interface ApiErrorBody {
  error?: string;
  errors?: Record<string, string>;
  [key: string]: unknown;
}

export type ClientResult<T = unknown> =
  | { kind: "ok"; status: number; data: T }
  // A JSON error from the app (validation, not found, 401, a route's own 500 message).
  | { kind: "http"; status: number; data: ApiErrorBody }
  // 503 database_paused: the Supabase project is paused.
  | { kind: "paused"; status: number }
  // Not the app's JSON: a Cloudflare error page (1101/1102), an empty 500, a body that does not parse.
  | { kind: "server"; status: number }
  // The request never got an answer (offline, DNS, connection reset).
  | { kind: "network"; name: string; message: string }
  // Cancelled by the caller (e.g. a closed preview).
  | { kind: "aborted" };

export type ParseMode = "json" | "bytes";

function isJson(res: Response): boolean {
  return (res.headers.get("content-type") ?? "").toLowerCase().includes("application/json");
}

async function readJsonObject(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text();
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// Reads the body as needed. A body that fails mid-read rejects (the caller treats it like a network failure).
export async function classifyResponse(res: Response, parse: ParseMode = "json"): Promise<ClientResult> {
  if (res.ok) {
    if (parse === "bytes") return { kind: "ok", status: res.status, data: await res.arrayBuffer() };
    const data = isJson(res) ? await readJsonObject(res) : null;
    return { kind: "ok", status: res.status, data };
  }
  const data = isJson(res) ? await readJsonObject(res) : null;
  if (!data) return { kind: "server", status: res.status };
  if (res.status === 503 && data.error === "database_paused") return { kind: "paused", status: res.status };
  return { kind: "http", status: res.status, data };
}

// A rejected fetch (or body read): aborted by the caller, or no answer at all.
export function classifyThrown(error: unknown, signal?: AbortSignal | null): ClientResult {
  const name = error instanceof Error || error instanceof DOMException ? error.name : typeof error;
  if (signal?.aborted || name === "AbortError") return { kind: "aborted" };
  const message = error instanceof Error || error instanceof DOMException ? error.message : String(error);
  return { kind: "network", name, message };
}

export interface ClientMessage {
  text: string;
  href?: string;
  linkLabel?: string;
}

export const NETWORK_MESSAGE = "Brak połączenia. Spróbuj ponownie.";
export const PAUSED_MESSAGE: ClientMessage = {
  text: "Baza danych jest uśpiona, więc nie udało się tego zapisać ani wczytać.",
  href: "/paused",
  linkLabel: "Jak ją wznowić",
};

// Codes the middleware answers with instead of a route's own message.
const CODE_MESSAGES: Record<string, string> = {
  auth_unavailable: "Logowanie jest chwilowo niedostępne. Spróbuj ponownie za chwilę.",
  misconfigured: "Aplikacja jest źle skonfigurowana. Spróbuj ponownie później.",
  database_paused: PAUSED_MESSAGE.text,
};

export function serverMessage(status: number): string {
  return `Błąd serwera (${String(status)}). Spróbuj ponownie za chwilę.`;
}

export function errorMessage(result: ClientResult, fallback: string): ClientMessage {
  switch (result.kind) {
    case "network":
      return { text: NETWORK_MESSAGE };
    case "server":
      return { text: serverMessage(result.status) };
    case "paused":
      return PAUSED_MESSAGE;
    case "http": {
      const error = typeof result.data.error === "string" && result.data.error ? result.data.error : undefined;
      const text = (error && CODE_MESSAGES[error]) ?? error ?? fallback;
      return result.status === 401 ? { text, href: "/auth/signin", linkLabel: "Zaloguj się" } : { text };
    }
    case "ok":
    case "aborted":
      return { text: fallback };
  }
}

// ---- Reports sent to /api/client-error ----

export const CLIENT_ERROR_KINDS = ["server", "boundary", "error", "rejection", "hydration", "test"] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

export const MAX_REPORT_MESSAGE = 300;
export const MAX_REPORT_BYTES = 4096;
export const MAX_REPORTS_PER_PAGE = 5;

export const clientErrorReportSchema = z.object({
  kind: z.enum(CLIENT_ERROR_KINDS),
  op: z.string().min(1).max(100),
  status: z.int().min(100).max(599).optional(),
  name: z.string().max(100),
  message: z.string().max(MAX_REPORT_MESSAGE),
  path: z.string().startsWith("/").max(300),
  componentUrl: z.string().max(300).optional(),
  // The CV a preview failed for, and its type (CvPreview import/render failures).
  entityId: z.string().max(64).optional(),
  mimeType: z.string().max(100).optional(),
});

export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;

export interface ReportInput {
  kind: ClientErrorKind;
  op: string;
  error?: unknown;
  status?: number;
  // location.pathname + search (+ hash): only the path is kept.
  path: string;
  componentUrl?: string;
  entityId?: string;
  mimeType?: string;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Query and fragment may carry search terms; a URL is reduced to its path.
function stripQuery(value: string): string {
  const path = value.split(/[?#]/, 1)[0];
  return path.slice(0, 300);
}

function errorName(error: unknown): string {
  if (error instanceof Error || error instanceof DOMException) return error.name || "Error";
  if (error !== null && typeof error === "object" && typeof (error as { name?: unknown }).name === "string") {
    return (error as { name: string }).name || "Object";
  }
  return typeof error;
}

function errorText(error: unknown): string {
  if (error instanceof Error || error instanceof DOMException) return error.message;
  if (error !== null && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  if (error === undefined) return "";
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean" || typeof error === "bigint") return String(error);
  if (typeof error === "symbol" || typeof error === "function") return typeof error;
  try {
    return JSON.stringify(error);
  } catch {
    return "[unserializable]";
  }
}

// Only the error's name and message travel — never form values or the error object itself.
export function buildReport(input: ReportInput): ClientErrorReport {
  const report: ClientErrorReport = {
    kind: input.kind,
    op: truncate(input.op, 100),
    name: truncate(errorName(input.error), 100),
    message: truncate(errorText(input.error), MAX_REPORT_MESSAGE),
    path: stripQuery(input.path.startsWith("/") ? input.path : `/${input.path}`),
  };
  if (input.status !== undefined) report.status = input.status;
  if (input.componentUrl) report.componentUrl = stripQuery(input.componentUrl);
  if (input.entityId) report.entityId = input.entityId.slice(0, 64);
  if (input.mimeType) report.mimeType = input.mimeType.slice(0, 100);
  return report;
}

// What a window error / rejection looks like once read from the event.
export interface ErrorEventInfo {
  message?: string;
  name?: string;
  filename?: string;
  stack?: string;
}

const EXTENSION_URL = /^(chrome|moz|safari|safari-web|ms-browser)-extension:\/\//;

// Errors the app cannot act on: browser layout notices, cancellations, extensions, other origins' scripts.
export function isNoise(event: ErrorEventInfo, origin?: string): boolean {
  const message = event.message ?? "";
  if (message.includes("ResizeObserver loop")) return true;
  if (event.name === "AbortError") return true;
  // A cross-origin script's error is masked by the browser: nothing to read.
  if (/^Script error\.?$/.test(message.trim())) return true;
  if (event.filename && EXTENSION_URL.test(event.filename)) return true;
  if (event.stack && /(chrome|moz|safari|safari-web|ms-browser)-extension:\/\//.test(event.stack)) return true;
  if (origin && event.filename && /^https?:\/\//.test(event.filename)) {
    try {
      if (new URL(event.filename).origin !== origin) return true;
    } catch {
      return false;
    }
  }
  return false;
}

// Per page load: the same failure is sent once, and at most `limit` reports in all.
export function createReportGate(limit = MAX_REPORTS_PER_PAGE): (report: ClientErrorReport) => boolean {
  const seen = new Set<string>();
  return (report) => {
    if (seen.size >= limit) return false;
    const key = [report.kind, report.op, report.status ?? "", report.name, report.message, report.path].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}
