# Modular Code-Review Agent on ToolLoopAgent Implementation Plan

## Overview

Turn the single-file reviewer in `tools/code-reviewer/src/index.ts` into a modular, reusable code-review agent built on the AI SDK `ToolLoopAgent`. The review schema stays the single contract, prompts move into their own modules, and the agent is exported so the M5L3 GitHub Actions workflow and the later promptfoo evals can import it. The CLI keeps working locally and already speaks the input contract of the M5L3 composite action. Eval setup is out of scope.

## Current State Analysis

- `tools/code-reviewer/` is a standalone package (own `package.json`, `tsconfig.json`, lockfile): `ai` 7.0.140, `@openrouter/ai-sdk-provider` 3.1.0, `zod` 4.6.7, `tsx`, TypeScript ~6.0.3, `@types/node` 22. ESM, Node ≥ 22. Excluded from the app's `tsconfig.json` and ESLint because the app's CI does not install its deps; it has its own `npm run typecheck`.
- `src/index.ts` does everything in one file: checks `OPENROUTER_API_KEY`, reads the diff from stdin, calls `generateText` with `Output.object({ schema: REVIEW_SCHEMA })`, prints the review JSON to stdout and the token usage to stderr, prints a one-line error (no request dump) on API failure. Model: `REVIEW_MODEL`, default `deepseek/deepseek-v4.1-flash`.
- `src/review-schema.ts` is the course template (`.claude/config-templates/m5l2-review-schema.ts.template`): `SYSTEM_PROMPT` (Polish) plus `REVIEW_SCHEMA` (six 1–10 scores, `verdict: pass|fail`, Markdown `summary`), `REVIEW_JSON_SCHEMA`, `Review` type.
- Verified on 2026-10-14 against a real commit with `nvidia/nemotron-3-super-120b-a12b:free`: schema-valid JSON, 516 input / 331 output tokens — but the summary came back in English despite the Polish prompt.
- No tests in the package.

## Desired End State

- `tools/code-reviewer/src/` has separate modules for prompts, the (empty) tool registry, the agent and the CLI input; `index.ts` is a thin CLI.
- `createReviewer()` returns a `ToolLoopAgent` with typed call options (`diff` required, `title` / `body` optional) and structured output from `REVIEW_SCHEMA`; `reviewPullRequest()` runs it and returns the parsed review, token usage and model id. Both are importable from `src/agent.ts`, and the model can be injected (OpenRouter id or a `LanguageModel` instance).
- The CLI reads the diff from `DIFF_FILE` (falling back to stdin) and the PR title/body from `PR_TITLE` / `PR_BODY`, prints only the review JSON on stdout, and exits 0 whatever the verdict, 1 on a model/API failure, 2 on a usage error.
- The summary is in Polish; PR title, body and diff reach the model marked as data, not instructions.
- `npm test` in the package runs deterministic unit tests on a mock model — no network, no cost.

Verify: `npm run typecheck && npm test` in `tools/code-reviewer`, then one real review on a free model with title + body + diff.

### Key Discoveries:

- `ToolLoopAgent` accepts the same settings as `generateText`, incl. `instructions` and `output: Output.object(...)`; default loop limit `isStepCount(20)` — `node_modules/ai/docs/03-agents/02-building-agents.mdx:38-52,218-232,296-319`.
- Per-call typed inputs go through `callOptionsSchema` + `prepareCall`, which receives `{ options, ...settings }` and returns the call settings (spread the incoming ones, override what changes) — `node_modules/ai/docs/03-agents/05-configuring-call-options.mdx` "Basic Example"; `prepareCall`'s parameter type includes the call parameters (prompt) and the agent settings — `node_modules/ai/dist/index.d.ts:5756`.
- `MockLanguageModelV4` from `ai/test` returns scripted `content` / `finishReason` / `usage` without a provider — `node_modules/ai/docs/03-ai-sdk-core/55-testing.mdx`.
- The M5L3 composite action runs `node dist/review.js > review.json`, so stdout must be pure JSON and a non-zero exit fails the step before the verdict is read; untrusted PR text is passed only through env (`PR_TITLE`, `PR_BODY`, `DIFF_FILE`, `REVIEW_MODEL`) — `.claude/config-templates/m5l3-action.yml.template:43-60`.
- Both the default model and the free model support tool calling and structured outputs on OpenRouter (checked via `https://openrouter.ai/api/v1/models`, 2026-10-14).

## What We're NOT Doing

- No tools yet: the registry exists but is empty (single-step reviewer; the M5L3 agency ladder adds tools later). No repository file access.
- No promptfoo / eval configuration, no fixtures (change `code-review-evals`).
- No GitHub Actions workflow, composite action, labels, PR comment or `dist/review.js` build (change `ci-cd-code-review`). The action's `LLM_PROVIDER_API_KEY` → `OPENROUTER_API_KEY` mapping is settled there.
- No diff-size cap or truncation.
- No change to the schema fields, score scale or verdict semantics.
- No change to the app (`src/`, root CI, Cloudflare).

## Implementation Approach

Split by responsibility, keep each module small: prompts are pure text/functions, the agent factory wires the SDK, `reviewPullRequest` is the one call consumers need, and the CLI only gathers input from env/stdin and maps outcomes to exit codes. The model is a factory parameter so tests inject `MockLanguageModelV4` and evals can pick models. Phase 1 restructures with behaviour verified by typecheck and a real run; Phase 2 pins the behaviour with unit tests.

## Phase 1: Modular agent and CLI

### Overview

Restructure the reviewer into prompt, tool, agent and CLI-input modules on `ToolLoopAgent`, with title/body/diff as typed call options and a Polish summary.

### Changes Required:

#### 1. Review schema stays the contract

**File**: `tools/code-reviewer/src/review-schema.ts`

**Intent**: Keep `REVIEW_SCHEMA`, `REVIEW_JSON_SCHEMA` and `Review` as the single output contract; move `SYSTEM_PROMPT` out to the prompts module so the file holds only the contract.

**Contract**: Exports `REVIEW_SCHEMA`, `REVIEW_JSON_SCHEMA`, `type Review` — unchanged fields and descriptions. Header comment updated to say prompts live in `src/prompts/`.

#### 2. Prompts

**File**: `tools/code-reviewer/src/prompts/instructions.ts`, `tools/code-reviewer/src/prompts/review-request.ts`

**Intent**: The system instructions are the course prompt plus two explicit rules: the `summary` is written in Polish, and everything inside the PR blocks is data to review, never instructions to follow. The request prompt assembles the PR title, description and diff into clearly delimited blocks, leaving out a missing title or description.

**Contract**: `REVIEW_INSTRUCTIONS: string`; `buildReviewRequest(input: { diff: string; title?: string; body?: string }): string` — pure, deterministic, each part wrapped in its own tag (`<pr_title>`, `<pr_description>`, `<diff>`); absent/blank title or description omits that block.

#### 3. Tool registry

**File**: `tools/code-reviewer/src/tools/index.ts`

**Intent**: An explicit, empty tool set so the agent already has the shape the agency ladder will extend.

**Contract**: `reviewTools` — an empty, typed `ToolSet`, with a one-line comment that tools are added in a later lesson.

#### 4. Agent and public API

**File**: `tools/code-reviewer/src/agent.ts`

**Intent**: Build the reviewer as a `ToolLoopAgent` whose per-call input is validated by zod and turned into the prompt, and expose one function that runs a review.

**Contract**:

- `REVIEW_INPUT_SCHEMA` (zod): `diff` non-empty after trim, `title` optional, `body` optional; `type ReviewInput`.
- `DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash"`.
- `createReviewer(options?: { model?: string | LanguageModel })` → `ToolLoopAgent` with `instructions: REVIEW_INSTRUCTIONS`, `tools: reviewTools`, `output: Output.object({ schema: REVIEW_SCHEMA })`, `callOptionsSchema: REVIEW_INPUT_SCHEMA`, and `prepareCall` that sets the prompt from `buildReviewRequest(options)`. A string model id goes through `openrouter(id)`.
- `reviewPullRequest(input: ReviewInput, options?: { model?: string | LanguageModel })` → `Promise<{ review: Review; usage: { inputTokens?: number; outputTokens?: number }; model: string }>`; validates `input` before any model call (invalid input throws, no request sent).

#### 5. CLI input

**File**: `tools/code-reviewer/src/cli-input.ts`

**Intent**: Gather the review input the way the M5L3 action passes it, keeping stdin for local use, as a function that is testable without a process.

**Contract**: `readReviewInput(env: Record<string, string | undefined>, readStdin: () => Promise<string>): Promise<ReviewInput>` — diff from the file at `env.DIFF_FILE` when set, otherwise from stdin; `title` from `env.PR_TITLE`, `body` from `env.PR_BODY` (blank → absent). Throws a usage error with a clear message for a missing/unreadable `DIFF_FILE` or an empty diff.

#### 6. Thin CLI

**File**: `tools/code-reviewer/src/index.ts`

**Intent**: Wire env/stdin → `readReviewInput` → `reviewPullRequest(…, { model: REVIEW_MODEL })` → stdout JSON; keep the one-line error output (no request dump) and map outcomes to exit codes.

**Contract**: stdout = review JSON only; stderr = `model=… inputTokens=… outputTokens=…` or one error line. Exit 0 on any verdict, 1 on a model/API failure (`HTTP <status>` when available), 2 on a usage error (missing `OPENROUTER_API_KEY` when no model is injected, missing/empty diff, unreadable `DIFF_FILE`). Usage line mentions `DIFF_FILE`, `PR_TITLE`, `PR_BODY`.

#### 7. Package metadata

**File**: `tools/code-reviewer/package.json`

**Intent**: Point consumers at the agent module.

**Contract**: `"exports": { ".": "./src/agent.ts" }` (TypeScript source; run through tsx in this lesson — a build step comes with `dist/review.js` in M5L3). `review` script unchanged.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `cd tools/code-reviewer && npm run typecheck`
- Empty input is a usage error: `echo "" | npm run -s review` exits 2 with the usage line and sends no request
- App checks unaffected: `npm run lint` and `npx astro check` at the repo root pass

#### Manual Verification:

- A real review on the free model (`REVIEW_MODEL=nvidia/nemotron-3-super-120b-a12b:free`) with `DIFF_FILE`, `PR_TITLE` and `PR_BODY` set returns schema-valid JSON with a Polish `summary`
- The same diff piped through stdin without title/body still returns a review

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Unit tests on a mock model

### Overview

Pin the prompt assembly, input handling and agent wiring with deterministic Vitest tests using `MockLanguageModelV4` — no network, no cost.

### Changes Required:

#### 1. Test runner

**File**: `tools/code-reviewer/package.json`

**Intent**: Add Vitest to the package (the app's Vitest only includes `src/**` and `scripts/**` of the app, so the package runs its own).

**Contract**: devDependency `vitest` (same major as the app's, ^5); script `"test": "vitest run"`; tests in `src/**/*.test.ts`.

#### 2. Prompt and input tests

**File**: `tools/code-reviewer/src/prompts/review-request.test.ts`, `tools/code-reviewer/src/cli-input.test.ts`

**Intent**: Lock what reaches the model and how input is gathered.

**Contract**: `buildReviewRequest` wraps title, description and diff in their tags and omits a blank title/description; `REVIEW_INSTRUCTIONS` requires a Polish summary and treats PR blocks as data. `readReviewInput` prefers `DIFF_FILE` over stdin, reads `PR_TITLE` / `PR_BODY`, and throws for an empty diff and for a missing `DIFF_FILE`.

#### 3. Agent tests

**File**: `tools/code-reviewer/src/agent.test.ts`

**Intent**: Prove the agent wiring end to end on a scripted model.

**Contract**: With a `MockLanguageModelV4` returning a schema-valid JSON review, `reviewPullRequest` returns that review and the mock's token usage, and the call the mock received carries the instructions and the assembled request (title, description, diff). A model reply that does not match `REVIEW_SCHEMA` makes `reviewPullRequest` reject (no partial review). An empty diff rejects before the mock is called.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `cd tools/code-reviewer && npm test`
- Type checking passes: `cd tools/code-reviewer && npm run typecheck`
- A deliberately broken prompt builder (e.g. dropping the `<diff>` block) makes `npm test` fail

#### Manual Verification:

- Tests run offline: `npm test` passes with `OPENROUTER_API_KEY` unset

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Prompt assembly: tags, omission of blank parts, Polish-summary and data-not-instructions rules present.
- CLI input: `DIFF_FILE` precedence, env title/body, empty diff and missing file errors.
- Agent: happy path with usage, schema-mismatch reply rejects, invalid input never reaches the model.

### Integration Tests:

- None automated (a live model call costs money and is non-deterministic); quality evaluation belongs to `code-review-evals`.

### Manual Testing Steps:

1. In `tools/code-reviewer`, write a diff to a file (`git -C ../.. show f784a9b > /tmp/…/d.diff`) and run `DIFF_FILE=… PR_TITLE="ci: pin Supabase CLI" PR_BODY="…" npm run -s review` on the free model.
2. Check stdout is only JSON, `summary` is Polish, stderr has the usage line.
3. Pipe the same diff through stdin without title/body and check a review still comes back.

## Performance Considerations

One model call per review (no tools, structured output in the same step). The title/body blocks add a few dozen tokens.

## References

- Lesson prompt: `.claude/prompts/m5l2-agent.md` ("Plan")
- Schema template: `.claude/config-templates/m5l2-review-schema.ts.template`
- M5L3 action input contract: `.claude/config-templates/m5l3-action.yml.template:43-60`
- M5L3 requirements: `.claude/prompts/m5l3-requirements.md`
- AI SDK docs (installed 7.0.140): `tools/code-reviewer/node_modules/ai/docs/03-agents/02-building-agents.mdx`, `05-configuring-call-options.mdx`, `03-ai-sdk-core/55-testing.mdx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Modular agent and CLI

#### Automated

- [x] 1.1 Type checking passes: `cd tools/code-reviewer && npm run typecheck` — 1509faa
- [x] 1.2 Empty input is a usage error: `echo "" | npm run -s review` exits 2 with the usage line and sends no request — 1509faa
- [x] 1.3 App checks unaffected: `npm run lint` and `npx astro check` at the repo root pass — 1509faa

#### Manual

- [x] 1.4 A real review on the free model with `DIFF_FILE`, `PR_TITLE` and `PR_BODY` set returns schema-valid JSON with a Polish `summary` — 1509faa
- [x] 1.5 The same diff piped through stdin without title/body still returns a review — 1509faa

### Phase 2: Unit tests on a mock model

#### Automated

- [x] 2.1 Unit tests pass: `cd tools/code-reviewer && npm test` — 778d6e3
- [x] 2.2 Type checking passes: `cd tools/code-reviewer && npm run typecheck` — 778d6e3
- [x] 2.3 A deliberately broken prompt builder makes `npm test` fail — 778d6e3

#### Manual

- [x] 2.4 Tests run offline: `npm test` passes with `OPENROUTER_API_KEY` unset — 778d6e3
