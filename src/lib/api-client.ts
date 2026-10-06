// The browser's only fetch path to the app's API: network and abort handling, response classification
// (src/lib/domain/client-errors.ts), and a report to /api/client-error when the answer is not the app's own
// (e.g. a Cloudflare error page). Success handling (reload, redirect) stays with the caller.
import {
  buildReport,
  classifyResponse,
  classifyThrown,
  createReportGate,
  type ClientErrorReport,
  type ClientResult,
  type ParseMode,
} from "@/lib/domain/client-errors";

export interface ApiRequestInit extends RequestInit {
  // What the request does (e.g. "application.status"), so a report says which action failed.
  op: string;
  parse?: ParseMode;
}

export function apiRequest(url: string, init: ApiRequestInit & { parse: "bytes" }): Promise<ClientResult<ArrayBuffer>>;
export function apiRequest<T = Record<string, unknown> | null>(
  url: string,
  init: ApiRequestInit,
): Promise<ClientResult<T>>;
export async function apiRequest(url: string, init: ApiRequestInit): Promise<ClientResult> {
  const { op, parse = "json", ...rest } = init;
  let result: ClientResult;
  try {
    const response = await fetch(url, rest);
    result = await classifyResponse(response, parse);
  } catch (error) {
    result = classifyThrown(error, rest.signal);
  }
  if (result.kind === "server") {
    reportClientError(
      buildReport({
        kind: "server",
        op,
        status: result.status,
        error: { name: "ServerError", message: `${rest.method ?? "GET"} ${url.split("?", 1)[0]}` },
        path: window.location.pathname,
      }),
    );
  }
  return result;
}

const allowReport = createReportGate();
const REPORT_URL = "/api/client-error";

// Fire and forget: deduped and capped per page load. Never through apiRequest, so a failing report
// cannot report itself.
export function reportClientError(report: ClientErrorReport): void {
  if (!allowReport(report)) return;
  const body = JSON.stringify(report);
  try {
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(REPORT_URL, body)) return;
  } catch {
    // sendBeacon can throw (e.g. blocked by policy); fall through to fetch.
  }
  void fetch(REPORT_URL, {
    method: "POST",
    body,
    keepalive: true,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
  }).catch(() => undefined);
}
