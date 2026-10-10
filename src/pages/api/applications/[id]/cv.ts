import type { APIRoute } from "astro";
import { z } from "zod";
import { setApplicationCv } from "@/lib/services/cv";
import { failureResponse, readFormData, routeId } from "@/lib/http";

export const prerender = false;

const OP = "application.cv";

// Empty value detaches the CV.
const schema = z.object({ cv_file_id: z.union([z.uuid(), z.literal("").transform(() => null)]) });

// Attach a CV from the library to an application; the change goes to its history.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }
  const id = routeId(context);
  if (id instanceof Response) return id;
  const form = await readFormData(context, { op: OP, entityId: id });
  if (form instanceof Response) return form;
  const parsed = schema.safeParse({ cv_file_id: form.get("cv_file_id") ?? "" });
  if (!parsed.success) {
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
    return failureResponse(context, e, { op: OP, entityId: id }, "Nie udało się podpiąć CV. Spróbuj ponownie.");
  }
};
