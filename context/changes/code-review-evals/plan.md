# promptfoo Evals of the Code-Review Prompt Across Models — Implementation Plan

## Overview

Add a first promptfoo evaluation to `tools/code-reviewer`. It sends the agent's code-review prompt to three OpenRouter models (`z-ai/glm-5.3`, `deepseek/deepseek-v4.1-flash`, `openai/gpt-5.6-luna`) with one deliberately broken React 16 → 19 migration diff. Each review is checked three ways: its JSON is valid against the review schema, an LLM judge confirms it names the three planted flaws, and a static assertion requires `verdict === "fail"`. This is course lesson M5L3, second part (`.claude/prompts/m5l3-promptfoo.md`), starting from `.claude/config-templates/m5l3-promptfooconfig.yaml.template`.

## Current State Analysis

- The agent is importable and its prompt lives in code:
  - `REVIEW_INSTRUCTIONS` (system prompt): `tools/code-reviewer/src/prompts/instructions.ts:3-13`.
  - `buildReviewRequest()` (user message with `<pr_title>`/`<pr_description>`/`<diff>` blocks): `src/prompts/review-request.ts:8-14`.
  - `REVIEW_SCHEMA` and `REVIEW_JSON_SCHEMA` (draft-07): `src/review-schema.ts:9-57`.
  - All of these are re-exported from `src/agent.ts:10-12`.
- In CI the agent sends the system prompt as the system role, the request as the user message, and `response_format: json_schema, strict: true, name: "response"`. Sources: `src/agent.ts:43-57` and `node_modules/@openrouter/ai-sdk-provider/dist/index.js:4299-4308`.
- There is no eval setup yet. The `tool-loop-agent` and `ci-cd-code-review` plans deferred it to this change.
- The owner chose the course template's wiring: native `openrouter:` providers plus a prompt file, not a custom provider around `reviewPullRequest()`.
- Constraints:
  - promptfoo `0.124.1` (latest, 2026-10-08) needs Node `>=22.22.0`.
  - It is heavy: about 32 MB, with native `@libsql/client` and 27 optional deps.
  - The reviewer's CI job and the PR review action both run `npm ci` in `tools/code-reviewer`.
- The four model ids exist on OpenRouter as of 2026-10-14. All four list `structured_outputs` and `response_format`; `gpt-5.6-luna` and `claude-sonnet-5.5` do not list `temperature` (checked via `https://openrouter.ai/api/v1/models`).

## Desired End State

- `tools/code-reviewer/evals/` is a self-contained package:
  - promptfoo pinned in its own lockfile;
  - `promptfooconfig.yaml`;
  - a generated chat prompt and schema files;
  - one fixture diff;
  - a README.
- Inside it, `npm run eval` runs 3 providers × 1 test with the key from `tools/code-reviewer/.env`.
- The prompt and schema files used by promptfoo are generated from the agent's TS source. A Vitest test in `tools/code-reviewer` fails, in CI too, when they drift.
- The first run's results are recorded in `context/changes/code-review-evals/eval-results.md`.

### Key Discoveries:

- **JSON chat prompts are safe for raw diffs.** promptfoo's `renderPrompt` parses a JSON prompt and renders each string value separately (JSON auto-escape), so quotes and newlines in the diff do not break it. Source: `promptfoo@0.124.1` `dist/src/evaluatorHelpers-*.js` (`renderPrompt`, `PROMPTFOO_DISABLE_JSON_AUTOESCAPE` branch).
- **Template syntax inside the diff is not safe.** promptfoo also resolves Nunjucks references _inside vars_ (`resolveVariables`) and strips one trailing newline from string vars. The fixture must therefore not contain `{{`, `{%` or `{#`. In JSX that means no `style={{…}}` and no object literals directly in braces.
- **Two CLI behaviours to rely on:** `promptfoo eval` accepts `--env-file <path>`, and it exits with `PROMPTFOO_FAILED_TEST_EXIT_CODE` (default 100) when an assertion fails. Source: `dist/src/main.js`.
- **The OpenRouter provider returns a string**, so the `javascript` assertion parses it: `JSON.parse(output).verdict === "fail"`. Source: research §promptfoo fit.
- **No default grader for OpenRouter.** promptfoo's default grader list has no OpenRouter entry, so `defaultTest.options.provider` must name the grader. Source: research.
- **What the root tooling sees:**
  - Root ESLint ignores `tools/code-reviewer/` (`eslint.config.js:99`).
  - lint-staged runs `prettier --write` on staged `*.json`, so generated JSON may be reformatted on commit. The drift test therefore compares parsed JSON, not bytes.
  - `.diff` and `.yaml` are not in lint-staged.

## What We're NOT Doing

- No custom promptfoo provider around `reviewPullRequest()`. The owner chose the template wiring, so the eval measures the prompt and schema, not the AI SDK agent loop or its tools.
- No second test case. The template's SQL-injection case is dropped because the lesson asks for one diff.
- No `pr_title` / `pr_description` vars: the user message carries only the `<diff>` block.
- No evals in CI or in the PR review workflow. Each run costs money and is non-deterministic, so it stays a manual `npm run eval`.
- No change to the agent's prompt, schema, default model, CLI or CI workflows.
- No `--share` or Promptfoo Cloud login. Telemetry and update checks are disabled in the npm scripts.
- No change to the root `.nvmrc` (22.14.0, the app's). The Node requirement for evals lives in `evals/package.json` `engines` and the README.

## Implementation Approach

The prompt and schema have one source of truth, the agent's TS modules. A small pure builder turns them into the shapes promptfoo reads, and a sync script writes those shapes into `evals/`. A unit test in `tools/code-reviewer` compares the files with the builder output, so the existing `code-reviewer` CI job catches drift. The evals package then follows the course template, with three adjustments: chat JSON instead of `review.txt`, strict `response_format` like the agent, and a single test. The first live run comes last, and its numbers are recorded, not asserted.

## Critical Implementation Details

- **The fixture must not hint at its flaws.** No comments such as "BUG" or "forgot cleanup", and no file names that give them away. Otherwise the eval measures reading, not review.
- **Diff hygiene:** keep it a valid unified diff with `diff --git` headers and plausible hunk ranges, and keep it free of `{{`, `{%` and `{#` (see Key Discoveries).
- **This change's own PR will be reviewed by the AI review workflow.** The PR adds a fixture full of intentionally broken React code, so the reviewer may return `fail` on it. The owner can bypass the ruleset on `main` or push directly. Say so in the PR description if a PR is used.

## Phase 1: Prompt and Schema Generated from the Agent, with a Drift Test

### Overview

Derive promptfoo's prompt and schema files from the agent's source and make drift a failing unit test.

### Changes Required:

#### 1. Pure builder for promptfoo artifacts

**File**: `tools/code-reviewer/src/prompts/promptfoo.ts`

**Intent**: Produce, from `REVIEW_INSTRUCTIONS`, `buildReviewRequest()` and `REVIEW_JSON_SCHEMA`, the exact objects promptfoo needs. The models then receive the same system/user split and the same strict schema as the agent in CI.

**Contract**:

- `buildPromptfooChat()` returns `[{ role: "system", content: REVIEW_INSTRUCTIONS }, { role: "user", content: buildReviewRequest({ diff: "{{diff}}" }) }]`.
- `buildPromptfooSchema()` returns `REVIEW_JSON_SCHEMA` without the top-level `$schema` key (metadata, not a constraint).
- `buildPromptfooResponseFormat()` returns `{ type: "json_schema", json_schema: { name: "response", strict: true, schema: buildPromptfooSchema() } }`, mirroring the OpenRouter SDK provider.
- Pure functions, no I/O.

#### 2. Sync script

**File**: `tools/code-reviewer/src/eval-sync.ts`, `tools/code-reviewer/package.json` (script)

**Intent**: Write the three builder outputs into the evals package, so a prompt change takes one command to propagate.

**Contract**:

- `npm run eval:sync` runs `tsx src/eval-sync.ts`.
- It writes `evals/prompts/review.json` (chat), `evals/schema.json` (schema) and `evals/response-format.json` (response format) as 2-space JSON with a trailing newline.
- It prints the written paths.
- No other side effects.

#### 3. Drift test

**File**: `tools/code-reviewer/src/prompts/promptfoo.test.ts`

**Intent**: Fail `npm test` (locally and in the `code-reviewer` CI job) when the committed eval files no longer match the agent's prompt or schema, and pin the Nunjucks safety of the prompt.

**Contract**:

- For each of the three files, `JSON.parse` the file content and compare it with `toEqual` against the builder output. The failure message names `npm run eval:sync`.
- The user message contains `{{diff}}` exactly once.
- The system message contains none of `{{`, `{%`, `{#`.
- Files are resolved relative to the test file (`import.meta.url`).

### Success Criteria:

#### Automated Verification:

- `npm run eval:sync` in `tools/code-reviewer` writes the three files under `evals/`
- `npm test` in `tools/code-reviewer` passes, including the new drift test
- Editing one word in `evals/prompts/review.json` makes `npm test` fail with a message naming `npm run eval:sync`; reverting makes it pass
- `npm run typecheck` in `tools/code-reviewer` passes
- `npm run build` in `tools/code-reviewer` still produces `dist/review.js` (the CLI bundle is unaffected)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 2: Evals Package, promptfoo Config and the React 19 Fixture

### Overview

Create `tools/code-reviewer/evals/` from the course template: pinned promptfoo, a config with 3 models + grader + 3 assertions, the planted-flaw fixture, and docs.

### Changes Required:

#### 1. Evals package

**File**: `tools/code-reviewer/evals/package.json`, `tools/code-reviewer/evals/package-lock.json`, `tools/code-reviewer/evals/.gitignore`

**Intent**: Isolate promptfoo, so the reviewer's CI job and the PR review action keep their lean installs.

**Contract**:

- `private: true`, `type: "module"`, `engines.node: ">=22.22.0"`.
- devDependency `promptfoo` pinned exactly to `0.124.1`.
- Scripts:
  - `eval`: `PROMPTFOO_DISABLE_TELEMETRY=1 PROMPTFOO_DISABLE_UPDATE=1 promptfoo eval -c promptfooconfig.yaml --env-file ../.env --no-cache -o results/latest.json`
  - `view`: `promptfoo view`, with the same two env vars.
- Install with `npm install --omit=optional`. If npm's `allowScripts` blocks a needed install script, allow only that package and version, following the reviewer's `package.json`.
  - _Implementation note (2026-10-14): `--omit=optional` drops the native `@libsql/linux-x64-gnu` binding, an optional dependency, and promptfoo then refuses to start. Installed with plain `npm install` / `npm ci` instead; criterion 2.1 was verified with `npm ci`. No install script is needed: esbuild's postinstall warning is harmless because promptfoo loads no `.ts` files here._
- `.gitignore`: `results/`.

#### 2. promptfoo configuration

**File**: `tools/code-reviewer/evals/promptfooconfig.yaml`

**Intent**: The course template adapted to the decisions:

- three OpenRouter models with the agent's strict response format;
- the generated chat prompt;
- `anthropic/claude-sonnet-5.5` as the `llm-rubric` grader;
- one test with `is-json`, `llm-rubric` and `javascript` assertions.

**Contract**:

- `providers`: `openrouter:z-ai/glm-5.3`, `openrouter:deepseek/deepseek-v4.1-flash`, `openrouter:openai/gpt-5.6-luna`, each with a short `label`. They share one `config` (YAML anchor) with `response_format: file://response-format.json` and no `temperature`, matching the agent, which sets none.
- `prompts`: `file://prompts/review.json`.
- `defaultTest.options.provider`: `openrouter:anthropic/claude-sonnet-5.5`.
- One test, `React 16 -> 19 migration with three planted flaws`, with `vars.diff: file://fixtures/react19-migration.diff` and these assertions:
  - `is-json` with `value: file://schema.json`.
  - `llm-rubric` that names all three flaws (below). It notes that the summary is in Polish, and passes only if each flaw is identified with why it breaks the component.
  - `javascript`: `JSON.parse(output).verdict === "fail"`.
- A header comment states:
  - how to run it;
  - that the prompt and schema files are generated (`npm run eval:sync` in `tools/code-reviewer`);
  - the Node requirement.

#### 3. Fixture: React 16 → 19 migration with three planted flaws

**File**: `tools/code-reviewer/evals/fixtures/react19-migration.diff`

**Intent**: One realistic, "rather complex" PR diff (roughly 120–200 lines). It rewrites a React 16 class component that fetches a user's activity and subscribes to a live stream into a React 19 function component with hooks. Around it, it makes correct upgrade changes: `react`/`react-dom` 16.14 → 19.x in `package.json`, and `ReactDOM.render` → `createRoot` in the entry file. The correct parts make the three flaws impactful, not the only change.

**Contract**:

- **Flaw 1 (effect dependencies):**
  - Before: `componentDidUpdate` refetched and resubscribed when `prevProps.userId !== this.props.userId`.
  - After: the effect runs with `[]` dependencies, so changing `userId` keeps showing the previous user's data.
- **Flaw 2 (cleanup lost):**
  - Before: `componentWillUnmount` unsubscribed from the stream.
  - After: the effect returns no cleanup, so the subscription leaks and updates state after unmount or after a user switch.
- **Flaw 3 (defaultProps):**
  - Before: `static defaultProps = { pageSize: 20 }`.
  - After: `UserActivityFeed.defaultProps = { pageSize: 20 }` on the function component. React 19 ignores it, so `pageSize` is `undefined` and the request asks for `limit=undefined`.
- No hints in comments, and no `{{`, `{%` or `{#` anywhere.

#### 4. Documentation

**File**: `tools/code-reviewer/evals/README.md`, `CLAUDE.md`

**Intent**: Explain how to run and maintain the evals, and point agents at them.

**Contract**:

- README covers:
  - purpose and what is measured (prompt + schema, not the agent loop);
  - Node `>=22.22.0`;
  - `npm ci --omit=optional`, then `npm run eval` and `npm run view`;
  - the key comes from `tools/code-reviewer/.env`;
  - regenerating the prompt files with `npm run eval:sync` (the drift test enforces it);
  - the fixture rules (no hints, no Nunjucks syntax);
  - cost per run is about cents, mostly the grader;
  - exit code 100 means an assertion failed, which is an eval result, not a setup error.
- `CLAUDE.md` gets one line in **Commands** for `tools/code-reviewer/evals`: manual promptfoo evals, not in CI, key from `tools/code-reviewer/.env`.

### Success Criteria:

#### Automated Verification:

- `npm ci --omit=optional` in `tools/code-reviewer/evals` succeeds from the committed lockfile
- `npx promptfoo --version` in `tools/code-reviewer/evals` prints `0.124.1`
- `npx promptfoo validate -c promptfooconfig.yaml` in `tools/code-reviewer/evals` reports a valid config
- The fixture contains none of `{{`, `{%`, `{#`: `grep -nE '\{\{|\{%|\{#' tools/code-reviewer/evals/fixtures/react19-migration.diff` prints nothing
- `git apply --check` of the fixture on an empty scratch repo accepts it (valid unified diff), or, for hunks modifying existing files, `git apply --stat` parses it without errors
- `npm test` and `npm run typecheck` in `tools/code-reviewer` still pass
- `npm run lint` at the repo root still passes

#### Manual Verification:

- Owner reads the fixture and agrees that each of the three flaws is impactful and that the diff gives no hints
- Owner reads the rubric text and agrees that it describes the three flaws precisely enough to judge

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 3: First Live Run and Recorded Results

### Overview

Run the eval once against the three real models and record the outcome. Assertion failures are data; only setup or provider errors block.

### Changes Required:

#### 1. Live run

**File**: none (command): `cd tools/code-reviewer/evals && npm run eval`

**Intent**: Produce the first 3 × 1 comparison, with `OPENROUTER_API_KEY` from `tools/code-reviewer/.env`.

**Contract**:

- Exit code 0 (all assertions passed) or 100 (some failed) are both valid outcomes.
- Any provider error is a setup problem to fix before recording: HTTP 4xx/5xx, a rejected `response_format`, an unknown model.
  - _Implementation note (2026-10-14): the first funded run exposed two promptfoo provider defaults: `showThinking: true` ("Thinking: …" prepended, so the output is not JSON) and `max_tokens: 1024` (DeepSeek truncated). Both are now overridden in the shared provider config (`showThinking: false`, `max_tokens: 16384`), so the output matches the agent's. The baseline comes from the run after that fix._

#### 2. Results record

**File**: `context/changes/code-review-evals/eval-results.md`

**Intent**: Keep the first baseline readable without the promptfoo local DB.

**Contract**:

- Date and versions: promptfoo, model ids, grader, commit.
- A table with one row per model: pass/fail per assertion (`is-json`, `llm-rubric`, `verdict`), the verdict returned, tokens, cost and latency (as reported by promptfoo).
- A one-line excerpt of the grader's reason per model.
- Short observations, for example which flaw was most often missed.

### Success Criteria:

#### Automated Verification:

- `npm run eval` in `tools/code-reviewer/evals` completes with exit code 0 or 100, and `results/latest.json` lists 3 results, one per provider, with no provider error
- `context/changes/code-review-evals/eval-results.md` exists and has one table row per model (3)

#### Manual Verification:

- In `npm run view`, the rendered prompt for one result shows the system message and the full diff intact
- Owner spot-checks the grader's reasons and agrees the `llm-rubric` verdicts are fair for at least one passing and one failing model, or for all three if all share one outcome

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual checks were successful.

---

## Testing Strategy

### Unit Tests:

- Drift test (Phase 1): the three generated files equal the builder output, compared as parsed JSON.
- Nunjucks safety of the prompt: `{{diff}}` appears once, and the system prompt contains no template syntax.

### Integration Tests:

- `promptfoo validate` on the config (Phase 2) and one live `promptfoo eval` (Phase 3). The live run is manual by design: it costs money and is non-deterministic.

### Manual Testing Steps:

1. `cd tools/code-reviewer && npm run eval:sync && npm test`, which should be green.
2. `cd evals && npm ci --omit=optional && npm run eval` should show a 3-column table with one row.
3. `npm run view` opens the local UI. Open one cell and check the prompt and diff, the JSON review and the grader reason.

## Performance Considerations

One run is 3 review calls plus 3 grader calls on a ~200-line diff. At the 2026-10-14 OpenRouter prices, that is a few cents, dominated by the grader at $2/$10 per M tokens. `--no-cache` makes every run a fresh measurement.

## Migration Notes

Not applicable: no database, no app code, no deploy impact.

## References

- Research: `context/changes/code-review-evals/research.md`
- Course prompt: `.claude/prompts/m5l3-promptfoo.md`; template: `.claude/config-templates/m5l3-promptfooconfig.yaml.template`
- Agent: `tools/code-reviewer/src/agent.ts:43-63`, `src/prompts/instructions.ts:3-13`, `src/prompts/review-request.ts:8-14`, `src/review-schema.ts:9-57`
- Prior changes: `context/changes/tool-loop-agent/plan.md`, `context/changes/ci-cd-code-review/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Prompt and Schema Generated from the Agent, with a Drift Test

#### Automated

- [x] 1.1 `npm run eval:sync` in `tools/code-reviewer` writes the three files under `evals/` — 8c5dc44
- [x] 1.2 `npm test` in `tools/code-reviewer` passes, including the new drift test — 8c5dc44
- [x] 1.3 Editing one word in `evals/prompts/review.json` makes `npm test` fail with a message naming `npm run eval:sync`; reverting makes it pass — 8c5dc44
- [x] 1.4 `npm run typecheck` in `tools/code-reviewer` passes — 8c5dc44
- [x] 1.5 `npm run build` in `tools/code-reviewer` still produces `dist/review.js` (the CLI bundle is unaffected) — 8c5dc44

### Phase 2: Evals Package, promptfoo Config and the React 19 Fixture

#### Automated

- [x] 2.1 `npm ci --omit=optional` in `tools/code-reviewer/evals` succeeds from the committed lockfile
- [x] 2.2 `npx promptfoo --version` in `tools/code-reviewer/evals` prints `0.124.1` — 6022ba3
- [x] 2.3 `npx promptfoo validate -c promptfooconfig.yaml` in `tools/code-reviewer/evals` reports a valid config — 6022ba3
- [x] 2.4 The fixture contains none of `{{`, `{%`, `{#`: `grep -nE '\{\{|\{%|\{#' tools/code-reviewer/evals/fixtures/react19-migration.diff` prints nothing — 6022ba3
- [x] 2.5 `git apply --check` of the fixture on an empty scratch repo accepts it (valid unified diff), or, for hunks modifying existing files, `git apply --stat` parses it without errors — 6022ba3
- [x] 2.6 `npm test` and `npm run typecheck` in `tools/code-reviewer` still pass — 6022ba3
- [x] 2.7 `npm run lint` at the repo root still passes — 6022ba3

#### Manual

- [x] 2.8 Owner reads the fixture and agrees that each of the three flaws is impactful and that the diff gives no hints — 6022ba3
- [x] 2.9 Owner reads the rubric text and agrees that it describes the three flaws precisely enough to judge

### Phase 3: First Live Run and Recorded Results

#### Automated

- [x] 3.1 `npm run eval` in `tools/code-reviewer/evals` completes with exit code 0 or 100, and `results/latest.json` lists 3 results, one per provider, with no provider error
- [x] 3.2 `context/changes/code-review-evals/eval-results.md` exists and has one table row per model (3)

#### Manual

- [x] 3.3 In `npm run view`, the rendered prompt for one result shows the system message and the full diff intact
- [x] 3.4 Owner spot-checks the grader's reasons and agrees the `llm-rubric` verdicts are fair for at least one passing and one failing model, or for all three if all share one outcome
