import type { APIRoute } from "astro";
import { readCv } from "@/lib/services/cv";
import { failureResponse, routeId } from "@/lib/http";

export const prerender = false;

// Serves the CV itself (same origin, signed-in owner only): shown in the browser by default,
// or as a download with ?download=1. The bucket stays private.
export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }
  const id = routeId(context);
  if (id instanceof Response) return id;
  const supabase = context.locals.supabase;
  if (!supabase) {
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
    return failureResponse(context, e, { op: "cv.read", entityId: id }, "Nie udało się wczytać pliku.");
  }
};
