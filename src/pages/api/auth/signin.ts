import type { APIRoute } from "astro";
import { z } from "zod";
import { isProjectPaused } from "@/lib/supabase-paused";
import { isInvalidCredentials } from "@/lib/domain/auth-errors";
import { safeNextPath } from "@/lib/domain/redirect";
import { logError } from "@/lib/log";

const GENERIC_MESSAGE = "Nie udało się zalogować. Spróbuj ponownie.";
// Supabase messages are English and too specific; one message avoids revealing which part was wrong.
const INVALID_CREDENTIALS_MESSAGE = "Nieprawidłowy e-mail lub hasło.";

const signInSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  next: z.string().optional(),
});

export const POST: APIRoute = async (context) => {
  let requestedNext: string | null = null;
  // Back to the form with the error; a requested return path survives the retry.
  const backToForm = (message: string) =>
    context.redirect(
      `/auth/signin?error=${encodeURIComponent(message)}` +
        (requestedNext ? `&next=${encodeURIComponent(safeNextPath(requestedNext))}` : ""),
    );

  let email: string;
  let password: string;
  try {
    const form = await context.request.formData();
    const nextValue = form.get("next");
    requestedNext = typeof nextValue === "string" && nextValue !== "" ? nextValue : null;
    const parsed = signInSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return backToForm(GENERIC_MESSAGE);
    ({ email, password } = parsed.data);
  } catch (error) {
    // A body that is not a form. Never log the submitted values.
    logError(context, error, { op: "auth.signIn", step: "parse" });
    return backToForm(GENERIC_MESSAGE);
  }

  // Missing configuration is answered with 503 by the middleware before this route runs.
  const supabase = context.locals.supabase;
  if (!supabase) {
    return backToForm(GENERIC_MESSAGE);
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (isProjectPaused(error)) {
    return context.redirect("/paused");
  }

  if (error) {
    if (isInvalidCredentials(error)) return backToForm(INVALID_CREDENTIALS_MESSAGE);
    // Anything else (outage, rate limit, unconfirmed account) is ours to see; the error carries no e-mail.
    logError(context, error, { op: "auth.signIn" });
    return backToForm(GENERIC_MESSAGE);
  }

  return context.redirect(safeNextPath(requestedNext));
};
