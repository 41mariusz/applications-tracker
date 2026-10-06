# Evidence: history

Window: whole history, 2026-09-29T17:06 .. 2026-10-06T16:08 (HEAD a6300be) — 8 calendar days, 5 active days (09-29, 09-30, 10-04, 10-05, 10-06).
Buckets: ISO week W40 (09-29..10-05) / W41 (10-06), plus per day. 97 commits, 0 merges, 96 counted; excluded: 779c8a0 (mass scaffold, 101 files). Noise excluded: package-lock.json, *.png, *.pdf.
One human author; 87 of 96 counted commits carry a Claude co-author trailer (the 9 without are all `chore(archive): close …`). Raw output: `.work/history-raw.txt`.

## Activity per capability

Changes = file changes (per-file count); commits counted once per capability touched (cross-cutting commits count for each). `evidence`

| Capability        | Changes | Share | Commits | Agent-assisted commits |
| ----------------- | ------: | ----: | ------: | ---------------------: |
| docs (bucket)     |     340 | 50.4% |      87 |                     78 |
| platform (bucket) |      51 |  7.6% |      29 |                     29 |
| cv                |      40 |  5.9% |      12 |                     12 |
| shared (bucket)   |      38 |  5.6% |      16 |                     16 |
| release           |      32 |  4.7% |      18 |                     18 |
| auth              |      31 |  4.6% |      10 |                     10 |
| errors            |      27 |  4.0% |       5 |                      5 |
| app-edit          |      27 |  4.0% |       8 |                      8 |
| availability      |      21 |  3.1% |       7 |                      7 |
| notes             |      19 |  2.8% |       9 |                      9 |
| list-search       |      18 |  2.7% |      12 |                     12 |
| status            |      17 |  2.5% |      11 |                     11 |
| details           |       8 |  1.2% |       7 |                      7 |
| demo-data         |       6 |  0.9% |       3 |                      3 |
| **total**         | **675** |       |         |                        |

- Unmapped: 0 changes (0%). `evidence`
- docs is half of all volume; ~175 of its changes (all history, incl. mass commit) are vendored course skills/prompts (`.claude/skills`, `.claude/prompts`), ~202 are `context/**` plans, 27 CLAUDE.md. Vendored + planning churn, not product activity (rules 7, 8). `evidence`
- Agent-assisted share of code commits: 100% for every business capability. `evidence`
- Business capabilities with the most code change: cv (40), release (32), auth (31); errors packs 27 changes into only 5 commits (one recent campaign). `evidence`

## Top files in top capabilities

| Capability   | Top files (changes)                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cv           | `src/components/applications/CvPanel.tsx` 9; `src/pages/api/cv/[id].ts` 4; `src/pages/api/cv/index.ts` 4; `src/lib/domain/cv.test.ts` 4; `CvLibrary.tsx` 3; `src/lib/services/cv.ts` 3 |
| release      | `.github/workflows/ci.yml` 15; `wrangler.jsonc` 3; `scripts/lib/migrations{,.test}.mjs` 3+3; `check-cloud-migrations.mjs` 2; `check-migrations.mjs` 2                                  |
| auth         | `src/middleware.ts` 8; `src/pages/api/auth/signin.ts` 5; `src/pages/auth/signin.astro` 3; `tests/e2e/auth.setup.ts` 2; `SignInForm.tsx` 2                                              |
| errors       | `src/lib/domain/error-log{,.test}.ts` 3+3; `src/lib/log.ts` 3; others 1 each                                                                                                           |
| app-edit     | `src/lib/services/applications.ts` 5; `api/applications/[id]/index.ts` 4; `ApplicationForm.tsx` 3; `api/applications/index.ts` 3; `[id]/edit.astro` 3                                  |
| availability | `src/lib/supabase-paused.ts` 3; `src/pages/api/health.ts` 3; `domain/keepalive{,.test}.ts` 2+2; `health.yml` 2                                                                         |
| notes        | `NotesPanel.tsx` 5; `src/lib/services/notes.ts` 4; `api/applications/[id]/notes.ts` 3; `api/notes/[id].ts` 3                                                                           |
| list-search  | `src/pages/dashboard.astro` 7; `domain/search{,.test}.ts` 4+4; `tests/e2e/call-phone-search.spec.ts` 3                                                                                 |
| status       | `StatusControl.tsx` 5; `api/applications/[id]/status.ts` 3; `supabase/tests/history_traces.test.sql` 2; `status-revert.spec.ts` 2                                                      |
| details      | `src/pages/applications/[id]/index.astro` 6 (+1 on old path `[id].astro`)                                                                                                              |
| platform     | `scripts/smoke.mjs` 17; `package.json` 11; `eslint.config.js` 4                                                                                                                        |
| shared       | `Topbar.astro` 4; `src/types.ts` 4; `check-ui-literals.mjs` 3; `dev/ui.astro` 3; `ui/native-select.tsx` 3                                                                              |

## Trend

Commits per capability per active day (09-29 / 09-30 / 10-04 / 10-05 / 10-06) and per week. With 8 days of history, labels describe the build sequence, not long-term trends. `evidence` (counts), `inference` (labels)

| Capability   | 09-29 | 09-30 | 10-04 | 10-05 | 10-06 | W40 | W41 | Label                                                    |
| ------------ | ----: | ----: | ----: | ----: | ----: | --: | --: | -------------------------------------------------------- |
| docs         |    13 |     5 |     8 |    39 |    22 |  65 |  22 | constant (process)                                       |
| platform     |    12 |     1 |     1 |    10 |     5 |  24 |   5 | seasonal (build + testing campaigns)                     |
| release      |     8 |     0 |     1 |     3 |     6 |  12 |   6 | seasonal (initial deploy; testing-safe-migrations 10-06) |
| shared       |     6 |     0 |     0 |     7 |     3 |  13 |   3 | seasonal (fast-details-on-phone UI tokens 10-05)         |
| list-search  |     5 |     0 |     0 |     5 |     2 |  10 |   2 | seasonal                                                 |
| cv           |     3 |     0 |     0 |     6 |     3 |   9 |   3 | seasonal (cv-upload-5mb-in-production 10-05)             |
| status       |     1 |     0 |     0 |     7 |     3 |   8 |   3 | rising (testing-status-rules-end-to-end 10-05)           |
| auth         |     3 |     0 |     2 |     3 |     2 |   8 |   2 | constant (touched by every campaign)                     |
| notes        |     3 |     0 |     0 |     3 |     3 |   6 |   3 | constant                                                 |
| app-edit     |     5 |     0 |     0 |     0 |     3 |   5 |   3 | seasonal                                                 |
| availability |     1 |     0 |     4 |     0 |     2 |   5 |   2 | seasonal (app-available-after-idle-week 10-04)           |
| details      |     3 |     0 |     0 |     2 |     2 |   5 |   2 | seasonal                                                 |
| errors       |     0 |     0 |     0 |     1 |     4 |   1 |   4 | rising (production-error-visibility 10-06)               |
| demo-data    |     3 |     0 |     0 |     0 |     0 |   3 |   0 | fading (built once on day 1)                             |

Campaigns (change-ids from commit subjects, `evidence`):

- 09-29: MVP build in 21 unscoped commits (applications, status, details/notes, search, edit with field log, atomic SQL functions, CV attachments + library + preview, deploy) plus 4 "CI: re-run deploy…" iteration commits.
- 09-30: course skills + CLAUDE.md upkeep (docs only).
- 10-04: `app-available-after-idle-week` (keepalive, health, paused page).
- 10-05: `testing-status-rules-end-to-end` (7), `fast-details-on-phone` (7), `testing-call-scenario-browser` (6), `cv-upload-5mb-in-production` (4), `e2e-local-guards` (3), 6 archive commits.
- 10-06: `testing-safe-migrations` (7), `production-error-visibility` (6), course skills.

## Fix pressure

Heuristic: subject matches `fix|bug|hotfix|revert|regression|broken|incident` (case-insensitive); each matching commit counts for every capability it touches; cross-cutting = > 3 capabilities. 11 raw matches; 2 are false positives (`cfbd35a`, `3ec326d` — "revert" names the status **revert marker** feature, not a git revert). **Real reverts: 0.** No issue references available (no forge CLI). `evidence`

| Capability                           | Commits | Fix commits (corrected) | Fix share | Cross-cutting among them | Fix subjects                                                                                      |
| ------------------------------------ | ------: | ----------------------: | --------: | -----------------------: | ------------------------------------------------------------------------------------------------- |
| cv                                   |      12 |                       3 |       25% |                        1 | c53948d impl-review fixes; **8538671 keep the reused-CV message readable**; eb1d725 (cross)       |
| release                              |      18 |                       3 |       17% |                        0 | f87a82c impl-review fixes; 298e61f impl-review fixes; 62ceec5 stop smoke preview before e2e in CI |
| availability                         |       7 |                       1 |       14% |                        0 | b65e422 impl-review fixes                                                                         |
| auth                                 |      10 |                       1 |       10% |                        0 | b65e422 impl-review fixes                                                                         |
| notes                                |       9 |                       1 |       11% |                        1 | eb1d725 (cross)                                                                                   |
| status                               |      11 |                       1 |        9% |                        1 | eb1d725 (cross); raw count 3 incl. revert-marker false positives                                  |
| list-search                          |      12 |                       1 |        8% |                        0 | 298e61f impl-review fixes                                                                         |
| platform                             |      29 |                       2 |        7% |                        1 | a1c89e8 Fix CI lint; eb1d725 (cross)                                                              |
| shared                               |      16 |                       1 |        6% |                        1 | eb1d725 (cross)                                                                                   |
| app-edit, errors, details, demo-data |       — |                       0 |        0% |                        — | —                                                                                                 |
| docs                                 |      87 |                       7 |        8% |                        — | rides along with every fix (plans updated)                                                        |

Readings:

- 7 of 9 real fix commits are `fix(<change-id>): (apply) implementation review fixes` — fixes found by the workflow's own review **before** shipping, not production bug reports. `evidence` (subjects), `inference` (meaning)
- Only three fixes stand alone: 8538671 (cv UI message), 62ceec5 (CI preview port), a1c89e8 (CI lint). `evidence`
- eb1d725 (`fast-details-on-phone` review fixes) touches 6 capabilities; it inflates notes/status/shared/platform fix counts (rule 12 spillover) — it is about the details view's UI. `inference`
- cv carries the highest fix share among business capabilities (25%, 2 of 3 not cross-cutting). With n=12 this is a weak signal. `inference`

## Co-change between capabilities

Counted commits minus 3 that touch > 8 capabilities (de1a732, d326c4b — `production-error-visibility` p2/p3, 10–11 caps; 3efc183 — `fast-details-on-phone` p4, 9 caps). Note: the inventory has 14 capabilities, not the 16 the contract's rule mentions; threshold > 8 applied as written. Confidence = shared ÷ commits of the less active side (in the co-change set). `evidence`

Business pairs (docs excluded, support ≥ 3):

| Pair                   | Support | Confidence |
| ---------------------- | ------: | ---------: |
| platform – shared      |      11 |       0.79 |
| auth – platform        |       6 |       0.75 |
| cv – platform          |       6 |       0.67 |
| list-search – platform |       6 |       0.60 |
| app-edit – platform    |       5 |       0.83 |
| notes – shared         |       5 |       0.83 |
| cv – shared            |       5 |       0.56 |
| platform – release     |       5 |       0.28 |
| details – shared       |       4 |       1.00 |
| app-edit – release     |       4 |       0.67 |
| list-search – release  |       4 |       0.40 |
| app-edit – shared      |       4 |       0.67 |
| details – notes        |       3 |       0.75 |
| auth – availability    |       3 |       0.60 |
| app-edit – notes       |       3 |       0.50 |
| notes – status         |       3 |       0.50 |
| cv – notes             |       3 |       0.50 |
| cv – status            |       3 |       0.38 |
| app-edit – list-search |       3 |       0.50 |

- docs co-changes with every capability at confidence ≈ 0.9–1.0 — the 10x workflow updates the plan in the same commit as the code (rule 3/4, mechanical). `evidence`
- platform pairs are driven by `scripts/smoke.mjs` (extended with every user-facing feature per CLAUDE.md) and `package.json` — workflow lockstep, not coupling. `inference`
- Real product couplings worth noting: details–notes (0.75), notes/status/cv triad on the details page (0.38–0.50), auth–availability (0.60: paused-project handling lives in middleware and sign-in), app-edit–release (0.67: migrations/SQL functions + CI). `inference`

## Hub files and freshness

Files co-changing with the most distinct other capabilities (partners seen in ≥ 2 commits; big commits dropped). `evidence`

| File                                      | Distinct partner caps | What it is                             | Verdict                                                                             |
| ----------------------------------------- | --------------------: | -------------------------------------- | ----------------------------------------------------------------------------------- |
| `scripts/smoke.mjs`                       |                    12 | end-to-end smoke, extended per feature | mechanical — workflow lockstep guarded by CI (rules 3, 4)                           |
| `CLAUDE.md`                               |                    10 | agent rules / architecture doc         | mechanical — prose (rule 8)                                                         |
| `package.json`                            |                     8 | scripts + deps                         | mechanical — shared config (rule 4)                                                 |
| `src/types.ts`                            |                     7 | shared entity/DTO types                | real shared contract; typed, `astro check` catches drift (rule 2/3: cheap coupling) |
| `src/components/applications/CvPanel.tsx` |                     7 | CV panel on details page               | product hub — co-changes with notes/status/details panels (UI campaign)             |
| `context/foundation/prd.md`               |                     7 | PRD                                    | mechanical — prose                                                                  |
| `src/pages/dashboard.astro`               |                     6 | list page                              | product hub (list + app-edit + release)                                             |
| `src/pages/applications/[id]/index.astro` |                     6 | details page composing panels          | product hub                                                                         |
| `src/lib/services/applications.ts`        |                     6 | applications data access               | product hub (release/notes/list-search)                                             |
| `StatusControl.tsx`, `NotesPanel.tsx`     |                6 each | details-page panels                    | product hubs (moved together with CvPanel)                                          |
| `.github/workflows/ci.yml`                |                     6 | CI pipeline                            | mechanical — every new check touches it (rule 4)                                    |
| `src/middleware.ts`                       |                     5 | auth + paused + error hook             | product hub — 3 capabilities (auth, availability, errors) live in one file          |

Freshness (`git cat-file -e HEAD:<path>` on every named file): all exist except `src/pages/applications/[id].astro` (moved to `[id]/index.astro`, folded into details), `supabase/demo/seed-test-data.sql` and `supabase/demo/cleanup-test-data.sql` (deleted; replaced by `scripts/demo-data.mjs`, folded into demo-data), and `context/changes/production-error-visibility/plan.md` (moved to archive). Rule 11: history only. `evidence`

## Mechanical signals

- docs at 50% of volume: vendored course skills (~175 changes) + per-change plans; never a hot area (rules 7, 8).
- Every capability's co-change with docs (confidence ≈ 1.0): plan-in-same-commit workflow (rule 3).
- `scripts/smoke.mjs`, `package.json`, `ci.yml`, `CLAUDE.md` as hubs: shared cause = "each feature extends smoke/CI/docs" (rule 4).
- release iteration: 4 `CI: re-run deploy…` commits on 09-29 plus 2 CI fixes — trial-and-error on the pipeline (rule 5); not counted by the regex but same nature.
- "revert" regex hits in status are the revert-marker feature, not reverts.
- eb1d725 spillover onto notes/status/shared/platform fix counts (rule 12).
- Fix commits are dominated by pre-merge impl-review fixes — a workflow step, not production failure.
- Single author, 100% agent-assisted: no concentration finding possible (rule 6).

## Unknowns

- Trends: 8 days / 5 active days — no statistical trend; labels are build-sequence descriptions. `unknown`
- Production fix pressure: no forge CLI (gh not installed), so no bug-labelled issues, PRs or incident references; the deploy/incident history beyond commit subjects is invisible. Recommend installing `gh` for a richer run. `unknown`
- Pairs that should co-change but cannot be seen in git: SQL functions in `supabase/migrations` (`update_application`, `add_note`, `edit_note`, `set_application_cv`, `change_application_status`) vs their TS callers in `src/lib/services/*` and `src/types.ts` (hand-kept twins, no generated DB types observed in history); `src/lib/domain/status.ts` transition rule vs its SQL/pgTAP enforcement; client `checkCvFile` vs server 5 MB / 413 limit; smoke.mjs vs Playwright specs. Co-change cannot prove they stay in sync. `unknown`
- Migrations are attributed by filename glob; migrations whose names do not match a capability pattern fall to the nearest prefix — not verified per file. `unknown`
- 3 big commits dropped from co-change (production-error-visibility p2/p3, fast-details-on-phone p4) hide errors' couplings: errors appears in only 2 co-change commits, so its pairs are under-measured. `unknown`

## Commands run

- `cat` scan contract, capabilities.tsv, excluded-commits.txt, false-signals.md, attribute.py; `head`/`grep`/`cut` on `.work/git-log.txt` (status letters, commits without trailer)
- `python3 scratchpad/hist.py` (parses `.work/git-log.txt`, attributes via `attribute.cap`, computes activity, top files, per-day/week trend, fix regex, co-change, hub files) → `.work/history-raw.txt`, `.work/history-named-files.json`
- python one-off: dropped (>8 caps) commits, "revert" hits, change-id per day
- `grep '^@' .work/git-log.txt` subjects before 10-05; docs bucket split (vendored vs context)
- `git -c core.quotepath=off cat-file -e HEAD:<path>` for every named file; `git -c core.quotepath=off log --all --oneline | grep -ic revert`
