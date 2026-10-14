// Writes the promptfoo prompt and schema files (evals/) from the agent's prompt and schema.
//   npm run eval:sync
// Run it after changing src/prompts/ or src/review-schema.ts; promptfoo.test.ts fails until you do.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EVAL_FILES } from "./prompts/promptfoo-files.js";

for (const { path, build } of EVAL_FILES) {
  const target = fileURLToPath(new URL(`../evals/${path}`, import.meta.url));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(build(), null, 2)}\n`);
  console.log(`wrote evals/${path}`);
}
