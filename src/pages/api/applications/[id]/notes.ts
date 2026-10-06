import type { APIRoute } from "astro";
import { noteInputSchema } from "@/lib/domain/notes";
import { addNote } from "@/lib/services/notes";
import { readNoteForm, validationErrors } from "@/lib/services/note-form";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }
  const parsed = noteInputSchema.safeParse(readNoteForm(await context.request.formData()));
  const id = context.params.id;
  if (!parsed.success || !id) {
    return Response.json({ errors: parsed.success ? {} : validationErrors(parsed.error) }, { status: 400 });
  }

  const supabase = context.locals.supabase;
  if (!supabase) {
    return Response.json({ error: "Supabase nie jest skonfigurowany." }, { status: 500 });
  }

  try {
    const result = await addNote(supabase, id, parsed.data);
    if (!result.ok) return Response.json({ error: result.message }, { status: 404 });
    return Response.json({ id: result.id }, { status: 201 });
  } catch (e) {
    // eslint-disable-next-line no-console -- server-side log for failed writes
    console.error("addNote failed", e);
    return Response.json({ error: "Nie udało się zapisać notatki. Spróbuj ponownie." }, { status: 500 });
  }
};
