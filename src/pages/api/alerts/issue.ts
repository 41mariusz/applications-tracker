import type { APIRoute } from "astro";
import { ISSUES_WEBHOOK_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "astro:env/server";
import { formatIssueAlert, secretMatches } from "@/lib/domain/issue-alert";

export const prerender = false;

const MAX_BODY_BYTES = 16 * 1024;
const TELEGRAM_TIMEOUT_MS = 5000;

// No alert loop: Workers Issues records every 5xx and every error-level log, and a new issue calls this
// endpoint again. So it never answers 5xx and logs delivery problems with console.warn only. A wrong or
// missing secret is a 4xx, which Issues does not record. The token, chat id and secret are never logged.
function notDelivered(reason: string): Response {
  // eslint-disable-next-line no-console -- warn, never error: an error-level line would raise a new issue
  console.warn(JSON.stringify({ level: "warn", op: "issueAlert", delivered: false, reason }));
  return Response.json({ delivered: false, reason });
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<string | null> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
    return response.ok ? null : `telegram_http_${response.status}`;
  } catch (e) {
    // Only the error's name: a message could echo the request URL, which carries the token.
    return e instanceof Error && e.name === "TimeoutError" ? "telegram_timeout" : "telegram_unreachable";
  }
}

// Called by Cloudflare Notifications (Workers Issues automation, generic webhook), not by a signed-in user.
export const POST: APIRoute = async (context) => {
  const contentLength = context.request.headers.get("content-length");
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_BODY_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  if (!secretMatches(context.request.headers.get("cf-webhook-auth"), ISSUES_WEBHOOK_SECRET ?? "")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const raw = await context.request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return Response.json({ error: "payload_too_large" }, { status: 413 });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return notDelivered("telegram_not_configured");

    const failure = await sendTelegram(
      TELEGRAM_BOT_TOKEN,
      TELEGRAM_CHAT_ID,
      formatIssueAlert(payload, context.url.origin),
    );
    if (failure) return notDelivered(failure);
    return Response.json({ delivered: true });
  } catch {
    // Anything unexpected (e.g. a body read failure) still must not become a 5xx.
    return notDelivered("unexpected");
  }
};
