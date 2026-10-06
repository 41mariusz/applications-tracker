import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { classifyAuthError } from "@/lib/domain/auth-errors";
import { logError, logWarn } from "@/lib/log";
import { observeStream } from "@/lib/stream-observer";

const PROTECTED_ROUTES = ["/dashboard", "/applications", "/cv"];
// The issue-alert webhook touches no database, and alerts matter most while Supabase is paused.
const PAUSED_PASSTHROUGH = ["/paused", "/api/health", "/api/auth/signout", "/api/alerts/issue"];
const ERROR_PAGES = ["/500", "/404"];

// Central error hook: every server failure leaves one structured line (src/lib/log.ts).
// - a thrown error is logged and rethrown, so Astro renders 500.astro with it;
// - a 5xx response nobody logged gets a line with its status;
// - an HTML body that fails after the first byte is logged with step "stream".
// Error-page renders re-run this middleware with the same locals, so they are skipped. 4xx is not logged.
export const onRequest = defineMiddleware(async (context, next) => {
  const isErrorPage = ERROR_PAGES.includes(context.routePattern);
  let response: Response;
  try {
    response = await handleRequest(context, next);
  } catch (error) {
    if (!isErrorPage && !context.locals.errorLogged) logError(context, error, { status: 500 });
    throw error;
  }
  if (isErrorPage) return response;

  if (response.status >= 500 && !context.locals.errorLogged) logError(context, undefined, { status: response.status });

  if (response.body && response.headers.get("content-type")?.startsWith("text/html")) {
    const { status } = response;
    const body = observeStream(response.body, (error) => {
      logError(context, error, { status, step: "stream" });
    });
    return new Response(body, response);
  }
  return response;
});

// Logged once per isolate: every request would otherwise repeat the same configuration error.
let misconfigurationLogged = false;

function serviceUnavailable(error: string): Response {
  return Response.json({ error }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

// Auth, paused-project and protected-route handling.
// The middleware's Supabase client is shared with pages and routes through locals.supabase: a client
// built again from the request's Cookie header would refresh an already rotated token and sign the user out.
async function handleRequest(context: APIContext, next: MiddlewareNext): Promise<Response> {
  const isErrorPage = ERROR_PAGES.includes(context.routePattern);
  // An error page rendered for this same request re-runs the middleware with the same locals:
  // auth is already resolved (and any failure logged), so do not ask Supabase again.
  if (isErrorPage && "supabase" in context.locals) return next();

  const supabase = createClient(context.request.headers, context.cookies);
  context.locals.supabase = supabase;
  context.locals.user = null;
  const { pathname } = context.url;
  const isApi = pathname.startsWith("/api/");
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  // Health, sign-out and the alert webhook answer for themselves; error pages and assets must stay reachable.
  const isPassthrough = PAUSED_PASSTHROUGH.includes(pathname) || isErrorPage || pathname.startsWith("/_astro/");

  if (!supabase) {
    // SUPABASE_URL / SUPABASE_KEY missing: a deployment problem, not a sign-out.
    if (!misconfigurationLogged) {
      misconfigurationLogged = true;
      logError(context, new Error("SUPABASE_URL or SUPABASE_KEY is not set"), { op: "config" });
    }
    if (isApi && !isPassthrough) {
      context.locals.errorLogged = true;
      return serviceUnavailable("misconfigured");
    }
    if (isProtected) {
      context.locals.errorLogged = true;
      return context.redirect("/500");
    }
    return next();
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  context.locals.user = user ?? null;

  switch (classifyAuthError(error)) {
    case "paused":
      // A paused project is not a sign-out: explain it instead (the page and its assets stay reachable).
      // Health reports the pause in its own shape, and sign-out must still clear the cookies.
      if (!isPassthrough) {
        return isApi ? serviceUnavailable("database_paused") : context.redirect("/paused");
      }
      break;
    case "outage":
      // Auth unreachable or answering 5xx: the user may well be signed in, so do not send them to sign-in.
      logError(context, error, { op: "auth.getUser" });
      if (!isPassthrough) {
        if (isApi) return serviceUnavailable("auth_unavailable");
        if (isProtected) return context.redirect("/500");
      }
      break;
    case "rejected":
      // A bad, expired or rotated token: the user is signed out as usual, but leave a trace (no PII).
      logWarn(context, error, { op: "auth.getUser" });
      break;
    case "no-session":
    case "none":
      break;
  }

  // Signed-in users go straight to their list.
  if (pathname === "/" && context.locals.user) {
    return context.redirect("/dashboard");
  }

  if (isProtected && !context.locals.user) {
    // Remember where the user was going, so sign-in can return there (checked by safeNextPath).
    const nextPath = encodeURIComponent(pathname + context.url.search);
    return context.redirect(`/auth/signin?next=${nextPath}`);
  }

  return next();
}
