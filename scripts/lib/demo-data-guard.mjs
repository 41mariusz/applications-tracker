// Safety rules for scripts/demo-data.mjs. Pure — no I/O — so they are unit-tested (demo-data-guard.test.mjs).
//
// The destructive modes (--reset, --clear-only) wipe the whole account: applications with their notes and
// history, the CV library and the stored CV files. Nothing in the app can undo that, so:
//   - without --confirm=<account e-mail> they only preview what would be deleted;
//   - they refuse while the account holds applications that are not demo data ("[TEST] " prefix),
//     unless --include-real is given — checked before the confirmation, so a confirmed run cannot skip it.

export const DEMO_PREFIX = "[TEST]";
const MAX_EXAMPLES = 5;

/**
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{ ok: true, mode: "seed" | "reset" | "clear-only", confirm: string | null, includeReal: boolean }
 *   | { ok: false, error: string }}
 */
export function parseDemoArgs(argv) {
  let reset = false;
  let clearOnly = false;
  let confirm = null;
  let includeReal = false;
  for (const arg of argv) {
    if (arg === "--reset") reset = true;
    else if (arg === "--clear-only") clearOnly = true;
    else if (arg === "--include-real") includeReal = true;
    else if (arg.startsWith("--confirm=")) confirm = normalizeEmail(arg.slice("--confirm=".length)) || null;
    else return { ok: false, error: `Unknown argument: ${arg}` };
  }
  if (reset && clearOnly) return { ok: false, error: "Use either --reset or --clear-only, not both." };
  const mode = clearOnly ? "clear-only" : reset ? "reset" : "seed";
  if (mode === "seed" && (confirm || includeReal)) {
    return { ok: false, error: "--confirm and --include-real only apply to --reset or --clear-only." };
  }
  return { ok: true, mode, confirm, includeReal };
}

/**
 * What a run may do with the account.
 * @param {{ mode: "seed" | "reset" | "clear-only", confirm: string | null, includeReal: boolean,
 *   accountEmail: string, applications: { company: string, position?: string | null }[] }} input
 * @returns {{ action: "seed" | "preview" | "proceed" | "refuse", reason?: string, realExamples?: string[] }}
 */
export function decideWipe({ mode, confirm, includeReal, accountEmail, applications }) {
  if (mode === "seed") return { action: "seed" };

  const real = applications.filter((a) => !a.company.startsWith(DEMO_PREFIX));
  if (real.length > 0 && !includeReal) {
    return {
      action: "refuse",
      reason:
        `The account has ${real.length} application(s) that are not demo data (no "${DEMO_PREFIX}" prefix). ` +
        "Nothing was deleted. Pass --include-real to delete them as well.",
      realExamples: real.slice(0, MAX_EXAMPLES).map((a) => (a.position ? `${a.company} — ${a.position}` : a.company)),
    };
  }

  if (!confirm) return { action: "preview" };
  if (confirm !== normalizeEmail(accountEmail)) {
    return {
      action: "refuse",
      reason: `--confirm=${confirm} does not match the account (${accountEmail}). Nothing was deleted.`,
    };
  }
  return { action: "proceed" };
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}
