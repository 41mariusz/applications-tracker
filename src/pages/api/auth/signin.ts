import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { isProjectPaused } from "@/lib/supabase-paused";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase nie jest skonfigurowany.")}`);
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
    return context.redirect(`/auth/signin?error=${encodeURIComponent(message)}`);
  }

  return context.redirect("/dashboard");
};
