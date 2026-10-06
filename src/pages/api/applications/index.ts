import type { APIRoute } from "astro";
import { createApplication, readApplicationForm, validateApplicationForm } from "@/lib/services/applications";
import { failureResponse, readFormData } from "@/lib/http";

export const prerender = false;

const OP = "application.create";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }

  const form = await readFormData(context, { op: OP });
  if (form instanceof Response) return form;
  const result = validateApplicationForm(readApplicationForm(form));
  if (!result.ok) {
    return Response.json({ errors: result.errors }, { status: 400 });
  }

  const supabase = context.locals.supabase;
  if (!supabase) {
    return Response.json({ error: "Supabase nie jest skonfigurowany." }, { status: 500 });
  }

  try {
    const { id } = await createApplication(supabase, result.data);
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    return failureResponse(context, e, { op: OP }, "Nie udało się zapisać aplikacji. Spróbuj ponownie.");
  }
};
