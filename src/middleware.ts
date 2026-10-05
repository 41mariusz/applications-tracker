import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { isProjectPaused } from "@/lib/supabase-paused";

const PROTECTED_ROUTES = ["/dashboard", "/applications", "/cv"];
const PAUSED_PASSTHROUGH = ["/paused", "/api/health", "/api/auth/signout"];

export const onRequest = defineMiddleware(async (context, next) => {
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
});
