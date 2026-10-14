// The generated files under evals/ and the builder each one comes from (shared by the sync script
// and the drift test, so both always cover the same set).
import { buildPromptfooChat, buildPromptfooResponseFormat, buildPromptfooSchema } from "./promptfoo.js";

export const EVAL_FILES: readonly { path: string; build: () => unknown }[] = [
  { path: "prompts/review.json", build: buildPromptfooChat },
  { path: "schema.json", build: buildPromptfooSchema },
  { path: "response-format.json", build: buildPromptfooResponseFormat },
];
