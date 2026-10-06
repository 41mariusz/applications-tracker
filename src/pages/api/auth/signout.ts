import type { APIRoute } from "astro";
import { parseCookieHeader } from "@supabase/ssr";
import { logError } from "@/lib/log";

export const POST: APIRoute = async (context) => {
  const supabase = context.locals.supabase;
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // signOut() keeps the session when it cannot read it or the revoke fails for another reason:
      // log it, then clear Supabase's (possibly chunked) session cookies ourselves.
      logError(context, error, { op: "auth.signOut" });
      for (const { name } of parseCookieHeader(context.request.headers.get("Cookie") ?? "")) {
        if (name.startsWith("sb-")) context.cookies.delete(name, { path: "/" });
      }
    }
  }
  return context.redirect("/");
};
