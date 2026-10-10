// CV rules (PRD FR-013). Pure functions — no I/O except hashing bytes already in memory.

import { isUuid } from "@/lib/domain/ids";

export const MAX_CV_BYTES = 5 * 1024 * 1024;
export const CV_TOO_LARGE_MESSAGE = "Plik jest za duży (maksymalnie 5 MB).";

// A multipart request is larger than the file it carries (boundary, part headers), hence the margin.
export const MAX_CV_REQUEST_BYTES = MAX_CV_BYTES + 64 * 1024;

// Lets the upload route refuse an oversized body before parsing it. A missing or malformed
// Content-Length (e.g. a chunked request) is let through to the post-parse file check.
export function isUploadRequestTooLarge(contentLength: string | null): boolean {
  if (contentLength === null || !/^\d+$/.test(contentLength)) return false;
  return Number(contentLength) > MAX_CV_REQUEST_BYTES;
}

export const CV_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;
export type CvMimeType = keyof typeof CV_TYPES;

// What the file pickers show, derived from the rules above. The "cvs" bucket holds its own copy of
// the limits (pinned by supabase/tests/cv_bucket.test.sql).
export const CV_ACCEPT = [
  ...Object.values(CV_TYPES).map((extension) => `.${extension}`),
  ...Object.keys(CV_TYPES),
].join(",");
export const CV_LIMITS_TEXT = `${Object.values(CV_TYPES)
  .map((extension) => extension.toUpperCase())
  .join(" lub ")}, do ${Math.floor(MAX_CV_BYTES / (1024 * 1024))} MB`;

export type CvCheck = { ok: true; mimeType: CvMimeType; extension: string } | { ok: false; message: string };

// Browsers sometimes send an empty or generic type for .docx, so the extension is a fallback.
export function checkCvFile(file: { name: string; type: string; size: number }): CvCheck {
  if (file.size === 0) return { ok: false, message: "Plik jest pusty." };
  if (file.size > MAX_CV_BYTES) return { ok: false, message: CV_TOO_LARGE_MESSAGE };
  const byType = (Object.keys(CV_TYPES) as CvMimeType[]).find((t) => t === file.type);
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const byExtension = (Object.keys(CV_TYPES) as CvMimeType[]).find((t) => CV_TYPES[t] === extension);
  const mimeType = byType ?? byExtension;
  if (!mimeType) return { ok: false, message: "Dozwolone są pliki PDF i DOCX." };
  return { ok: true, mimeType, extension: CV_TYPES[mimeType] };
}

// Same bytes → same hash → stored once, whatever the file is called.
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Content-addressed path inside the user's own folder of the "cvs" bucket.
export function cvStoragePath(userId: string, sha256: string, extension: string): string {
  return `${userId}/${sha256}.${extension}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

// Library view: which applications each CV is attached to, most important first (list order).
export function groupByCv<A extends { cv_file_id: string | null }>(
  files: readonly { id: string }[],
  applications: readonly A[],
): Map<string, A[]> {
  const groups = new Map<string, A[]>(files.map((f) => [f.id, []]));
  for (const application of applications) {
    if (application.cv_file_id) groups.get(application.cv_file_id)?.push(application);
  }
  return groups;
}

// Anchor of a library entry: the page reloads onto it after an upload, and `:target` highlights it.
const CV_ANCHOR_PREFIX = "cv-";

export function cvAnchorId(id: string): string {
  return `${CV_ANCHOR_PREFIX}${id}`;
}

// The CV id named by a location hash such as "#cv-<uuid>"; null for any other hash.
export function uploadedCvIdFromHash(hash: string): string | null {
  const prefix = `#${CV_ANCHOR_PREFIX}`;
  if (!hash.startsWith(prefix)) return null;
  const id = hash.slice(prefix.length);
  return isUuid(id) ? id : null;
}
