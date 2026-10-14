# promptfoo Evals of the Code-Review Prompt Across Models — Plan Brief

> Full plan: `context/changes/code-review-evals/plan.md`
> Research: `context/changes/code-review-evals/research.md`

## What & Why

Course lesson M5L3 (part 2) asks for a first promptfoo eval of the code-review prompt. The same prompt goes to three OpenRouter models with one deliberately broken React 16 → 19 migration diff. An LLM judge checks that each review names the three planted flaws, and a static check requires `verdict: "fail"`. This gives us a repeatable way to compare models and to catch prompt regressions.

## Starting Point

`tools/code-reviewer` already has the prompt and schema as TS code: `REVIEW_INSTRUCTIONS`, `buildReviewRequest()` and `REVIEW_SCHEMA`/`REVIEW_JSON_SCHEMA`. CI uses them with a strict JSON-schema response format. There is no eval setup. The course template (`m5l3-promptfooconfig.yaml.template`) gives the starting config.

## Desired End State

`tools/code-reviewer/evals/` is a small standalone package, and `npm run eval` there prints a 3-model × 1-test comparison. The prompt and schema it uses are generated from the agent's source, and a unit test turns CI red if they drift. The first run's numbers are recorded in `eval-results.md`.

## Key Decisions Made

| Decision      | Choice                                                                                                                                    | Why (1 sentence)                                                                                        | Source                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------- |
| Tool          | promptfoo 0.124.1                                                                                                                         | Fits the TS/ESM stack and has a native OpenRouter provider; the alternatives lag on AI SDK 7 / Vitest 5 | Research              |
| Wiring        | Native `openrouter:` providers + prompt file (course template)                                                                            | Owner's choice; measures the prompt and schema rather than the agent loop                               | Owner (post-research) |
| Placement     | Separate `tools/code-reviewer/evals/` package with its own lockfile                                                                       | promptfoo's ~32 MB and native deps never reach the reviewer CI job or the PR review action              | Plan                  |
| Prompt form   | Generated chat JSON (system + user) + strict `response_format` + drift test                                                               | The models get exactly the agent's prompt and schema, and drift fails `npm test`                        | Plan                  |
| Grader        | `openrouter:anthropic/claude-sonnet-5.5`                                                                                                  | Strong judge from a different model family; costs about a cent per run                                  | Plan                  |
| Planted flaws | Effect `[]` deps (no refetch on `userId` change), lost subscription cleanup, `defaultProps` on a function component (ignored in React 19) | Each breaks behaviour, is migration-specific and can be checked by a rubric                             | Plan                  |
| Test cases    | One (SQL-injection case from the template dropped)                                                                                        | The lesson asks for one complex diff                                                                    | Course prompt         |
| CI            | Not run in CI; manual `npm run eval`                                                                                                      | It costs money and is non-deterministic                                                                 | Research              |

## Scope

**In scope:**

- Pure builder + `npm run eval:sync` + drift test in `tools/code-reviewer`
- `evals/` package: pinned promptfoo, `promptfooconfig.yaml`, generated `prompts/review.json`, `schema.json` and `response-format.json`
- The fixture `fixtures/react19-migration.diff`, a README, and one line in CLAUDE.md
- First live run, recorded in `eval-results.md`

**Out of scope:**

- Custom provider around `reviewPullRequest()`
- More test cases, PR title/description vars
- Evals in CI
- Any change to the agent's prompt, schema, CLI or workflows
- Promptfoo Cloud / `--share`
- The root `.nvmrc`

## Architecture / Approach

The TS prompt and schema in `src/` go through the pure builder `src/prompts/promptfoo.ts`. `npm run eval:sync` writes the builder output to `evals/prompts/review.json`, `schema.json` and `response-format.json`, and `promptfoo.test.ts` checks that the committed files still match. `promptfooconfig.yaml` then runs the three `openrouter:` models with that prompt, the strict response format and the fixture diff. Each output is checked by `is-json` (schema), `llm-rubric` (Sonnet 5.5) and the `verdict === "fail"` assertion.

## Phases at a Glance

| Phase                                   | What it delivers                                                | Key risk                                                                     |
| --------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. Generated prompt/schema + drift test | Three generated files from the agent's source; CI catches drift | Prettier reformats JSON on commit; mitigated by comparing parsed JSON        |
| 2. Evals package, config, fixture       | Runnable promptfoo setup with the 3 flaws planted, plus docs    | Nunjucks syntax in the diff gets expanded; the fixture must avoid `{{ {% {#` |
| 3. First live run                       | The 3 × 1 comparison recorded in `eval-results.md`              | A model rejecting strict `json_schema`, which would show as a provider error |

**Prerequisites:** Node ≥ 22.22 (the host has 24.21), `OPENROUTER_API_KEY` with credit in `tools/code-reviewer/.env`.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- The 2–3 sentence summary required by the prompt may be too short to name all three flaws. If so, the rubric fails, and that is a legitimate finding about the prompt; we do not change the prompt here.
- `file://` loading of `response_format` and of the `is-json` schema follows promptfoo's docs; `promptfoo validate` and the first run confirm it.
- This change's own PR will be AI-reviewed and may get `fail` because of the intentionally broken fixture; the owner bypasses on `main`.

## Success Criteria (Summary)

- `npm run eval` produces a readable 3-model comparison on one hard diff, with judge reasons.
- Changing the agent's prompt without regenerating the eval files turns `npm test` (and the CI `code-reviewer` job) red.
- The first baseline is on record for later prompt or model changes.
