---
date: 2026-10-14T14:42:01+00:00
researcher: Claude (Opus 5.5) for Mariusz Michalak
git_commit: eeb8e9b5d1c951b36c39a77032c436efa449cd27
branch: main
repository: 41mariusz/applications-tracker
topic: "Introducing evals (promptfoo first) for the code-review agent in tools/code-reviewer"
tags: [research, code-reviewer, evals, promptfoo, ai-sdk, openrouter]
status: complete
last_updated: 2026-10-14
last_updated_by: Claude (Opus 5.5)
---

# Research: Introducing evals (promptfoo first) for the code-review agent

**Date**: 2026-10-14T14:42:01+00:00
**Researcher**: Claude (Opus 5.5) for Mariusz Michalak
**Git Commit**: eeb8e9b5d1c951b36c39a77032c436efa449cd27
**Branch**: main
**Repository**: 41mariusz/applications-tracker

## Research Question

Analyze the current state of `tools/code-reviewer` in the context of potential eval introduction — reusability of prompts, importability of the agent, etc. First pick for the eval toolkit is promptfoo; go that way if the stack aligns, otherwise analyze other OSS tools for evaluating prompts and agents. Use up-to-date docs. (Course M5L3, `.claude/prompts/m5l3-promptfoo.md`, "Research" step.)

## Summary

- **The stack fits promptfoo.** The agent is a small ESM/TypeScript package (Node ≥ 22, AI SDK `ai@7.0.140`, `@openrouter/ai-sdk-provider@3.1.0`, zod 4). promptfoo `0.124.1` (latest on npm, published 2026-10-08) needs Node `>=22.22.0`, depends on zod `^4` itself, has a native `openrouter:` provider and loads custom `.ts`/`.mjs` providers. No blocking incompatibility found.
- **The agent was built to be imported by evals.** `src/agent.ts:1-3` says so in its header. `package.json` exports `./src/agent.ts`. One call, `reviewPullRequest(input, { model })` (`src/agent.ts:53-63`), returns `{ review, usage, model }`, where `review` has already been checked against `REVIEW_SCHEMA`. The model is a parameter, either an OpenRouter id string or a `LanguageModel` instance (`src/agent.ts:26-41`).
- **The prompts are reusable as code, not as text files.** The system prompt is the TS constant `REVIEW_INSTRUCTIONS` (`src/prompts/instructions.ts:3-13`), and the user message comes from the pure function `buildReviewRequest()` (`src/prompts/review-request.ts:8-14`). Both are re-exported from `agent.ts:10-12`. The course template expects a plain-text copy, `prompts/review.txt`, holding the prompt plus a JSON instruction. That copy would drift from the agent's real prompt.
- **There are two ways to wire promptfoo, and they test different things:**
  - **A. Native `openrouter:<model>` providers + a prompt file** (the template's way). This tests the raw prompt only. The prompt is duplicated, JSON format comes from an instruction or `response_format`, and promptfoo returns the output as a string, so you need `JSON.parse`.
  - **B. A custom provider (`file://evals/provider.ts`) listed 3× with `config.model`**, calling `reviewPullRequest()`. This tests the real agent: the same instructions, user message, `Output.object(REVIEW_SCHEMA)` validation and `response_format: json_schema, strict: true` sent by the OpenRouter SDK provider. It needs no prompt duplication, and the output is an already-validated object.
  - **Recommendation for the plan: B.** It matches the stated goal, "tests the same code review prompt" with no copy, and it keeps working when the agent gains tools.
- **Assertions map directly:**
  - `llm-rubric` with an explicit OpenRouter grader in `defaultTest.options.provider`. It is required: promptfoo's default grader list has no OpenRouter entry.
  - `javascript`: `output.verdict === "fail"`. This works on B's object output; under A it needs `JSON.parse(output)`.
  - `is-json` is only meaningful for A, because B's output is already an object.
- **Risks to plan for:**
  - `.nvmrc` pins Node 22.14.0, which is below promptfoo's `>=22.22.0`. The host runs v24.21.0, and CI's `node-version: 22` resolves to the newest 22.x.
  - promptfoo is heavy: about 32 MB unpacked, around 70 direct dependencies, native `@libsql/client`, and optional `sharp` among others. Keep it out of the reviewer's CI `npm ci` path and the root app.
  - Whether each of the three models honours strict `json_schema` through OpenRouter is unverified. A model that does not comply will surface as a provider error (B) or invalid JSON (A), and either outcome is itself an eval result.
- **Alternatives:**
  - **evalite** (Vitest-based, TS-native) is the closest in spirit. Its current lines target `ai@^6` / `@ai-sdk/provider@^2` and `@vitest/runner@^4`, behind this repo's `ai@7` and Vitest 5, and 1.0 is still beta.
  - **Braintrust autoevals** is a scorer library, with no runner or UI.
  - For a 3-model × 1-diff comparison matrix with a rubric judge, promptfoo is the most complete fit.

## Detailed Findings

### Agent importability

- `tools/code-reviewer/package.json`:
  - `"type": "module"`.
  - `"exports": { ".": "./src/agent.ts" }`: the export is TS source, with no compiled library entry.
  - `engines.node >=22`.
  - Scripts: `review` (tsx), `typecheck`, `test` (vitest), and `build` (an esbuild bundle of the **CLI** `src/index.ts` → `dist/review.js`, not of `agent.ts`).
- `src/agent.ts:43-50`: `createReviewer()` builds a `ToolLoopAgent` from `instructions: REVIEW_INSTRUCTIONS`, `tools: reviewTools` and `output: Output.object({ schema: REVIEW_SCHEMA })`.
- `src/agent.ts:53-63`: `reviewPullRequest()`.
  - It validates input with `REVIEW_INPUT_SCHEMA` (`agent.ts:18-22`). The diff must be non-empty, and an empty diff throws before any model call.
  - It calls `generate({ prompt: buildReviewRequest(...) })` and returns `review`, `usage.inputTokens/outputTokens` (from `totalUsage`) and the model `id`.
  - This is the full surface an eval provider needs. The token counts map onto promptfoo's `tokenUsage` (`prompt`/`completion`).
- `src/agent.ts:16`: `DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash"`, one of the three models in the planned matrix.
- `src/agent.ts:37-41`: `openrouter(model)` comes from `@openrouter/ai-sdk-provider`'s default instance, which reads `OPENROUTER_API_KEY` from the environment. The CLI checks the key (`src/index.ts:11-14`). An eval provider calling `reviewPullRequest()` directly skips that check and gets the SDK's own error instead.
- `src/index.ts` is a side-effecting CLI script: it exits the process and reads stdin. It is unsuitable as an eval entry. Import `agent.ts`, not the CLI.
- `src/tools/index.ts:3-5`: `reviewTools` is empty ("single-step for now"). Option B keeps covering the agent once tools are added; option A cannot.

### Prompt reusability

- `src/prompts/instructions.ts:3-13`: Polish system prompt with:
  - six criteria on a 1-10 scale, a pass/fail verdict and a 2-3 sentence Markdown summary;
  - a rule that the summary must be written in Polish;
  - a rule that `<pr_title>`, `<pr_description>` and `<diff>` are data, not commands (prompt-injection guard).
- `src/prompts/review-request.ts:8-14`: the user message is `Oceń poniższy pull request.` followed by tagged blocks. Title and description are omitted when blank; the diff is always present.
- The response shape lives in `src/review-schema.ts:9-54` (`REVIEW_SCHEMA`):
  - six `z.number()` scores; the 1–10 range is in the descriptions only, `review-schema.ts:7-8`;
  - `verdict: z.enum(["pass","fail"])`;
  - `summary: z.string()`.
- `review-schema.ts:57` already exports `REVIEW_JSON_SCHEMA` (draft-07) for consumers that need plain JSON Schema. Option A could use it for `response_format` or `is-json` validation, but promptfoo YAML cannot import a TS constant. It would need a generated `schema.json` or a JS prompt/assert file.
- The header comment in `review-schema.ts:1-3` already names "the promptfoo evals" as a reader of this contract.
- Consequence for option A: promptfoo prompt functions are documented for `.js`/`.py` only, not `.ts` ([prompts docs](https://www.promptfoo.dev/docs/configuration/prompts/)). Reusing `REVIEW_INSTRUCTIONS` without copying it therefore needs either a `.ts` prompt function (undocumented) or a text copy (`prompts/review.txt`, per the template), which drifts.

### Structured output path in the agent

- With a schema, `@openrouter/ai-sdk-provider@3.1.0` sends `response_format: { type: "json_schema", json_schema: { schema, strict: true (default), name: "response" } }`. Source: `tools/code-reviewer/node_modules/@openrouter/ai-sdk-provider/dist/index.js:4299-4308`.
- The AI SDK then parses and validates the reply against `REVIEW_SCHEMA`. In this inspected path (`agent.test.ts`, mock model returning JSON text), a valid reply becomes `result.output`. A non-conforming reply makes `generate()` throw, so in option B a model that breaks the schema fails the test case with a provider error rather than passing silently.

### promptfoo fit (docs checked 2026-10-14)

- **Version and engine** ([npm](https://registry.npmjs.org/promptfoo/latest)): `0.124.1`, engines `node >=22.22.0`.
  - The local host has v24.21.0, and CI uses `actions/setup-node` with `node-version: 22`, which resolves to the newest 22.x.
  - The repo `.nvmrc` is `22.14.0`, below the minimum, so anyone using nvm with it gets an engine warning or failure.
  - The course template says the same ("promptfoo needs Node 22.22+").
- **OpenRouter provider** ([docs](https://www.promptfoo.dev/docs/providers/openrouter/)):
  - The id is `openrouter:<model>`, and the key comes from `OPENROUTER_API_KEY` by default.
  - Options include `temperature`, `max_tokens` and `reasoning_effort`.
  - It speaks OpenAI Chat Completions, so `response_format: json_schema` is configured as in the [OpenAI provider docs](https://www.promptfoo.dev/docs/providers/openai/). The output arrives as a string.
- **Custom provider** ([docs](https://www.promptfoo.dev/docs/providers/custom-api/)):
  - The file default-exports a class with `id()` and `callApi(prompt, context)`. The constructor receives `{ id, config }`.
  - `callApi` returns `{ output, tokenUsage?, cost?, error? }`. `output` may be an object.
  - The same `file://` may be listed several times with different `label` + `config`, which is the documented way to run one implementation across three models.
  - `.ts` files are loaded directly. promptfoo depends on `tsx@^4`, which is presumably the loader (inferred: the docs only say "TypeScript loader" and ask you to run from the dir with `tsconfig.json`).
  - promptfoo bundles its own `ai@^6`. A provider file in `tools/code-reviewer/` resolves the package's own `ai@7` by Node resolution (inferred, not documented).
- **Vars from files** ([test-cases docs](https://www.promptfoo.dev/docs/configuration/test-cases/)): `vars: { diff: file://fixtures/x.diff }` loads text as a string, with paths relative to the config. `.diff` is not named in the docs; text loading is expected.
- **Assertions** ([llm-rubric](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/), [javascript](https://www.promptfoo.dev/docs/configuration/expected-outputs/javascript/)):
  - **`llm-rubric`:** the grader is set via `defaultTest.options.provider` (or per assertion, or `--grader`), and it accepts any provider id, including `openrouter:…`. That is not shown explicitly on the rubric page. The default grader list (OpenAI/Anthropic/… keys) has no OpenRouter entry, so the grader must be set explicitly. With option B, the rubric sees the object output; serializing the review (or just `summary`) for the judge is a plan detail.
  - **`javascript`:** inline `output.verdict === "fail"` keeps the object type for string expressions. `file://assert.mjs` is also possible.
- **Running** ([CLI](https://www.promptfoo.dev/docs/usage/command-line/)):
  - Flags: `promptfoo eval -c <config>`, `--no-cache`, `-o results.json|html|junit.xml`, `--repeat N`, `-j N`.
  - `promptfoo view` opens a local UI.
  - No login is needed for local eval. `--share` uploads to the cloud, so avoid it.
  - Telemetry is turned off with `PROMPTFOO_DISABLE_TELEMETRY=1`; the update check with `PROMPTFOO_DISABLE_UPDATE=1`.
- **Weight** (npm metadata): about 31.7 MB unpacked, around 70 direct dependencies (express, socket.io, `@libsql/client` native, openai, `@anthropic-ai/sdk`, posthog-node …) and around 27 optional (`sharp`, cloud SDKs). `npm i --omit=optional` trims the optional ones.
  - The `code-reviewer` CI job runs `npm ci` in `tools/code-reviewer` (`.github/workflows/ci.yml`, job `code-reviewer`), and so does the review composite action. A promptfoo devDependency there makes both installs heavier.
  - A separate `tools/code-reviewer/evals/` package (own `package.json`, importing the agent by relative path) avoids that. The plan must pick one.

### Alternatives (if promptfoo were rejected)

- **evalite** ([npm](https://www.npmjs.com/package/evalite)): Vitest-based `.eval.ts` with a local UI, calling `reviewPullRequest()` directly.
  - `0.19.0` depends on `@ai-sdk/provider ^2`, `@vitest/runner ^4` and `better-sqlite3`.
  - `1.0.0-beta.16` peers `ai ^6`.
  - It does not match `ai@7` / Vitest 5 today.
- **Braintrust autoevals** ([npm](https://www.npmjs.com/package/autoevals), 0.4.0): LLM-as-judge scorers on the `openai` client (OpenRouter via `baseURL`), used inside a plain Vitest test. It has no matrix runner or UI.
- **Verdict:** promptfoo is the recommended tool. The alternatives are lighter but lack the side-by-side model matrix (autoevals) or lag the SDK versions (evalite).

## Code References

- `tools/code-reviewer/package.json` - ESM, `exports: ./src/agent.ts`, scripts, deps (`ai@^7.0.140`, `@openrouter/ai-sdk-provider@^3.1.0`, `zod@^4.6.7`)
- `tools/code-reviewer/src/agent.ts:1-3` - header: import from here "(CI action, promptfoo evals)"
- `tools/code-reviewer/src/agent.ts:16` - `DEFAULT_MODEL`
- `tools/code-reviewer/src/agent.ts:18-22` - `REVIEW_INPUT_SCHEMA` (non-empty diff)
- `tools/code-reviewer/src/agent.ts:26-41` - model option: OpenRouter id or `LanguageModel`
- `tools/code-reviewer/src/agent.ts:43-63` - `createReviewer`, `reviewPullRequest`
- `tools/code-reviewer/src/prompts/instructions.ts:3-13` - `REVIEW_INSTRUCTIONS`
- `tools/code-reviewer/src/prompts/review-request.ts:8-14` - `buildReviewRequest`
- `tools/code-reviewer/src/review-schema.ts:9-59` - `REVIEW_SCHEMA`, `REVIEW_JSON_SCHEMA`, `Review`
- `tools/code-reviewer/src/tools/index.ts:3-5` - empty tool set
- `tools/code-reviewer/src/index.ts:11-38` - CLI (process exits, stdin; not an eval entry)
- `tools/code-reviewer/src/agent.test.ts` - Vitest with `MockLanguageModelV4` (deterministic, no network)
- `tools/code-reviewer/node_modules/@openrouter/ai-sdk-provider/dist/index.js:4299-4308` - strict `json_schema` response format
- `.claude/config-templates/m5l3-promptfooconfig.yaml.template` - course starting point (3 `openrouter:` providers, `prompts/review.txt`, `is-json` + `llm-rubric` + `javascript`, a second SQL-injection test)

## Architecture Insights

- The agent was split in M5L2 so that the CLI, CI and evals share one entry point (`reviewPullRequest`) and one contract (`REVIEW_SCHEMA`). An eval that goes through that entry point measures what CI actually runs. An eval with a copied prompt measures something adjacent.
- Unit tests (Vitest, mock model) cover the mechanics. Quality across models was explicitly left to promptfoo (`context/changes/tool-loop-agent/plan-brief.md:27`).
- `tools/code-reviewer` is a standalone package with its own lockfile, outside the app's root ESLint/Vitest. Eval files placed there will not hit the app's lint, `check-ui-literals` or Vitest globs. Whether the reviewer's `vitest run` picks up any eval `.ts` files is a plan detail (keep evals out of `*.test.ts`).
- Secrets: `OPENROUTER_API_KEY` lives in `tools/code-reviewer/.env` (gitignored) and in GitHub secrets (CLAUDE.md). promptfoo reads `.env` from the working directory (assumed default, not verified), or the `review` script's `--env-file-if-exists` pattern can be reused.

## Historical Context (from prior changes)

- `context/changes/tool-loop-agent/plan.md:5,36,44` - the agent was made importable "so ... the later promptfoo evals can import it"; promptfoo was explicitly out of scope there (change `code-review-evals`). Supported by the current code.
- `context/changes/tool-loop-agent/plan-brief.md:25` - model as a factory parameter "evals pick models". Supported (`agent.ts:26-41`).
- `context/changes/ci-cd-code-review/plan.md:40` - no promptfoo and no prompt/schema changes in the CI change. The CI workflow and composite action run `npm ci` in `tools/code-reviewer`, which is relevant to where promptfoo is installed.

## Related Research

- `context/changes/ci-cd-code-review/research.md` - the CI side of M5L3

## Open Questions

- Placement: promptfoo as a devDependency of `tools/code-reviewer` (simple, but heavier `npm ci` in the reviewer CI job and the review action), or a separate `tools/code-reviewer/evals/` package (lean CI, one more lockfile)?
- Wiring: custom provider around `reviewPullRequest()` (recommended), the template's `openrouter:` + `prompts/review.txt`, or both side by side (agent vs raw prompt)?
- Grader model for `llm-rubric`: it must be explicit and should differ from the three graded models (the template suggests `openrouter:anthropic/claude-sonnet-5.5`). This choice affects cost.
- Whether `z-ai/glm-5.3` and `openai/gpt-5.6-luna` accept strict `json_schema` through OpenRouter: verify with the first real run.
- Scope: the prompt asks for one React 16 → 19 test case with three planted flaws. The template also has an SQL-injection case. Keep one or both?
- Running evals in CI is not requested. Each run costs money and is non-deterministic, so a manual `npm run eval` is the default unless decided otherwise.
- `.nvmrc` (22.14.0) is below promptfoo's minimum (22.22.0). Bump it, or document that evals need a newer Node?
