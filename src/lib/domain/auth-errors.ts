// Classifies the errors Supabase Auth returns from getUser() and signInWithPassword(), so a network
// outage or an Auth 5xx is not mistaken for "signed out". All of them are returned, not thrown.
import {
  isAuthApiError,
  isAuthError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from "@supabase/supabase-js";
import { isProjectPaused } from "@/lib/supabase-paused";

// - none: no error;
// - no-session: no cookie or a revoked session — quietly signed out;
// - paused: the free-tier project is paused (HTTP 540, see supabase-paused.ts);
// - rejected: a bad, expired or rotated token — signed out, worth a warn-level line;
// - outage: network failure, Auth 5xx or an unrecognised reply — the user may well be signed in.
export type AuthErrorKind = "none" | "no-session" | "paused" | "rejected" | "outage";

function statusOf(error: unknown): number | undefined {
  const { status } = error as { status?: unknown };
  return typeof status === "number" ? status : undefined;
}

export function classifyAuthError(error: unknown): AuthErrorKind {
  if (error === null || error === undefined) return "none";
  // First: a paused project's 540 is an AuthApiError too.
  if (isProjectPaused(error)) return "paused";
  if (isAuthSessionMissingError(error)) return "no-session";
  if (isAuthRetryableFetchError(error)) return "outage";
  // Auth answered and refused the token (4xx); anything else from Auth (5xx, no status — AuthUnknownError)
  // or a non-Auth error means we could not tell whether the user is signed in.
  if (isAuthError(error)) {
    const status = statusOf(error);
    return status !== undefined && status >= 400 && status < 500 ? "rejected" : "outage";
  }
  return "outage";
}

// The one sign-in failure the user can fix by retyping: a wrong e-mail or password.
export function isInvalidCredentials(error: unknown): boolean {
  return isAuthApiError(error) && error.code === "invalid_credentials";
}
