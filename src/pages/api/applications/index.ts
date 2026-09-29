import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createApplication, readApplicationForm, validateApplicationForm } from "@/lib/services/applications";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }

  const result = validateApplicationForm(readApplicationForm(await context.request.formData()));
  if (!result.ok) {
    return Response.json({ errors: result.errors }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase nie jest skonfigurowany." }, { status: 500 });
  }

  try {
    const { id } = await createApplication(supabase, result.data);
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    // eslint-disable-next-line no-console -- server-side log for failed writes
    console.error("createApplication failed", e);
    return Response.json({ error: "Nie udało się zapisać aplikacji. Spróbuj ponownie." }, { status: 500 });
  }
};
