import type { APIRoute } from "astro";
import { uploadCv } from "@/lib/services/cv";
import { CV_TOO_LARGE_MESSAGE, isUploadRequestTooLarge } from "@/lib/domain/cv";
import { failureResponse, readFormData } from "@/lib/http";
import { logInfo } from "@/lib/log";
import type { UploadCvResponse } from "@/types";

export const prerender = false;

const OP = "cv.upload";

// Upload a CV to the library. The same file uploaded again is not stored twice.
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  }
  const contentLength = context.request.headers.get("content-length");
  // Refuse an oversized body before parsing it: no CPU is spent on a file that would be rejected anyway.
  if (isUploadRequestTooLarge(contentLength)) {
    return Response.json({ error: CV_TOO_LARGE_MESSAGE }, { status: 413 });
  }
  // The size goes on record before parsing and hashing: if the Worker is killed over its CPU limit,
  // this breadcrumb is the only line of ours left for that request.
  const size = Number(contentLength);
  const bytes = contentLength !== null && Number.isFinite(size) ? size : undefined;
  logInfo(context, { op: OP, step: "received", bytes });

  const form = await readFormData(context, { op: OP, bytes });
  if (form instanceof Response) return form;
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Wybierz plik." }, { status: 400 });
  }

  const supabase = context.locals.supabase;
  if (!supabase) {
    return Response.json({ error: "Supabase nie jest skonfigurowany." }, { status: 500 });
  }

  try {
    const result = await uploadCv(supabase, user.id, file);
    if (!result.ok) return Response.json({ error: result.message }, { status: 400 });
    return Response.json({ file: result.file, reused: result.reused } satisfies UploadCvResponse, {
      status: result.reused ? 200 : 201,
    });
  } catch (e) {
    return failureResponse(context, e, { op: OP, bytes: file.size }, "Nie udało się wgrać pliku. Spróbuj ponownie.");
  }
};
