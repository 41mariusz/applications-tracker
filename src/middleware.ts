import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { isProjectPaused } from "@/lib/supabase-paused";
import { logError } from "@/lib/log";
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

// Auth, paused-project and protected-route handling.
async function handleRequest(context: APIContext, next: MiddlewareNext): Promise<Response> {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    // A paused project is not a sign-out: explain it instead (the page and its assets stay reachable).
    // Health reports the pause in its own shape, and sign-out must still clear the cookies.
    const { pathname } = context.url;
    if (isProjectPaused(error) && !PAUSED_PASSTHROUGH.includes(pathname) && !pathname.startsWith("/_astro/")) {
      if (pathname.startsWith("/api/")) {
        return Response.json({ error: "database_paused" }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
      return context.redirect("/paused");
    }
  } else {
    context.locals.user = null;
  }

  // Signed-in users go straight to their list.
  if (context.url.pathname === "/" && context.locals.user) {
    return context.redirect("/dashboard");
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      // Remember where the user was going, so sign-in can return there (checked by safeNextPath).
      const next = encodeURIComponent(context.url.pathname + context.url.search);
      return context.redirect(`/auth/signin?next=${next}`);
    }
  }

  return next();
}
