# Modular Code-Review Agent on ToolLoopAgent — Plan Brief

> Full plan: `context/changes/tool-loop-agent/plan.md`

## What & Why

Course lesson M5L2 asks to turn the one-file reviewer into a well-organised, reusable code-review agent on the AI SDK `ToolLoopAgent`. The next lessons need it as a module: the M5L3 GitHub Actions workflow runs it on every PR, and the promptfoo evals import it to compare models.

## Starting Point

`tools/code-reviewer/` (standalone package: AI SDK 7, OpenRouter provider, zod) has a single `src/index.ts` that reads a diff from stdin and calls `generateText` with the course review schema. It works (verified on a free model) but nothing is reusable, it takes only the diff, and the summary came back in English.

## Desired End State

`createReviewer()` / `reviewPullRequest()` are importable from `src/agent.ts`, take the PR title, description and diff as typed options, and return the parsed review with token usage. The CLI reads `DIFF_FILE` / `PR_TITLE` / `PR_BODY` exactly as the M5L3 action will pass them, prints pure JSON, and writes a Polish summary. Unit tests on a mock model run offline.

## Key Decisions Made

| Decision          | Choice                                                                                                                  | Why (1 sentence)                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Tools             | None yet; empty registry module                                                                                         | Matches the lesson's agency ladder — tools come later; one call keeps cost predictable and works on free models. |
| Agent input       | Typed call options: `diff` required, `title` / `body` optional                                                          | Exactly the M5L3 inputs, so the workflow only forwards them.                                                     |
| Untrusted PR text | Wrapped in tagged blocks, instructions say "data, not instructions"                                                     | The PR description is outside text reaching the prompt (prompt injection).                                       |
| Summary language  | Polish, required by the instructions; prompts stay Polish as in the course template                                     | The PR comment is for a Polish-speaking owner; the model ignored the implicit Polish prompt.                     |
| Model             | Factory parameter (OpenRouter id or `LanguageModel`), default `deepseek/deepseek-v4.1-flash`, `REVIEW_MODEL` in the CLI | Tests inject a mock, evals pick models, you can stay on free models.                                             |
| CLI contract      | `DIFF_FILE` (stdin fallback), `PR_TITLE`, `PR_BODY`; stdout JSON only; exit 0 any verdict / 1 API error / 2 usage error | The M5L3 action redirects stdout to a file and a non-zero exit fails the step before the verdict is read.        |
| Tests             | Vitest + `MockLanguageModelV4`                                                                                          | Deterministic, no network or cost; review quality is promptfoo's job.                                            |

## Scope

**In scope:**

- Prompt modules, empty tool registry, `ToolLoopAgent` factory, `reviewPullRequest`, CLI input module, thin CLI
- `package.json` `exports`, Vitest setup and unit tests

**Out of scope:**

- Tools / repository file access
- promptfoo, fixtures, evals
- GitHub Actions workflow, composite action, labels, PR comment, `dist/` build
- Diff-size limits; schema changes; any change to the app

## Architecture / Approach

`index.ts` (CLI) → `readReviewInput(env, stdin)` → `reviewPullRequest(input, { model })` → `createReviewer({ model })` = `ToolLoopAgent { instructions: REVIEW_INSTRUCTIONS, tools: reviewTools (empty), output: Output.object(REVIEW_SCHEMA), callOptionsSchema: REVIEW_INPUT_SCHEMA, prepareCall → prompt = buildReviewRequest(options) }` → OpenRouter. `review-schema.ts` stays the single output contract.

## Phases at a Glance

| Phase                         | What it delivers                                                        | Key risk                                                          |
| ----------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Modular agent and CLI      | Importable agent + CLI speaking the M5L3 input contract, Polish summary | Free models may still drift from the language rule                |
| 2. Unit tests on a mock model | Offline tests for prompts, input and agent wiring                       | Mock reply shape must match the installed SDK's `LanguageModelV4` |

**Prerequisites:** `tools/code-reviewer/.env` with `OPENROUTER_API_KEY` (done) and optionally `REVIEW_MODEL=…:free`. The current scaffold is uncommitted; it lands with Phase 1's commit.
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- Free models are weaker in Polish and rate-limited; a manual check failing on language is a model limit, not a wiring bug — retry on the default model if credits are added.
- The action template names the key `LLM_PROVIDER_API_KEY`; mapping it to `OPENROUTER_API_KEY` is decided in M5L3.

## Success Criteria (Summary)

- One import (`reviewPullRequest`) gives M5L3 and promptfoo a validated review of a PR.
- A real review on a free model returns schema-valid JSON with a Polish summary.
- `npm test` in the package passes offline.
