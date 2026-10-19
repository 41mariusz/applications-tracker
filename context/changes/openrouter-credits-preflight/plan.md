# OpenRouter Credits Pre-flight Implementation Plan

## Overview

Check the OpenRouter balance before the AI code review and before the promptfoo evals spend a model call. An empty account then fails early with a clear message instead of a bare HTTP 402. This is the first candidate from the M5L1 opportunity map (`context/team/opportunity-map.md`). It is also the M5L5 exercise: planned here, implemented unattended by `/10x-goal-implement` in a git worktree inside tmux, and reviewed by the owner afterwards.

## Current State Analysis

- **What failed on 2026-10-14:** three eval runs got `402 Payment Required — Insufficient credits` from OpenRouter (`context/archive/2026-10-14-code-review-evals/eval-results.md`, "Setup fixes found by the first run"). The cause was found only by hand-made `curl`s to `GET /api/v1/credits` and `GET /api/v1/key`.
- **The same key gates CI:** the AI review in CI uses that key (`.github/workflows/review.yml`). Without credits, the review fails as an `API error` with no hint at the cause (CLAUDE.md, CI section).
- **The CLI is the single choke point:**
  - `tools/code-reviewer/src/index.ts` reads the input (`readReviewInput`, exit 2 on usage errors), then calls `reviewPullRequest()` (exit 1 on failure). It prints JSON on stdout only and one diagnostic line on stderr.
  - The composite action `.github/actions/ai-reviewer/action.yml` builds this file into `review.js` and runs it, so a check inside the CLI covers CI and local `npm run review` with no action change.
- **Default model:** the default comes from `DEFAULT_MODEL` in `src/agent.ts`, and `REVIEW_MODEL` overrides it. Models whose id ends in `:free` work without credits.
- **OpenRouter endpoints** (both verified with the owner's key on 2026-10-14):
  - `GET https://openrouter.ai/api/v1/credits` → `{ data: { total_credits, total_usage } }`.
  - `GET https://openrouter.ai/api/v1/key` → `{ data: { limit, limit_remaining, usage, is_free_tier, … } }`. `limit_remaining` is `null` when the key has no limit.
- **Repo conventions for `tools/code-reviewer`:**
  - ESM TypeScript (`module: NodeNext`, `.js` import suffixes, `verbatimModuleSyntax`);
  - zod 4 for external data;
  - Vitest tests next to the module (`agent.test.ts`, `cli-input.test.ts`), no network;
  - the root ESLint ignores the package (`eslint.config.js`), and its gates are `npm test`, `npm run typecheck` and `npm run build` in `tools/code-reviewer`.
- **The CI bundle check depends on the order of checks.** The `code-reviewer` job in `.github/workflows/ci.yml` runs `echo "" | OPENROUTER_API_KEY=unused node dist/review.js` and expects **exit 2**. Input validation must therefore stay before any network call.

## Desired End State

- **Review CLI:** before the model call, `npm run review` and the CI review print one pre-flight line on stderr. With no credits they stop with exit 1 and a message that names the account balance or the key limit. A `:free` model skips the check.
- **Standalone check:** `npm run preflight` in `tools/code-reviewer` prints the same line.
- **Evals:** `npm run eval` in `tools/code-reviewer/evals` runs the pre-flight first, forced on, because every eval model is paid.
- **Unreachable credits API:** the pre-flight warns and lets the run continue.

### Key Discoveries:

- The bundle check in the `code-reviewer` CI job requires exit 2 on an empty diff _before_ any network call (`.github/workflows/ci.yml`, job `code-reviewer`).
- `REVIEW_MODEL` may be a `:free` model. A check that ignored this would block reviews that would succeed.
- The evals run their own paid models and grader (`tools/code-reviewer/evals/promptfooconfig.yaml`), not `REVIEW_MODEL`, so their pre-flight must not be skipped because of the `REVIEW_MODEL` value.

## What We're NOT Doing

- No change to `.github/actions/ai-reviewer/action.yml`, `.github/workflows/*.yml`, the review prompt, the schema or the agent loop.
- No alerting (Telegram, e-mail), no cost tracking over time, no top-ups.
- No minimum-balance threshold other than "nothing left". Per-run cost estimation is out of scope.
- No change to the app (`src/`), the toolkit (`packages/ai-toolkit`) or the database.
- No printing of the API key or the `Authorization` header anywhere: not in messages, logs or errors.

## Implementation Approach

A pure rule plus a thin client, in one module:

- `assessCredits()` decides from plain numbers.
- `checkCredits()` fetches the two endpoints through an injectable `fetch`, parses them with zod, and returns a discriminated verdict.
- `formatVerdict()` turns the verdict into the single line the CLIs print.

Phase 1 builds and tests the module in isolation, without network. Phase 2 wires it into the review CLI (after input validation), adds a standalone `preflight` CLI with a `--require-credits` flag, prefixes the evals script, and documents it.

## Critical Implementation Details

- **Order in `src/index.ts`:** the API-key check stays first, then `readReviewInput`, which handles usage errors with exit 2, then the pre-flight, then the review. Moving the pre-flight earlier breaks the CI bundle check.
- **Unknown is not failure:** a network error, a non-2xx answer (401, 5xx) or a body that zod rejects gives `kind: "unknown"`. The CLIs print it as a warning and continue with exit 0. Only `kind: "insufficient"` stops with exit 1.
- **Stdout stays pure JSON for the review CLI:** every pre-flight line goes to stderr.

## Phase 1: Credits Rule and Client with Tests

### Overview

Add `tools/code-reviewer/src/credits.ts`, with pure decision logic and an injectable-fetch client, and cover it with Vitest tests that make no network calls.

### Changes Required:

#### 1. Credits module

**File**: `tools/code-reviewer/src/credits.ts`

**Intent**: Decide whether OpenRouter can be called, from the account balance and the key limit, without ever exposing the key.

**Contract**:

- `export type CreditsVerdict`, a discriminated union on `kind`:
  - `{ kind: "ok"; remaining: number; keyLimitRemaining: number | null }`
  - `{ kind: "insufficient"; message: string }`
  - `{ kind: "skipped"; reason: string }`
  - `{ kind: "unknown"; message: string }`
- `export function isFreeModel(model: string): boolean`: true when the id ends with `:free`.
- `export function assessCredits(snapshot: { totalCredits: number; totalUsage: number; keyLimitRemaining: number | null }): CreditsVerdict`:
  - `insufficient` when `totalCredits - totalUsage <= 0`, with a message naming the account balance and the top-up page `https://openrouter.ai/settings/credits`;
  - `insufficient` when `keyLimitRemaining !== null && keyLimitRemaining <= 0`, with a message naming the key's credit limit;
  - `ok` otherwise.
- `export async function checkCredits(options: { apiKey: string; model: string; requireCredits?: boolean; fetchFn?: typeof fetch; baseUrl?: string }): Promise<CreditsVerdict>`:
  - `skipped` for a free model, unless `requireCredits`;
  - otherwise, `GET {baseUrl}/credits` and `GET {baseUrl}/key` with `Authorization: Bearer <apiKey>`. `baseUrl` defaults to `https://openrouter.ai/api/v1`.
  - The bodies are parsed with zod schemas (`data.total_credits`, `data.total_usage`; `data.limit_remaining` nullable). A network error, a non-2xx status or a body that fails parsing gives `unknown`, with the endpoint path and the status or error name. Never the key or the headers.
- `export function formatVerdict(verdict: CreditsVerdict): string`: one line prefixed `OpenRouter pre-flight:`. `ok` shows the remaining balance with 2 decimals, plus the key limit when present. `unknown` is phrased as a warning that the run continues.

#### 2. Tests

**File**: `tools/code-reviewer/src/credits.test.ts`

**Intent**: Pin the decision rule and the client's failure handling with a fake `fetch`.

**Contract**: one test each for:

- **`assessCredits`:**
  - a positive balance with no key limit gives `ok`;
  - an exhausted account balance gives `insufficient`, with a message mentioning the balance;
  - an exhausted key limit with account credits left gives `insufficient`, with a message mentioning the key limit.
- **`checkCredits`:**
  - a free model gives `skipped`, and `fetchFn` is never called;
  - a free model with `requireCredits: true` is checked;
  - 401 on `/key` gives `unknown`;
  - a network error (a thrown `fetchFn`) gives `unknown`;
  - a malformed body gives `unknown`;
  - both endpoints OK gives `ok`, with the right `remaining`.
- **No leak:** across all of the above, the API key string appears in no `message`, `reason` or `formatVerdict` output.

### Success Criteria:

#### Automated Verification:

- `npm test` in `tools/code-reviewer` passes, including `src/credits.test.ts`
- `npm run typecheck` in `tools/code-reviewer` passes
- Making `assessCredits` return `ok` for an exhausted balance makes `npm test` fail; restoring makes it pass

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase (under `/10x-goal-implement`: continue; there are no Manual rows in this phase).

---

## Phase 2: Wiring into the CLIs and the Evals, Docs

### Overview

Run the pre-flight in the review CLI after input validation, add a standalone `preflight` CLI, run it before the evals, and document it.

### Changes Required:

#### 1. Review CLI

**File**: `tools/code-reviewer/src/index.ts`

**Intent**: Stop a review before the model call when no credits are left, and say why.

**Contract**:

- After `readReviewInput` and the `model` resolution, and before `reviewPullRequest`:
  - call `checkCredits({ apiKey: process.env.OPENROUTER_API_KEY, model })`;
  - print `formatVerdict(...)` to stderr;
  - on `insufficient`, exit 1;
  - on any other kind, continue.
- The usage line in the header comment mentions the pre-flight.
- Exit codes stay 0 / 1 / 2 with their current meaning.

#### 2. Standalone pre-flight CLI and script

**File**: `tools/code-reviewer/src/preflight.ts`, `tools/code-reviewer/package.json`

**Intent**: A way to check the balance on its own (for example before evals), with no review.

**Contract**:

- `npm run preflight` runs `tsx --env-file-if-exists=.env src/preflight.ts`.
- Without `OPENROUTER_API_KEY` it prints the same message as `index.ts` and exits 2.
- The model is `REVIEW_MODEL || DEFAULT_MODEL`. The flag `--require-credits` forces the check even for a `:free` model.
- It prints `formatVerdict` to stderr. It exits 1 on `insufficient`, 0 otherwise.

#### 3. Evals script

**File**: `tools/code-reviewer/evals/package.json`

**Intent**: Never spend an eval run on an empty account.

**Contract**:

- `eval` becomes `npm --prefix .. run preflight -- --require-credits && <the current promptfoo command>`.
- The promptfoo command itself is unchanged.

#### 4. Docs

**File**: `tools/code-reviewer/evals/README.md`, `CLAUDE.md`

**Intent**: Say where the check runs and how to run it.

**Contract**:

- **Evals README:** in the Run section, one bullet saying that `npm run eval` first runs the credits pre-flight and stops on "no credits".
- **`CLAUDE.md`:** in the CI paragraph about `review.yml`, one sentence. The review CLI checks the OpenRouter balance first: an empty balance becomes a clear "no credits" failure instead of an `API error`, and an unreachable credits API only warns. `npm run preflight` in `tools/code-reviewer` runs the check alone.

### Success Criteria:

#### Automated Verification:

- `npm test`, `npm run typecheck` and `npm run build` in `tools/code-reviewer` pass
- The CI bundle check still holds: `echo "" | OPENROUTER_API_KEY=unused node dist/review.js` exits 2 without any network call (empty diff, usage error first)
- `OPENROUTER_API_KEY=sk-or-invalid npm run preflight -- --require-credits` in `tools/code-reviewer` prints an `OpenRouter pre-flight:` warning line and exits 0 (OpenRouter answers 401 → unknown → continue)
- `grep -c "run preflight -- --require-credits" tools/code-reviewer/evals/package.json` prints 1

#### Manual Verification:

- With the real key in `tools/code-reviewer/.env`, the owner runs `npm run preflight -- --require-credits` and sees the current balance (about 10 USD minus usage) on one line
- The owner reviews the unattended run (the phase commits on the worktree branch, the gate verdicts in the run log) and merges the branch into `main`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `src/credits.test.ts`, with a fake `fetch`: the decision rule, free-model skip, forced check, 401, network error, malformed body, ok, and no key leak.

### Integration Tests:

- The bundle exit-2 check (no network on an empty diff).
- `npm run preflight` with an invalid key against the real endpoint. It costs nothing, and the 401 leads to a warning and exit 0.

### Manual Testing Steps:

1. `cd tools/code-reviewer && npm run preflight -- --require-credits` with the real key shows the balance.
2. Review the worktree branch's commits and the run log, then merge.

## Performance Considerations

Two small GET requests before each review or eval run, with no model tokens. Negligible next to the review call.

## Migration Notes

Not applicable.

## References

- Opportunity map: `context/team/opportunity-map.md` (Recommended First Candidate)
- 402 incident: `context/archive/2026-10-14-code-review-evals/eval-results.md`
- CLI: `tools/code-reviewer/src/index.ts`; agent default model: `tools/code-reviewer/src/agent.ts`; CI bundle check: `.github/workflows/ci.yml` (job `code-reviewer`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Credits Rule and Client with Tests

#### Automated

- [x] 1.1 `npm test` in `tools/code-reviewer` passes, including `src/credits.test.ts`
- [x] 1.2 `npm run typecheck` in `tools/code-reviewer` passes
- [x] 1.3 Making `assessCredits` return `ok` for an exhausted balance makes `npm test` fail; restoring makes it pass

### Phase 2: Wiring into the CLIs and the Evals, Docs

#### Automated

- [ ] 2.1 `npm test`, `npm run typecheck` and `npm run build` in `tools/code-reviewer` pass
- [ ] 2.2 The CI bundle check still holds: `echo "" | OPENROUTER_API_KEY=unused node dist/review.js` exits 2 without any network call (empty diff, usage error first)
- [ ] 2.3 `OPENROUTER_API_KEY=sk-or-invalid npm run preflight -- --require-credits` in `tools/code-reviewer` prints an `OpenRouter pre-flight:` warning line and exits 0 (OpenRouter answers 401 → unknown → continue)
- [ ] 2.4 `grep -c "run preflight -- --require-credits" tools/code-reviewer/evals/package.json` prints 1

#### Manual

- [ ] 2.5 With the real key in `tools/code-reviewer/.env`, the owner runs `npm run preflight -- --require-credits` and sees the current balance (about 10 USD minus usage) on one line
- [ ] 2.6 The owner reviews the unattended run (the phase commits on the worktree branch, the gate verdicts in the run log) and merges the branch into `main`
