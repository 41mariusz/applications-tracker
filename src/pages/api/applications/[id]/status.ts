import type { APIRoute } from "astro";
import { changeApplicationStatus, changeStatusSchema } from "@/lib/services/applications";
import { failureResponse, readFormData, routeId } from "@/lib/http";

export const prerender = false;

const OP = "application.status";
const HTTP_STATUS = { not_found: 404, not_allowed: 400, needs_confirmation: 409, conflict: 409 } as const;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }

  const id = routeId(context);
  if (id instanceof Response) return id;
  const form = await readFormData(context, { op: OP, entityId: id });
  if (form instanceof Response) return form;
  const parsed = changeStatusSchema.safeParse({
    status: form.get("status") ?? undefined,
    confirm: form.get("confirm") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "Nieprawidłowy status." }, { status: 400 });
  }

  const supabase = context.locals.supabase;
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
    return failureResponse(context, e, { op: OP, entityId: id }, "Nie udało się zmienić statusu. Spróbuj ponownie.");
  }
};
