import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { uploadCv } from "@/lib/services/cv";
import { CV_TOO_LARGE_MESSAGE, isUploadRequestTooLarge } from "@/lib/domain/cv";

export const prerender = false;

// Upload a CV to the library. The same file uploaded again is not stored twice.
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }
  // Refuse an oversized body before parsing it: no CPU is spent on a file that would be rejected anyway.
  if (isUploadRequestTooLarge(context.request.headers.get("content-length"))) {
    return Response.json({ error: CV_TOO_LARGE_MESSAGE }, { status: 413 });
  }
  const file = (await context.request.formData()).get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Wybierz plik." }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase nie jest skonfigurowany." }, { status: 500 });
  }

  try {
    const result = await uploadCv(supabase, user.id, file);
    if (!result.ok) return Response.json({ error: result.message }, { status: 400 });
    return Response.json({ file: result.file, reused: result.reused }, { status: result.reused ? 200 : 201 });
  } catch (e) {
    // eslint-disable-next-line no-console -- server-side log for failed writes
    console.error("uploadCv failed", e);
    return Response.json({ error: "Nie udało się wgrać pliku. Spróbuj ponownie." }, { status: 500 });
  }
};
