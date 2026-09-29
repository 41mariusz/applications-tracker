import type { SupabaseClient } from "@supabase/supabase-js";
import { isNoteChanged, sortNotes, type NoteInput } from "@/lib/domain/notes";
import type { Application, FieldChangeRow, Note, NoteRevision, StatusChange } from "@/types";

export type NoteResult = { ok: true; id: string } | { ok: false; code: "not_found"; message: string };

const NOT_FOUND = { ok: false, code: "not_found", message: "Nie znaleziono." } as const;

// Adding a note is activity on the application: it moves up within its stage on the list.
// The note and the activity bump are saved in one transaction.
export async function addNote(supabase: SupabaseClient, applicationId: string, input: NoteInput): Promise<NoteResult> {
  const { data: application, error: readError } = await supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .maybeSingle<{ id: string }>();
  if (readError) throw readError;
  if (!application) return NOT_FOUND;

  const result = await supabase.rpc("add_note", {
    p_application_id: applicationId,
    p_kind: input.kind,
    p_body: input.body,
    p_noted_at: input.noted_at,
  });
  if (result.error) throw result.error;
  const id: unknown = result.data;
  if (typeof id !== "string") throw new Error("add_note returned no id");
  return { ok: true, id };
}

async function readNote(supabase: SupabaseClient, noteId: string) {
  const { data, error } = await supabase
    .from("notes")
    .select("id, application_id, kind, body, noted_at, deleted_at")
    .eq("id", noteId)
    .maybeSingle<Pick<Note, "id" | "application_id" | "kind" | "body" | "noted_at" | "deleted_at">>();
  if (error) throw error;
  return data;
}

// Edits keep the previous version in note_revisions, so nothing agreed is lost.
export async function editNote(supabase: SupabaseClient, noteId: string, input: NoteInput): Promise<NoteResult> {
  const current = await readNote(supabase, noteId);
  if (!current || current.deleted_at) return NOT_FOUND;
  if (!isNoteChanged(current, input)) return { ok: true, id: noteId };

  // One transaction: the previous version is stored in note_revisions before the note changes.
  const { data: edited, error } = await supabase
    .rpc("edit_note", {
      p_note_id: noteId,
      p_kind: input.kind,
      p_body: input.body,
      p_noted_at: input.noted_at,
    })
    .overrideTypes<boolean, { merge: false }>();
  if (error) throw error;
  return edited === true ? { ok: true, id: noteId } : NOT_FOUND;
}

// "Removing" marks the note; it stays on the timeline, crossed out.
export async function removeNote(supabase: SupabaseClient, noteId: string): Promise<NoteResult> {
  const current = await readNote(supabase, noteId);
  if (!current) return NOT_FOUND;
  if (current.deleted_at) return { ok: true, id: noteId };

  const now = new Date().toISOString();
  const { error } = await supabase.from("notes").update({ deleted_at: now, updated_at: now }).eq("id", noteId);
  if (error) throw error;
  return { ok: true, id: noteId };
}

export interface ApplicationDetails {
  application: Application;
  notes: Note[];
  statusChanges: StatusChange[];
  fieldChanges: FieldChangeRow[];
}

export async function getApplicationDetails(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<ApplicationDetails | null> {
  const { data: application, error } = await supabase
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle<Application>();
  if (error) throw error;
  if (!application) return null;

  const [notesResult, changesResult, fieldsResult] = await Promise.all([
    supabase
      .from("notes")
      .select("*, revisions:note_revisions(*)")
      .eq("application_id", applicationId)
      .overrideTypes<(Omit<Note, "revisions"> & { revisions: NoteRevision[] })[], { merge: false }>(),
    supabase
      .from("status_changes")
      .select("id, from_status, to_status, is_revert, changed_at")
      .eq("application_id", applicationId)
      .order("changed_at", { ascending: false })
      .overrideTypes<StatusChange[], { merge: false }>(),
    supabase
      .from("field_changes")
      .select("id, field, old_value, new_value, changed_at")
      .eq("application_id", applicationId)
      .order("changed_at", { ascending: false })
      .overrideTypes<FieldChangeRow[], { merge: false }>(),
  ]);
  if (notesResult.error) throw notesResult.error;
  if (changesResult.error) throw changesResult.error;
  if (fieldsResult.error) throw fieldsResult.error;

  const notes = sortNotes(notesResult.data).map((note) => ({
    ...note,
    revisions: [...note.revisions].sort((a, b) => Date.parse(b.changed_at) - Date.parse(a.changed_at)),
  }));
  return { application, notes, statusChanges: changesResult.data, fieldChanges: fieldsResult.data };
}
