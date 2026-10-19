# Code-review evals (promptfoo)

Runs the code-review agent's prompt on three OpenRouter models against one hard pull request and checks each review. It is course lesson M5L3 (change `context/changes/code-review-evals/`).

What this measures:

- **Covered:** the prompt and schema, meaning the system instructions, the user message and the strict JSON-schema response format. The agent sends all three the same way in CI.
- **Not covered:** the AI SDK agent loop and its tools. promptfoo calls the models directly through its own `openrouter:` provider.

## Run

Requires Node `>= 22.22.0` (promptfoo's minimum; the repo's `.nvmrc` is the app's and older).

```sh
cd tools/code-reviewer/evals
npm ci            # promptfoo 0.124.1, pinned (large: ~1.4 GB of node_modules, kept out of the reviewer's own install)
npm run eval      # 3 models × 1 test; table in the terminal, JSON in results/latest.json
npm run view      # local web UI with prompts, outputs and grader reasons
```

- **Key:** `OPENROUTER_API_KEY` is read from `tools/code-reviewer/.env`, the same file the agent's CLI uses.
- **Credits pre-flight:** `npm run eval` first runs `npm run preflight -- --require-credits` in `tools/code-reviewer` and stops before promptfoo when the OpenRouter account or key has no credits left (an unreachable credits API only warns).
- **Cost:** a run costs a few cents, mostly for the grader (`anthropic/claude-sonnet-5.5`).
- **Fresh results:** `--no-cache` is set, so every run calls the models again.
- **Provider overrides:** `promptfooconfig.yaml` sets `showThinking: false` and `max_tokens: 16384` for all three models. Without them, promptfoo prepends "Thinking: …" to the answer (so the JSON assertions fail) and cuts reasoning models off at 1024 tokens. Either way it would measure the setup, not the model. The agent's AI SDK call does neither.
- **Install:** plain `npm ci`. `--omit=optional` drops the native libsql binding and promptfoo refuses to start.
- **Audit:** `npm audit` reports known high findings in promptfoo's transitive dependencies (`basic-ftp`, `braces`, `node-forge`). They are not reachable from this local, fixed-input run, and none of them reaches the CI review action. Bump promptfoo when a release clears them; never run `npm audit fix --force`, which breaks the pin.
- **Telemetry:** telemetry and the update check are off. Never use `--share`.
- **`npm run view` listens on every network interface** (promptfoo 0.124.1 binds port 15500 without a host), so anyone who can reach the box can read the prompts, outputs and eval history. On a remote box, keep 15500 closed to the outside and open the UI through an SSH tunnel: `ssh -L 15500:localhost:15500 <box>`, then http://localhost:15500. Answer `N` to "Open URL in browser?" and stop the server (Ctrl+C) when done.
- **Exit codes:**
  - `0`: every assertion passed.
  - `100`: at least one assertion failed. That is an eval result, not a setup error.
  - Anything else, or a provider error in the table: fix the setup (key, model id, response format).

## Files

| File                                  | What it is                                                                                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `promptfooconfig.yaml`                | Providers (`z-ai/glm-5.3`, `deepseek/deepseek-v4.1-flash`, `openai/gpt-5.6-luna`), the grader and the test with its three assertions: `is-json` against the schema, `llm-rubric` and `verdict === "fail"` |
| `prompts/review.json`                 | **Generated.** Chat prompt: system = `REVIEW_INSTRUCTIONS`, user = `buildReviewRequest()` with `{{diff}}`                                                                                                 |
| `schema.json`, `response-format.json` | **Generated.** The review's JSON Schema, and the strict `response_format` built from it                                                                                                                   |
| `fixtures/react19-migration.diff`     | A React 16 → 19 migration (class component → hooks, `createRoot`, Enzyme → Testing Library) with three planted flaws                                                                                      |

## Changing the prompt or schema

Edit `src/prompts/` or `src/review-schema.ts` in `tools/code-reviewer`, then run `npm run eval:sync` there. It rewrites the generated files, and its test (`src/prompts/promptfoo.test.ts`, also in CI) fails until you do.

## Fixture rules

- **No hints about the flaws.** No comments such as "bug", "leak" or "forgot", and no telling names. Otherwise the eval measures reading, not reviewing.
- **No `{{`, `{%` or `{#` anywhere.** promptfoo resolves Nunjucks syntax inside vars too, so JSX such as `style={{…}}` would be mangled.
- **Keep it a valid unified diff.** Build it in a scratch git repo with `git diff`.

The three planted flaws, which are also spelled out in the rubric:

1. **Effect dependencies.** The effect has an empty dependency array, so a `userId` change no longer refetches or resubscribes.
2. **Missing cleanup.** The effect returns no cleanup, so the stream subscription leaks.
3. **Ignored defaults.** `defaultProps` stays on the function component, React 19 ignores it, and the request asks for `limit=undefined`.
