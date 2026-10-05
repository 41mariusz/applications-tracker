import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { isProjectPaused } from "@/lib/supabase-paused";
import { safeNextPath } from "@/lib/domain/redirect";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;
  const nextValue = form.get("next");
  const requestedNext = typeof nextValue === "string" && nextValue !== "" ? nextValue : null;
  // Back to the form with the error; a requested return path survives the retry.
  const backToForm = (message: string) =>
    context.redirect(
      `/auth/signin?error=${encodeURIComponent(message)}` +
        (requestedNext ? `&next=${encodeURIComponent(safeNextPath(requestedNext))}` : ""),
    );

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToForm("Supabase nie jest skonfigurowany.");
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (isProjectPaused(error)) {
    return context.redirect("/paused");
  }

  if (error) {
    // Supabase messages are English and too specific; one message avoids revealing which part was wrong.
    const message =
      error.code === "invalid_credentials" || error.status === 400
        ? "Nieprawidłowy e-mail lub hasło."
        : "Nie udało się zalogować. Spróbuj ponownie.";
    return backToForm(message);
  }

  return context.redirect(safeNextPath(requestedNext));
};
