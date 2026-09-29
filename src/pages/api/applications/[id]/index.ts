import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { readApplicationForm, updateApplication, validateApplicationForm } from "@/lib/services/applications";

export const prerender = false;

// Edit an application; every changed field is recorded in its change log.
export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }

  const form = await context.request.formData();
  const result = validateApplicationForm(readApplicationForm(form));
  if (!result.ok) {
    return Response.json({ errors: result.errors }, { status: 400 });
  }
  const rawNote = form.get("rate_change_note");
  const rateChangeNote = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim().slice(0, 2000) : null;

  const supabase = createClient(context.request.headers, context.cookies);
  const id = context.params.id;
  if (!supabase || !id) {
    return Response.json({ error: "Supabase nie jest skonfigurowany." }, { status: 500 });
  }

  try {
    const updated = await updateApplication(supabase, id, result.data, rateChangeNote);
    if (!updated.ok) return Response.json({ error: updated.message }, { status: 404 });
    return Response.json({ id, changed: updated.changed }, { status: 200 });
  } catch (e) {
    // eslint-disable-next-line no-console -- server-side log for failed writes
    console.error("updateApplication failed", e);
    return Response.json({ error: "Nie udało się zapisać zmian. Spróbuj ponownie." }, { status: 500 });
  }
};
