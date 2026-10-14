import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildPromptfooChat } from "./promptfoo.js";
import { EVAL_FILES } from "./promptfoo-files.js";

describe("promptfoo eval files", () => {
  it.each(EVAL_FILES)("evals/$path matches the agent's prompt and schema", async ({ path, build }) => {
    // Parsed, not byte-compared: the pre-commit prettier may reformat the JSON.
    const committed: unknown = JSON.parse(await readFile(new URL(`../../evals/${path}`, import.meta.url), "utf8"));

    expect(committed, `evals/${path} is stale: run npm run eval:sync in tools/code-reviewer`).toEqual(build());
  });

  // promptfoo renders prompts with Nunjucks: only the diff placeholder may look like a template.
  it("has one {{diff}} placeholder and no other template syntax", () => {
    const [system, user] = buildPromptfooChat();

    expect(user?.content.split("{{diff}}")).toHaveLength(2);
    expect(user?.content.replace("{{diff}}", "")).not.toMatch(/\{\{|\{%|\{#/);
    expect(system?.content).not.toMatch(/\{\{|\{%|\{#/);
  });
});
