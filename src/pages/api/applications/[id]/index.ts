import type { APIRoute } from "astro";
import { readApplicationForm, updateApplication, validateApplicationForm } from "@/lib/services/applications";
import { failureResponse, readFormData } from "@/lib/http";

export const prerender = false;

const OP = "application.update";

// Edit an application; every changed field is recorded in its change log.
export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }

  const id = context.params.id;
  const form = await readFormData(context, { op: OP, entityId: id });
  if (form instanceof Response) return form;
  const result = validateApplicationForm(readApplicationForm(form));
  if (!result.ok) {
    return Response.json({ errors: result.errors }, { status: 400 });
  }
  const rawNote = form.get("rate_change_note");
  const rateChangeNote = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim().slice(0, 2000) : null;

  const supabase = context.locals.supabase;
  if (!supabase || !id) {
    return Response.json({ error: "Supabase nie jest skonfigurowany." }, { status: 500 });
  }

  try {
    const updated = await updateApplication(supabase, id, result.data, rateChangeNote);
    if (!updated.ok) {
      return Response.json({ error: updated.message }, { status: updated.code === "conflict" ? 409 : 404 });
    }
    return Response.json({ id, changed: updated.changed }, { status: 200 });
  } catch (e) {
    return failureResponse(context, e, { op: OP, entityId: id }, "Nie udało się zapisać zmian. Spróbuj ponownie.");
  }
};
