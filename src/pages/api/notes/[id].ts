import type { APIContext, APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noteInputSchema } from "@/lib/domain/notes";
import { editNote, removeNote, type NoteResult } from "@/lib/services/notes";
import { readNoteForm, validationErrors } from "@/lib/services/note-form";
import { failureResponse, readFormData } from "@/lib/http";

export const prerender = false;

async function run(
  context: APIContext,
  op: "note.edit" | "note.remove",
  action: (supabase: SupabaseClient, id: string) => Promise<NoteResult>,
) {
  const supabase = context.locals.supabase;
  const id = context.params.id;
  if (!supabase || !id) {
    return Response.json({ error: "Nie udało się zapisać zmiany." }, { status: 500 });
  }
  try {
    const result = await action(supabase, id);
    if (!result.ok) return Response.json({ error: result.message }, { status: 404 });
    return Response.json({ id: result.id }, { status: 200 });
  } catch (e) {
    return failureResponse(context, e, { op, entityId: id }, "Nie udało się zapisać zmiany. Spróbuj ponownie.");
  }
}

// Edit a note; the previous version is kept in its history.
export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }
  const form = await readFormData(context, { op: "note.edit", entityId: context.params.id });
  if (form instanceof Response) return form;
  const parsed = noteInputSchema.safeParse(readNoteForm(form));
  if (!parsed.success) {
    return Response.json({ errors: validationErrors(parsed.error) }, { status: 400 });
  }
  return run(context, "note.edit", (supabase, id) => editNote(supabase, id, parsed.data));
};

// "Remove" a note: it stays on the timeline, crossed out.
export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }
  return run(context, "note.remove", (supabase, id) => removeNote(supabase, id));
};
