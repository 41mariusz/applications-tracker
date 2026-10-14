// The review prompt and schema in the shapes the promptfoo evals read (tools/code-reviewer/evals/).
// Derived from the agent's own modules, so the evaluated models get the same system/user split and
// the same strict response format as the agent in CI. `npm run eval:sync` writes them to evals/;
// promptfoo.test.ts fails when the committed files drift from this output.
import { REVIEW_JSON_SCHEMA } from "../review-schema.js";
import { REVIEW_INSTRUCTIONS } from "./instructions.js";
import { buildReviewRequest } from "./review-request.js";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/** promptfoo chat prompt; `{{diff}}` is filled from the test's `vars.diff`. */
export function buildPromptfooChat(): ChatMessage[] {
  return [
    { role: "system", content: REVIEW_INSTRUCTIONS },
    { role: "user", content: buildReviewRequest({ diff: "{{diff}}" }) },
  ];
}

/** The review's JSON Schema without the `$schema` key (metadata, not a constraint). */
export function buildPromptfooSchema(): Record<string, unknown> {
  const { $schema: _metadata, ...schema } = REVIEW_JSON_SCHEMA as Record<string, unknown>;
  return schema;
}

export interface ResponseFormat {
  type: "json_schema";
  json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
}

/** Same response format the OpenRouter SDK provider sends for the agent's structured output. */
export function buildPromptfooResponseFormat(): ResponseFormat {
  return {
    type: "json_schema",
    json_schema: { name: "response", strict: true, schema: buildPromptfooSchema() },
  };
}
