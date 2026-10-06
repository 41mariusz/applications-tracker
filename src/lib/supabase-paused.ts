// A paused Supabase free-tier project answers every request with HTTP 540 and a non-JSON body.
// supabase-js loses that status for Auth calls (the body fails to parse and becomes an
// AuthUnknownError without a status), so the client's fetch rewrites a 540 into a JSON error that
// both Auth and PostgREST surface with a recognisable status and code.

export const PROJECT_PAUSED_STATUS = 540;
export const PROJECT_PAUSED_CODE = "project_paused";

type Fetch = typeof fetch;

export function withPauseDetection(baseFetch: Fetch = fetch): Fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init);
    if (response.status !== PROJECT_PAUSED_STATUS) return response;
    // Release the original (HTML) body; the replacement below carries the error.
    await response.body?.cancel();
    // Auth reads `error_code`, PostgREST passes the parsed body through as the error object.
    const body = { code: PROJECT_PAUSED_CODE, error_code: PROJECT_PAUSED_CODE, message: "Supabase project is paused" };
    return new Response(JSON.stringify(body), {
      status: PROJECT_PAUSED_STATUS,
      headers: { "Content-Type": "application/json" },
    });
  };
}

// True when a Supabase error (Auth or PostgREST) or a `{ status }`-bearing response comes from a
// paused project; every other failure (bad credentials, network, other 5xx) is false.
// A service error (src/lib/services/errors.ts) carries the Supabase error in `cause`, so the chain is followed.
const MAX_CAUSE_DEPTH = 3;

export function isProjectPaused(errorOrResponse: unknown): boolean {
  return pausedAt(errorOrResponse, 0);
}

function pausedAt(value: unknown, depth: number): boolean {
  if (!value || typeof value !== "object") return false;
  const { status, code, cause } = value as { status?: unknown; code?: unknown; cause?: unknown };
  if (status === PROJECT_PAUSED_STATUS || code === PROJECT_PAUSED_CODE) return true;
  return depth < MAX_CAUSE_DEPTH && pausedAt(cause, depth + 1);
}
