// The code-review agent: a ToolLoopAgent with structured output from REVIEW_SCHEMA, run on a
// validated input (PR title, description, diff). Import createReviewer / reviewPullRequest from here
// (CI action, promptfoo evals); src/index.ts is only the CLI around it.
import { openrouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel, Output, ToolLoopAgent } from "ai";
import { z } from "zod";
import { REVIEW_INSTRUCTIONS } from "./prompts/instructions.js";
import { buildReviewRequest } from "./prompts/review-request.js";

export { buildReviewRequest } from "./prompts/review-request.js";
export { REVIEW_INSTRUCTIONS } from "./prompts/instructions.js";
export { REVIEW_SCHEMA, type Review } from "./review-schema.js";
import { REVIEW_SCHEMA, type Review } from "./review-schema.js";
import { reviewTools } from "./tools/index.js";

export const DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash";

export const REVIEW_INPUT_SCHEMA = z.object({
  diff: z.string().refine((diff) => diff.trim() !== "", "The diff is empty"),
  title: z.string().optional(),
  body: z.string().optional(),
});

export type ReviewInput = z.infer<typeof REVIEW_INPUT_SCHEMA>;

export interface ReviewerOptions {
  /** OpenRouter model id (e.g. "deepseek/deepseek-v4.1-flash") or a ready model instance (tests). */
  model?: string | Exclude<LanguageModel, string>;
}

export interface ReviewResult {
  review: Review;
  usage: { inputTokens?: number; outputTokens?: number };
  model: string;
}

function resolveModel(model: ReviewerOptions["model"] = DEFAULT_MODEL) {
  return typeof model === "string"
    ? { languageModel: openrouter(model), id: model }
    : { languageModel: model, id: model.modelId };
}

export function createReviewer(options: ReviewerOptions = {}) {
  return new ToolLoopAgent({
    model: resolveModel(options.model).languageModel,
    instructions: REVIEW_INSTRUCTIONS,
    tools: reviewTools,
    output: Output.object({ schema: REVIEW_SCHEMA }),
  });
}

/** Reviews one pull request. Invalid input throws before any model call. */
export async function reviewPullRequest(input: ReviewInput, options: ReviewerOptions = {}): Promise<ReviewResult> {
  const validInput = REVIEW_INPUT_SCHEMA.parse(input);
  // The SDK requires the prompt on every call, so the PR parts become the user message here
  // (never the instructions: PR text is untrusted).
  const result = await createReviewer(options).generate({ prompt: buildReviewRequest(validInput) });
  return {
    review: result.output,
    usage: { inputTokens: result.totalUsage.inputTokens, outputTokens: result.totalUsage.outputTokens },
    model: resolveModel(options.model).id,
  };
}
