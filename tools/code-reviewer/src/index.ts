// CLI: prints the review of a PR as JSON on stdout (nothing else), usage or one error line on stderr.
//   git diff main... | npm run review
//   DIFF_FILE=pr.diff PR_TITLE="..." PR_BODY="..." npm run review
// Exit codes: 0 = review printed (any verdict; the CI gate reads `verdict`), 1 = review failed, 2 = usage error.
// The model is OpenRouter's: REVIEW_MODEL, default DEFAULT_MODEL.
import { APICallError } from "ai";
import { text } from "node:stream/consumers";
import { DEFAULT_MODEL, reviewPullRequest } from "./agent.js";
import { readReviewInput, UsageError } from "./cli-input.js";

if (!process.env.OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY is not set (put it in tools/code-reviewer/.env).");
  process.exit(2);
}

let input;
try {
  input = await readReviewInput(process.env, () => text(process.stdin));
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(error.message);
  process.exit(2);
}

const model = process.env.REVIEW_MODEL || DEFAULT_MODEL;
let result;
try {
  result = await reviewPullRequest(input, { model });
} catch (error) {
  // The SDK error carries the whole request (diff included); print only the cause, not the payload.
  const status = APICallError.isInstance(error) ? `, HTTP ${error.statusCode}` : "";
  console.error(`Review failed (model=${model}${status}): ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

console.log(JSON.stringify(result.review, null, 2));
// Usage goes to stderr so stdout stays pure JSON for the CI step.
console.error(`model=${result.model} inputTokens=${result.usage.inputTokens} outputTokens=${result.usage.outputTokens}`);
