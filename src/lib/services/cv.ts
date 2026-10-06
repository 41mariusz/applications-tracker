import type { SupabaseClient } from "@supabase/supabase-js";
import { checkCvFile, cvStoragePath, sha256Hex } from "@/lib/domain/cv";
import { toServiceError } from "@/lib/services/errors";
import type { CvFile } from "@/types";

const BUCKET = "cvs";
const CV_COLUMNS = "id, file_name, mime_type, size_bytes, created_at";

export type UploadCvResult =
  { ok: true; file: CvFile; reused: boolean } | { ok: false; code: "invalid"; message: string };

// Deduplicated upload: the file is identified by the SHA-256 of its bytes. If the user already
// has it (under any name), the existing library entry is returned and nothing is stored again.
export async function uploadCv(supabase: SupabaseClient, userId: string, file: File): Promise<UploadCvResult> {
  const check = checkCvFile(file);
  if (!check.ok) return { ok: false, code: "invalid", message: check.message };

  const bytes = await file.arrayBuffer();
  const sha256 = await sha256Hex(bytes);

  const existing = await findBySha(supabase, sha256);
  if (existing) return { ok: true, file: existing, reused: true };

  const path = cvStoragePath(userId, sha256, check.extension);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: check.mimeType, upsert: false });
  // "Duplicate" means the bytes are already stored (e.g. an earlier attempt failed after the
  // upload): reuse them and just record the library entry.
  if (uploadError && !/exists|duplicate/i.test(uploadError.message)) {
    throw toServiceError("cv.upload.storage", { error: uploadError });
  }

  const { data, error, status } = await supabase
    .from("cv_files")
    .insert({
      sha256,
      file_name: file.name.slice(0, 200),
      mime_type: check.mimeType,
      size_bytes: file.size,
      storage_path: path,
    })
    .select(CV_COLUMNS)
    .single<CvFile>();
  if (error) {
    // Two uploads of the same file at once: the other one won; use its entry.
    const winner = error.code === "23505" ? await findBySha(supabase, sha256) : null;
    if (winner) return { ok: true, file: winner, reused: true };
    throw toServiceError("cv.upload.insert", { error, status });
  }
  return { ok: true, file: data, reused: false };
}

async function findBySha(supabase: SupabaseClient, sha256: string): Promise<CvFile | null> {
  const { data, error, status } = await supabase
    .from("cv_files")
    .select(CV_COLUMNS)
    .eq("sha256", sha256)
    .maybeSingle<CvFile>();
  if (error) throw toServiceError("cv.find_by_sha", { error, status });
  return data;
}

export async function listCvFiles(supabase: SupabaseClient): Promise<CvFile[]> {
  const { data, error, status } = await supabase
    .from("cv_files")
    .select(CV_COLUMNS)
    .order("created_at", { ascending: false })
    .overrideTypes<CvFile[], { merge: false }>();
  if (error) throw toServiceError("cv.list", { error, status });
  return data;
}

// Attach (or detach with null) a CV; the change is logged in the same transaction.
export async function setApplicationCv(
  supabase: SupabaseClient,
  applicationId: string,
  cvFileId: string | null,
): Promise<boolean> {
  const { data, error, status } = await supabase
    .rpc("set_application_cv", { p_application_id: applicationId, p_cv_file_id: cvFileId })
    .overrideTypes<boolean, { merge: false }>();
  if (error) throw toServiceError("application.cv.set", { error, status });
  return data === true;
}

// The CV's bytes for preview or download; null if the file is not the caller's (RLS on both
// the library table and the bucket).
export async function readCv(
  supabase: SupabaseClient,
  cvFileId: string,
): Promise<{ bytes: ArrayBuffer; mimeType: string; fileName: string } | null> {
  const {
    data: file,
    error,
    status,
  } = await supabase
    .from("cv_files")
    .select("storage_path, file_name, mime_type")
    .eq("id", cvFileId)
    .maybeSingle<{ storage_path: string; file_name: string; mime_type: string }>();
  if (error) throw toServiceError("cv.read.row", { error, status });
  if (!file) return null;

  const { data, error: downloadError } = await supabase.storage.from(BUCKET).download(file.storage_path);
  if (downloadError) throw toServiceError("cv.read.download", { error: downloadError });
  return { bytes: await data.arrayBuffer(), mimeType: file.mime_type, fileName: file.file_name };
}
