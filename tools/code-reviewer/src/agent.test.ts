import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { reviewPullRequest } from "./agent.js";
import { REVIEW_INSTRUCTIONS } from "./prompts/instructions.js";
import type { Review } from "./review-schema.js";

const REVIEW: Review = {
  implementationCorrectness: 8,
  idiomaticity: 7,
  complexity: 9,
  testRiskCoverage: 4,
  documentation: 6,
  securitySafety: 9,
  verdict: "fail",
  summary: "Brakuje testów dla ścieżki błędu.",
};

function mockModel(reply: string) {
  return new MockLanguageModelV4({
    modelId: "mock-reviewer",
    doGenerate: {
      content: [{ type: "text", text: reply }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 45, text: 45, reasoning: undefined },
      },
      warnings: [],
    },
  });
}

describe("reviewPullRequest", () => {
  it("returns the parsed review, the token usage and the model id", async () => {
    const model = mockModel(JSON.stringify(REVIEW));

    const result = await reviewPullRequest({ diff: "+a" }, { model });

    expect(result).toEqual({ review: REVIEW, usage: { inputTokens: 120, outputTokens: 45 }, model: "mock-reviewer" });
  });

  it("sends the instructions and the PR title, description and diff to the model", async () => {
    const model = mockModel(JSON.stringify(REVIEW));

    await reviewPullRequest({ title: "Fix login", body: "Closes a race", diff: "+guard()" }, { model });

    expect(model.doGenerateCalls).toHaveLength(1);
    const sent = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(sent).toContain(JSON.stringify(REVIEW_INSTRUCTIONS).slice(1, -1));
    expect(sent).toContain("<pr_title>\\nFix login\\n</pr_title>");
    expect(sent).toContain("<pr_description>\\nCloses a race\\n</pr_description>");
    expect(sent).toContain("<diff>\\n+guard()\\n</diff>");
  });

  it("rejects a reply that does not match the review schema", async () => {
    const model = mockModel(JSON.stringify({ ...REVIEW, verdict: "maybe" }));

    await expect(reviewPullRequest({ diff: "+a" }, { model })).rejects.toThrow();
  });

  it("rejects an empty diff before calling the model", async () => {
    const model = mockModel(JSON.stringify(REVIEW));

    await expect(reviewPullRequest({ diff: "  \n" }, { model })).rejects.toThrow(/The diff is empty/);
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});
