// CLI: the OpenRouter credits pre-flight alone, no review (for example before the evals).
//   npm run preflight                       # skipped for a `:free` model
//   npm run preflight -- --require-credits  # checks even a `:free` model
// Prints one `OpenRouter pre-flight:` line on stderr.
// Exit codes: 0 = ok, skipped or unknown (a check that cannot be completed only warns),
// 1 = insufficient credits, 2 = usage error (no OPENROUTER_API_KEY).
// The model is OpenRouter's: REVIEW_MODEL, default DEFAULT_MODEL.
import { DEFAULT_MODEL } from "./agent.js";
import { checkCredits, formatVerdict, MISSING_KEY_MESSAGE } from "./credits.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error(MISSING_KEY_MESSAGE);
  process.exit(2);
}

const model = process.env.REVIEW_MODEL || DEFAULT_MODEL;
const requireCredits = process.argv.slice(2).includes("--require-credits");

const verdict = await checkCredits({ apiKey, model, requireCredits });
console.error(formatVerdict(verdict));
process.exit(verdict.kind === "insufficient" ? 1 : 0);
