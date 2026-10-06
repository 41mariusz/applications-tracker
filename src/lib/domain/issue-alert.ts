// Cloudflare Notifications webhook (Workers Issues automation) → one short Polish Telegram message.
// Every payload field is optional: a test request or an unknown shape still produces a useful message.
// Plain text (no Telegram parse mode), so nothing needs escaping.
import { formatDateTime } from "@/lib/format";

// Telegram allows 4096 characters per message; stay well below it.
export const MAX_ALERT_LENGTH = 3500;
const MAX_FIELD_LENGTH = 300;

function field(payload: Record<string, unknown>, key: string, max = MAX_FIELD_LENGTH): string | undefined {
  const value = payload[key];
  let text: string | undefined;
  if (typeof value === "string") text = value.trim();
  else if (typeof value === "number" || typeof value === "boolean") text = String(value);
  else if (value !== null && typeof value === "object") text = JSON.stringify(value);
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// `ts` is a Unix timestamp in seconds in Cloudflare's payloads; accept milliseconds and ISO strings too.
function alertTime(ts: unknown): string | undefined {
  let date: Date | undefined;
  if (typeof ts === "number" && Number.isFinite(ts)) date = new Date(ts < 1e12 ? ts * 1000 : ts);
  else if (typeof ts === "string" && ts.trim() !== "") {
    date = /^\d+$/.test(ts.trim()) ? new Date(Number(ts) * 1000) : new Date(ts);
  }
  if (!date || Number.isNaN(date.getTime())) return undefined;
  return formatDateTime(date.toISOString());
}

export function formatIssueAlert(payload: unknown, appUrl: string): string {
  const data = payload !== null && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const title = field(data, "name") ?? field(data, "policy_name");
  const policy = field(data, "policy_name");

  const lines = [title ? `Błąd w aplikacji: ${title}` : "Błąd w aplikacji"];
  if (policy && policy !== title) lines.push(`Reguła: ${policy}`);
  const text = field(data, "text", MAX_ALERT_LENGTH);
  lines.push(text ?? "Cloudflare zgłosił nowy problem (brak opisu). Sprawdź Workers → Issues.");
  const type = field(data, "alert_type");
  if (type) lines.push(`Typ: ${type}`);
  const event = field(data, "alert_event");
  if (event) lines.push(`Zdarzenie: ${event}`);
  const time = alertTime(data.ts);
  if (time) lines.push(`Czas: ${time}`);
  lines.push(`Aplikacja: ${appUrl}`);

  const message = lines.join("\n");
  return message.length > MAX_ALERT_LENGTH ? `${message.slice(0, MAX_ALERT_LENGTH - 1)}…` : message;
}

// Constant-time comparison of the `cf-webhook-auth` header with the configured secret: the loop runs over the
// whole expected value whatever the input, so the response time does not reveal how many characters matched.
export function secretMatches(received: string | null, expected: string): boolean {
  if (!received || !expected) return false;
  const encoder = new TextEncoder();
  const a = encoder.encode(received);
  const b = encoder.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) {
    diff |= a[i % a.length] ^ b[i];
  }
  return diff === 0;
}
