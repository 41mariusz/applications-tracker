import type { APIRoute } from "astro";
import { noteInputSchema } from "@/lib/domain/notes";
import { addNote } from "@/lib/services/notes";
import { readNoteForm, validationErrors } from "@/lib/services/note-form";
import { failureResponse, readFormData } from "@/lib/http";

export const prerender = false;

const OP = "note.add";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }
  const id = context.params.id;
  const form = await readFormData(context, { op: OP, entityId: id });
  if (form instanceof Response) return form;
  const parsed = noteInputSchema.safeParse(readNoteForm(form));
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
    return failureResponse(context, e, { op: OP, entityId: id }, "Nie udało się zapisać notatki. Spróbuj ponownie.");
  }
};
