// OpenRouter pre-flight: decides from the account balance and the key's credit limit whether a
// review can call the model at all. The key goes only into the Authorization header; no verdict,
// message or reason ever contains it (or any header).
//   GET /credits -> { data: { total_credits, total_usage } }
//   GET /key     -> { data: { limit_remaining (null = no limit), ... } }
// A check that cannot be completed is "unknown": a warning, not a failure (the run continues).
import { z } from "zod";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const TOP_UP_URL = "https://openrouter.ai/settings/credits";

export type CreditsVerdict =
  | { kind: "ok"; remaining: number; keyLimitRemaining: number | null }
  | { kind: "insufficient"; message: string }
  | { kind: "skipped"; reason: string }
  | { kind: "unknown"; message: string };

export interface CreditsSnapshot {
  totalCredits: number;
  totalUsage: number;
  keyLimitRemaining: number | null;
}

export interface CheckCreditsOptions {
  apiKey: string;
  model: string;
  /** Check even a free model (its calls cost nothing, so it is skipped by default). */
  requireCredits?: boolean;
  /** Injected in tests; the global fetch otherwise. */
  fetchFn?: typeof fetch;
  baseUrl?: string;
}

const CREDITS_RESPONSE_SCHEMA = z.object({
  data: z.object({ total_credits: z.number(), total_usage: z.number() }),
});

const KEY_RESPONSE_SCHEMA = z.object({
  data: z.object({ limit_remaining: z.number().nullable() }),
});

export function isFreeModel(model: string): boolean {
  return model.endsWith(":free");
}

export function assessCredits(snapshot: CreditsSnapshot): CreditsVerdict {
  const remaining = snapshot.totalCredits - snapshot.totalUsage;
  if (remaining <= 0) {
    return {
      kind: "insufficient",
      message: `the OpenRouter account balance is exhausted (${remaining.toFixed(2)} credits left); top up at ${TOP_UP_URL}`,
    };
  }
  if (snapshot.keyLimitRemaining !== null && snapshot.keyLimitRemaining <= 0) {
    return {
      kind: "insufficient",
      message: `the API key's credit limit is exhausted (${snapshot.keyLimitRemaining.toFixed(2)} left of the key limit, account balance ${remaining.toFixed(2)}); raise the key's limit in OpenRouter`,
    };
  }
  return { kind: "ok", remaining, keyLimitRemaining: snapshot.keyLimitRemaining };
}

type Fetched<T> = { ok: true; value: T } | { ok: false; message: string };

async function getJson<T>(
  fetchFn: typeof fetch,
  baseUrl: string,
  path: string,
  apiKey: string,
  schema: z.ZodType<T>,
): Promise<Fetched<T>> {
  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  } catch (error) {
    // Only the error's name: a message could echo the request.
    const name = error instanceof Error ? error.name : typeof error;
    return { ok: false, message: `GET ${path} failed: ${name}` };
  }
  if (!response.ok) return { ok: false, message: `GET ${path} failed: HTTP ${response.status}` };

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    return { ok: false, message: `GET ${path} returned an unreadable body (HTTP ${response.status}, ${name})` };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, message: `GET ${path} returned an unexpected body (HTTP ${response.status})` };
  }
  return { ok: true, value: parsed.data };
}

export async function checkCredits(options: CheckCreditsOptions): Promise<CreditsVerdict> {
  const { apiKey, model, requireCredits = false, fetchFn = fetch, baseUrl = OPENROUTER_BASE_URL } = options;
  if (isFreeModel(model) && !requireCredits) {
    return { kind: "skipped", reason: `free model ${model}, no credits needed` };
  }

  const credits = await getJson(fetchFn, baseUrl, "/credits", apiKey, CREDITS_RESPONSE_SCHEMA);
  if (!credits.ok) return { kind: "unknown", message: credits.message };
  const key = await getJson(fetchFn, baseUrl, "/key", apiKey, KEY_RESPONSE_SCHEMA);
  if (!key.ok) return { kind: "unknown", message: key.message };

  return assessCredits({
    totalCredits: credits.value.data.total_credits,
    totalUsage: credits.value.data.total_usage,
    keyLimitRemaining: key.value.data.limit_remaining,
  });
}

export function formatVerdict(verdict: CreditsVerdict): string {
  const prefix = "OpenRouter pre-flight:";
  switch (verdict.kind) {
    case "ok": {
      const limit =
        verdict.keyLimitRemaining === null ? "" : `, key limit remaining ${verdict.keyLimitRemaining.toFixed(2)}`;
      return `${prefix} ok, balance ${verdict.remaining.toFixed(2)} credits${limit}`;
    }
    case "insufficient":
      return `${prefix} insufficient credits: ${verdict.message}`;
    case "skipped":
      return `${prefix} skipped (${verdict.reason})`;
    case "unknown":
      return `${prefix} warning: credits could not be checked (${verdict.message}); continuing the run`;
  }
}
