import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { changeApplicationStatus, changeStatusSchema } from "@/lib/services/applications";

export const prerender = false;

const HTTP_STATUS = { not_found: 404, not_allowed: 400, needs_confirmation: 409, conflict: 409 } as const;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }

  const form = await context.request.formData();
  const parsed = changeStatusSchema.safeParse({
    status: form.get("status") ?? undefined,
    confirm: form.get("confirm") ?? undefined,
  });
  const id = context.params.id;
  if (!parsed.success || !id) {
    return Response.json({ error: "Nieprawidłowy status." }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase nie jest skonfigurowany." }, { status: 500 });
  }

  try {
    const result = await changeApplicationStatus(supabase, id, parsed.data.status, parsed.data.confirm === "true");
    if (!result.ok) {
      return Response.json(
        { error: result.message, requiresConfirmation: result.code === "needs_confirmation" },
        { status: HTTP_STATUS[result.code] },
      );
    }
    return Response.json({ status: result.status }, { status: 200 });
  } catch (e) {
    // eslint-disable-next-line no-console -- server-side log for failed writes
    console.error("changeApplicationStatus failed", e);
    return Response.json({ error: "Nie udało się zmienić statusu. Spróbuj ponownie." }, { status: 500 });
  }
};
