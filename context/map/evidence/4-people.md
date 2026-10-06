# Evidence: people

- Humans in window: **1** (the owner; display names "Mariusz Michalak" and "Mariusz" are the same person — the second appears only as author of merge commit c0b4592). `evidence`
- Window = whole history, 2026-09-29..2026-10-06 (8 days). 97 non-merge commits, 96 counted (mass bootstrap 779c8a0 excluded), 0 bot commits, 0 agent-authored commits. `evidence`
- Baseline (false-signal rule 6): small team — concentration is the baseline. Every capability is 100% one person; this is not a finding and no bus-factor language applies.
- Attribution: all non-noise paths attributed via `attribute.py`; unattributed file changes: 0. Raw output: `context/map/.work/people-raw.txt`.

## People per capability

All 11 business capabilities (high + medium criticality) are in scope. One person (the owner) for each; topic groups come from commit types/scopes (`<type>(<change-id>)`). `evidence`

| Capability   | Commits | Active       | Topic groups (scopes / types)                                                                      |
| ------------ | ------- | ------------ | -------------------------------------------------------------------------------------------------- |
| cv           | 12      | 09-29..10-06 | upload size limit (cv-upload-5mb-in-production), phone layout, error visibility; 3 fix             |
| list-search  | 12      | 09-29..10-06 | browser call scenario E2E (testing-call-scenario-browser), e2e guards; 4 test                      |
| status       | 11      | 09-29..10-06 | transition rules end-to-end (testing-status-rules-end-to-end), phone layout; 4 test                |
| auth         | 10      | 09-29..10-06 | paused-project handling (app-available-after-idle-week), error visibility                          |
| notes        | 9       | 09-29..10-06 | phone layout, error visibility                                                                     |
| app-edit     | 8       | 09-29..10-06 | initial build + atomic SQL writes (unscoped), error visibility                                     |
| availability | 7       | 09-29..10-06 | keepalive / health (app-available-after-idle-week)                                                 |
| details      | 7       | 09-29..10-06 | phone layout (fast-details-on-phone), error visibility                                             |
| errors       | 5       | 10-05..10-06 | production-error-visibility (all feat)                                                             |
| release      | 18      | 09-29..10-06 | safe migrations (testing-safe-migrations), CI/deploy iteration (mechanical: trial-and-error fixes) |
| demo-data    | 3       | 09-29 only   | seed → demo-data script (unscoped)                                                                 |

Buckets for context: platform 29, shared 16, docs 87 (docs includes vendored course skills — not product activity).

## Concentration

Small team — concentration is the baseline. Capabilities only one person has ever touched: **all of them**. `evidence`

## Agent co-authorship

87 of 96 counted commits (91%) carry a `Co-authored-by: Claude` trailer. `evidence`

- Every product capability, platform, shared and release: **100%** agent-co-authored.
- docs: 78/87; the 9 commits without a trailer are all `chore(archive): close <change-id>` (archive bookkeeping, mechanical).

Planning coverage — commits whose scope names a change folder in `context/archive/` (planned) vs. not (unplanned, mostly the 2026-09-29 initial build of 26 pre-10-04 commits): `evidence`

| Capability   | Planned | Unplanned |
| ------------ | ------- | --------- |
| status       | 10      | 1         |
| cv           | 9       | 3         |
| availability | 6       | 1         |
| errors       | 5       | 0         |
| notes        | 6       | 3         |
| auth         | 6       | 4         |
| list-search  | 6       | 6         |
| details      | 4       | 3         |
| release      | 10      | 8         |
| app-edit     | 3       | 5         |
| demo-data    | 0       | 3         |

## Implications

- `inference` "Whom to ask" collapses to two sources: the owner, and the written trail. Because practically every change was agent-written, the reasoning behind it lived in agent sessions; what survives is the commit message and, for planned work, `context/archive/<change-id>/` (plan.md, research.md, reviews).
- `inference` Well-documented decision trails: status, cv, availability, errors (mostly or fully planned). Read the matching archive folder before changing them.
- `inference` Thin trails: **app-edit** (5 of 8 unplanned — the field-history and atomic SQL-function design came from the initial build) and **demo-data** (0 planned; it has a destructive `--reset`). For these the rationale lives only in commit subjects, CLAUDE.md, the PRD and pgTAP tests — ask the owner before changing the change+trace functions or reset behaviour.
- `inference` list-search and release are half unplanned; release's unplanned part is CI/deploy iteration (mechanical, false-signal rule 5).

## Unknowns

- `unknown` Formal ownership: no CODEOWNERS checked here; with one human, ownership is implicit.
- `unknown` What was decided in agent sessions but never written into commits or `context/` — not recoverable from git.
- `unknown` PR discussion: gh not available; only 2 merge commits (PR #1, #2) exist, their review content unseen.

Commands run: `git -c core.quotepath=off log --format='%aN'` (+ `--no-merges`, `--merges`), trailer counts via `git log --format='%(trailers:key=Co-authored-by,valueonly)'`, parse of `.work/git-log.txt` + `attribute.py` (scratchpad script `people.py`), `ls context/archive/*`, `git log --before=2026-10-04`.
