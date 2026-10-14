# Opportunity Map

## Context

- **Project / context:** Applications Tracker. The owner works alone and is a 10xDevs 4.0 participant. Course lesson M5L1 (`/10x-opportunity-map`), internal-builder lens.
- **Signals:** frictions observed in the agent sessions on 2026-10-04…14, as recorded in the project memory and in this repo's history. The owner asked for the map to be filled in from them without a separate confirmation round, so each signal still needs the owner's own "yes, this repeats" before acting on it.
- **Data constraint:**
  - Mock, local, read-only and non-sensitive for signals 1, 2, 3 and 5.
  - Signal 4 is the owner's real job-search data, which is personal.
- **Date:** 2026-10-14

## Map

| Signal                                                                                                                                                           | Existing / default response                                                                                                   | Thin complement                                                                                                       | First useful version                                                                       | Data risk                                                                                | Direction if valuable                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. CI/deploy status is checked by hand; the anonymous GitHub API (60 req/h) was exhausted once; `gh` is not installed                                            | GitHub e-mail on failed runs, the Actions UI, `gh run watch`                                                                  | Install and authenticate `gh`                                                                                         | None: use `gh run watch` / `gh run list`                                                   | Read-only, non-sensitive                                                                 | **Wait / no build.** An existing tool already solves it.                                                                                               |
| 2. OpenRouter credits are only seen after a 402: three eval runs failed on 2026-10-14 before the empty balance showed up, and the same key gates AI review in CI | OpenRouter dashboard, the key's credit limit                                                                                  | A credits pre-flight (`GET /api/v1/credits`) before a review or eval, failing early with a clear "no credits" message | A local read-only check script, plus the same check as the first step of the review action | Read-only billing metadata of own key; low sensitivity, but the key must never be logged | **Review / CI gate** (internal tool)                                                                                                                   |
| 3. Course content updates via 10x-cli turned into 91 → 124 "conflicts" because the pre-commit prettier reformatted managed files                                 | `10x sync --force`, the CLI manifest                                                                                          | `.prettierignore` for managed paths (done 2026-10-14, `248cc37`)                                                      | Already in place                                                                           | Local, non-sensitive                                                                     | **Wait.** Already fixed. A team-wide version is the shared-registry problem (M5L4).                                                                    |
| 4. Job search: unsure which applications need a follow-up and which companies went silent                                                                        | The app's "waiting for a response" filter (`/dashboard?status=sent,hr_contact,interviews`), list ordering, calendar reminders | A "days since last activity" hint on waiting applications                                                             | Count by hand, on real data, how many waiting applications sat 7+ days untouched           | **Real personal data.** It stays inside the app's existing RLS; no export                | **Feature** in the existing product, only after validation (`context/team/mom-test-validation.md`). The PRD non-goal "no reminders" stands until then. |
| 5. Certification submission: evidence for Builder / Architect / Champion is spread over `context/archive/`, commits and CI                                       | Writing the submission by hand from the archive and the git log                                                               | An index of archived changes (title, lesson, commits, verdict) generated from `change.md` files and `git log`         | A one-off local read-only script or a hand-written table                                   | Local, non-sensitive (public repo data)                                                  | **Wait / no build.** It happens once per edition.                                                                                                      |

## Recommended First Candidate

**Candidate:** OpenRouter credits pre-flight ("no credits" fails fast, before the model call)

- **Reads:**
  - OpenRouter `GET /api/v1/credits` and `GET /api/v1/key` with the existing `OPENROUTER_API_KEY`;
  - the review and eval entry points (`.github/actions/ai-reviewer`, `tools/code-reviewer/evals`).
- **Returns:** a single line ("OpenRouter: 9.96 / 10 USD left, key limit 10 USD"), or a clear error ("no credits on the account that owns key …c4d") with exit code 1, _before_ the AI review or the eval spends time and turns red with a generic API error.
- **Does not do:**
  - no top-ups or payments;
  - no alerting channel (no Telegram, no e-mail);
  - no cost tracking over time;
  - no change to the review verdict logic;
  - never prints the key.
- **Data risk:** read-only billing metadata of the owner's own key. The only rule that must come first is that the key and the auth header never reach logs or step summaries.
- **Direction if it proves valuable:** **Review / CI gate.** It becomes a pre-flight step of the composite action, so a missing balance becomes a readable annotation on the PR instead of an `API error` verdict.

## Why This Candidate

- **Repeats regularly.** It is on the path of every PR review and every eval run.
- **Joins sources.** It combines two systems, OpenRouter billing and the CI/eval pipeline. It also involves two roles: the owner as payer, and the PR author who sees the red check.
- **Clear manual pain today.** On 2026-10-14 three runs failed, and diagnosing them needed manual `curl`s against the API. The CI review would have failed the same way.
- **Safe to test.** It can be tried read-only and locally with no risk; the first version is one HTTP call.
- **Additive.** It does not replace OpenRouter's dashboard or limits; it only surfaces them where the failure happens.

Why not the others:

- **Signal 1** is solved by an existing tool (`gh`).
- **Signal 3** is already fixed.
- **Signal 5** happens once.
- **Signal 4** is the most valuable product idea, but it touches real personal data and contradicts a PRD non-goal, so it needs evidence first (Mom Test plan).

## Next Direction If Valuable

1. Confirm that the signal is real by checking how often a CI review has failed on credits or keys. For now there is only one observed incident.
2. If it is, route the work as a small change: `/10x-new openrouter-credits-preflight` → `/10x-plan`. The change is a pre-flight step in `.github/actions/ai-reviewer` plus an `npm run credits` script in `tools/code-reviewer`.
3. Signal 4 continues through `/10x-mom-test` → `/10x-shape` → PRD update. Signal 3 links to M5L4 (Shared AI Registry), where distributing skills and rules to several repositories is the main topic.
