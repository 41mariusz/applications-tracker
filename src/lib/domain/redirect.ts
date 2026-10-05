export const DEFAULT_AFTER_SIGN_IN = "/dashboard";

// Return path after sign-in: only a path inside this app, otherwise the list.
// Rejects "//host" and "/\host" (browsers treat both as another site), absolute URLs,
// and control characters or backslashes (browsers drop tabs/newlines, so "/\t/host" becomes "//host").
export function safeNextPath(value: string | null): string {
  if (!value?.startsWith("/")) return DEFAULT_AFTER_SIGN_IN;
  if (value[1] === "/" || value.includes("\\")) return DEFAULT_AFTER_SIGN_IN;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return DEFAULT_AFTER_SIGN_IN;
  return value;
}
