import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { cvDownloadUrl } from "@/lib/services/cv";

export const prerender = false;

// Download: redirect to a link valid for 60 seconds (the bucket is private).
export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }
  const supabase = createClient(context.request.headers, context.cookies);
  const id = context.params.id;
  if (!supabase || !id) {
    return Response.json({ error: "Supabase nie jest skonfigurowany." }, { status: 500 });
  }
  try {
    const url = await cvDownloadUrl(supabase, id);
    if (!url) return Response.json({ error: "Nie znaleziono pliku." }, { status: 404 });
    return context.redirect(url, 302);
  } catch (e) {
    // eslint-disable-next-line no-console -- server-side log for failed reads
    console.error("cvDownloadUrl failed", e);
    return Response.json({ error: "Nie udało się pobrać pliku." }, { status: 500 });
  }
};
