export const DEFAULT_AFTER_SIGN_IN = "/dashboard";

// Return path after sign-in.
export function safeNextPath(value: string | null): string {
  if (!value) return DEFAULT_AFTER_SIGN_IN;
  return value;
}
