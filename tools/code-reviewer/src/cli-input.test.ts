import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readReviewInput, UsageError } from "./cli-input.js";

const stdin = (content: string) => () => Promise.resolve(content);

async function diffFile(content: string) {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "code-reviewer-")), "pr.diff");
  await writeFile(file, content);
  return file;
}

describe("readReviewInput", () => {
  it("reads the diff from DIFF_FILE in preference to stdin", async () => {
    const file = await diffFile("+from file");

    const input = await readReviewInput({ DIFF_FILE: file }, stdin("+from stdin"));

    expect(input.diff).toBe("+from file");
  });

  it("falls back to stdin when DIFF_FILE is unset", async () => {
    const input = await readReviewInput({}, stdin("+from stdin"));

    expect(input).toEqual({ diff: "+from stdin", title: undefined, body: undefined });
  });

  it("takes the title and description from PR_TITLE and PR_BODY", async () => {
    const input = await readReviewInput({ PR_TITLE: " Fix login ", PR_BODY: "Closes a race" }, stdin("+a"));

    expect(input.title).toBe("Fix login");
    expect(input.body).toBe("Closes a race");
  });

  it("treats a blank PR_TITLE / PR_BODY as absent", async () => {
    const input = await readReviewInput({ PR_TITLE: "", PR_BODY: "  " }, stdin("+a"));

    expect(input.title).toBeUndefined();
    expect(input.body).toBeUndefined();
  });

  it("rejects an empty diff as a usage error", async () => {
    await expect(readReviewInput({}, stdin(" \n"))).rejects.toThrow(UsageError);
  });

  it("rejects a missing DIFF_FILE as a usage error", async () => {
    await expect(readReviewInput({ DIFF_FILE: "/nonexistent/pr.diff" }, stdin("+a"))).rejects.toThrow(
      /Cannot read DIFF_FILE/,
    );
  });
});
