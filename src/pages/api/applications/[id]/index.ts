import type { APIRoute } from "astro";
import {
  deleteApplication,
  readApplicationForm,
  updateApplication,
  validateApplicationForm,
} from "@/lib/services/applications";
import { failureResponse, readFormData, routeId } from "@/lib/http";

export const prerender = false;

const OP = "application.update";

// Edit an application; every changed field is recorded in its change log.
export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }

  const id = routeId(context);
  if (id instanceof Response) return id;
  const form = await readFormData(context, { op: OP, entityId: id });
  if (form instanceof Response) return form;
  const result = validateApplicationForm(readApplicationForm(form));
  if (!result.ok) {
    return Response.json({ errors: result.errors }, { status: 400 });
  }
  const rawNote = form.get("rate_change_note");
  const rateChangeNote = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim().slice(0, 2000) : null;

  const supabase = context.locals.supabase;
  if (!supabase) {
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

const DELETE_OP = "application.delete";

// Delete a crossed-out (Rejected/Withdrawn) application permanently, with its notes and history.
export const DELETE: APIRoute = async (context) => {
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
    const result = await deleteApplication(supabase, id);
    if (!result.ok) {
      return Response.json({ error: result.message }, { status: result.code === "not_found" ? 404 : 409 });
    }
    return new Response(null, { status: 204 });
  } catch (e) {
    return failureResponse(
      context,
      e,
      { op: DELETE_OP, entityId: id },
      "Nie udało się usunąć aplikacji. Spróbuj ponownie.",
    );
  }
};
