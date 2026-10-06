import type { APIContext, APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noteInputSchema } from "@/lib/domain/notes";
import { editNote, removeNote, type NoteResult } from "@/lib/services/notes";
import { readNoteForm, validationErrors } from "@/lib/services/note-form";

export const prerender = false;

async function run(context: APIContext, action: (supabase: SupabaseClient, id: string) => Promise<NoteResult>) {
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
    // eslint-disable-next-line no-console -- server-side log for failed writes
    console.error("note update failed", e);
    return Response.json({ error: "Nie udało się zapisać zmiany. Spróbuj ponownie." }, { status: 500 });
  }
}

// Edit a note; the previous version is kept in its history.
export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }
  const parsed = noteInputSchema.safeParse(readNoteForm(await context.request.formData()));
  if (!parsed.success) {
    return Response.json({ errors: validationErrors(parsed.error) }, { status: 400 });
  }
  return run(context, (supabase, id) => editNote(supabase, id, parsed.data));
};

// "Remove" a note: it stays on the timeline, crossed out.
export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }
  return run(context, (supabase, id) => removeNote(supabase, id));
};
