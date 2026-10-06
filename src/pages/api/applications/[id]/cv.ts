import type { APIRoute } from "astro";
import { z } from "zod";
import { setApplicationCv } from "@/lib/services/cv";

export const prerender = false;

// Empty value detaches the CV.
const schema = z.object({ cv_file_id: z.union([z.uuid(), z.literal("").transform(() => null)]) });

// Attach a CV from the library to an application; the change goes to its history.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }
  const parsed = schema.safeParse({ cv_file_id: (await context.request.formData()).get("cv_file_id") ?? "" });
  const id = context.params.id;
  if (!parsed.success || !id) {
    return Response.json({ error: "Nieprawidłowy plik." }, { status: 400 });
  }

  const supabase = context.locals.supabase;
  if (!supabase) {
    return Response.json({ error: "Supabase nie jest skonfigurowany." }, { status: 500 });
  }
  try {
    const ok = await setApplicationCv(supabase, id, parsed.data.cv_file_id);
    if (!ok) return Response.json({ error: "Nie znaleziono aplikacji lub pliku." }, { status: 404 });
    return Response.json({ id, cv_file_id: parsed.data.cv_file_id }, { status: 200 });
  } catch (e) {
    // eslint-disable-next-line no-console -- server-side log for failed writes
    console.error("setApplicationCv failed", e);
    return Response.json({ error: "Nie udało się podpiąć CV. Spróbuj ponownie." }, { status: 500 });
  }
};
