// Review input for the CLI, gathered the way the M5L3 composite action passes it:
// diff from the file at DIFF_FILE (stdin when unset), PR title/description from PR_TITLE / PR_BODY.
import { readFile } from "node:fs/promises";
import type { ReviewInput } from "./agent.js";

export const USAGE = "Usage: git diff main... | npm run review  (or DIFF_FILE=<path>; optional PR_TITLE, PR_BODY)";

/** A problem with how the CLI was called (exit code 2), as opposed to a failed review. */
export class UsageError extends Error {
  override name = "UsageError";
}

export async function readReviewInput(
  env: Record<string, string | undefined>,
  readStdin: () => Promise<string>,
): Promise<ReviewInput> {
  let diff: string;
  if (env.DIFF_FILE) {
    try {
      diff = await readFile(env.DIFF_FILE, "utf8");
    } catch (error) {
      throw new UsageError(`Cannot read DIFF_FILE ${env.DIFF_FILE}`, { cause: error });
    }
  } else {
    diff = await readStdin();
  }
  if (diff.trim() === "") throw new UsageError(`The diff is empty. ${USAGE}`);

  return { diff, title: env.PR_TITLE?.trim() || undefined, body: env.PR_BODY?.trim() || undefined };
}
