# Eval results — first baseline (2026-10-14)

- **Run:** `eval-mox-2026-10-14T15:59:08`, `npm run eval` in `tools/code-reviewer/evals`. Exit code 100 means some assertions failed; that is an eval result, not a setup error.
- **Versions:**
  - promptfoo 0.124.1;
  - code at `6022ba3`, plus the config fix below;
  - prompt and schema generated from `tools/code-reviewer/src/prompts/` and `src/review-schema.ts`.
- **Test:** `React 16 -> 19 migration with three planted flaws` (`fixtures/react19-migration.diff`, 212 lines, 4 files).
- **Grader:** `openrouter:anthropic/claude-sonnet-5.5`.

## Results

| Model                          | is-json | llm-rubric (score) | verdict = fail | Verdict | Tokens (prompt / completion, of which reasoning) | Cost (model) | Latency |
| ------------------------------ | ------- | ------------------ | -------------- | ------- | ------------------------------------------------ | ------------ | ------- |
| `z-ai/glm-5.3`                 | pass    | **fail** (0.3)     | pass           | fail    | 2003 / 4036 (3813)                               | $0.0180      | 65.7 s  |
| `deepseek/deepseek-v4.1-flash` | pass    | **pass** (0.9)     | pass           | fail    | 3509 / 2136 (1749)                               | $0.0013      | 13.1 s  |
| `openai/gpt-5.6-luna`          | pass    | **fail** (0.3)     | pass           | fail    | 2773 / 547 (344)                                 | $0.0007      | 6.2 s   |

- **Total:** 1 of 3 test cells passed.
- **Grader usage:** 3 calls, 3044 prompt + 1379 completion tokens, about $0.02 at $2 / $10 per M.
- **Run cost:** about $0.04 in total.

## Grader reasons (excerpts)

- **glm-5.3:** "The summary mentions all three defects, but the rubric requires each to come with the specific consequence it names." The `userId` regression is described only vaguely; the leak is named, but not the setState-after-unmount consequence.
- **deepseek-v4.1-flash:** "It identifies all three defects with consequences". It names `[userId, pageSize]`, `unsubscribe()` and `limit=undefined`, including `slice(0, undefined)`.
- **gpt-5.6-luna:** "The review covers the empty dependency array … and the missing cleanup … However, for defaultProps it only recommends a default parameter value. It never says defaultProps is ignored by React 19".

## Observations

- **Structure and verdict.** All three models returned valid JSON in the strict schema and the binding `fail` verdict. On this diff, the CI gate would block the PR whichever of the three runs it.
- **Which flaws were found.** All three models found flaws 1 (effect dependencies) and 2 (missing cleanup).
  - Flaw 3 (`defaultProps` ignored in React 19) separates them. DeepSeek explains its consequence. GLM names it with a consequence ("pageSize będzie undefined") but is marked down on 1 and 2. Luna only recommends moving the default without saying why.
- **The rubric is strict.** It demands a consequence for every flaw. GLM's summary arguably meets the bar, and the grader called its wording "arguably a consequence" yet still failed it. Two things are worth watching on later runs:
  - grader variance (no `--repeat` yet);
  - the prompt's 2–3-sentence summary limit, which works against naming three flaws with consequences. DeepSeek ignored the limit and wrote 4 long sentences.
- **Cost and speed.** DeepSeek v4.1 Flash, the agent's `DEFAULT_MODEL`, was the best reviewer here at a mid price ($0.0013). GLM was the slowest (66 s, 3.8 k reasoning tokens) and the most expensive.

## Setup fixes found by the first run

Before this baseline, two runs did not measure the models:

1. **No credits:** OpenRouter answered 402 until the account was topped up.
2. **Wrong output and truncation:** promptfoo's OpenRouter provider defaults made the output differ from what the agent gets through the AI SDK.
   - `showThinking: true` prepended "Thinking: …" to the answer, so `is-json` failed for every model.
   - `max_tokens: 1024` cut DeepSeek off mid-reasoning.

   Fixed in `promptfooconfig.yaml` with `showThinking: false` and `max_tokens: 16384`. Prompt, schema, fixture and rubric are unchanged.
