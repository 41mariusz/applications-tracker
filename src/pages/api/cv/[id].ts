import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { readCv } from "@/lib/services/cv";

export const prerender = false;

// Serves the CV itself (same origin, signed-in owner only): shown in the browser by default,
// or as a download with ?download=1. The bucket stays private.
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
    const cv = await readCv(supabase, id);
    if (!cv) return Response.json({ error: "Nie znaleziono pliku." }, { status: 404 });
    const disposition = context.url.searchParams.has("download") ? "attachment" : "inline";
    return new Response(cv.bytes, {
      status: 200,
      headers: {
        "Content-Type": cv.mimeType,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(cv.fileName)}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console -- server-side log for failed reads
    console.error("readCv failed", e);
    return Response.json({ error: "Nie udało się wczytać pliku." }, { status: 500 });
  }
};
