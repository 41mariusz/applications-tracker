# Evidence: discussion

Sources: **git-only** (gh not installed: forge evidence `unknown`). Window = whole history, 2026-09-29..2026-10-06 (8 days), 96 counted commits (mass bootstrap commit excluded), 1 human author. No merge commits and no `(#N)` PR references in any subject, so PR attribution through git yields nothing. Planning artifacts are the main buzz source: 9 archived change folders, 6 impl-reviews, 1 observability audit, roadmap, test-plan, lessons and the infrastructure risk register. Raw data: `.work/discussion-commits.tsv` (per-commit type, change-id, capabilities), `.work/discussion-head-attr.tsv` (HEAD file → capability).

## Buzz per capability

Commits = counted commits touching the capability (cross-cutting = commit touches >3 capabilities). Fix = `fix…`/`Fix…` subjects. PRs, closed-unmerged, human review, open bugs: `unknown` (no forge) for every row. Reverts: 0 for every row (see Friction). Markers = TODO/FIXME/HACK/XXX at HEAD.

| Capability        | Commits (x-cut) | Fix commits | Change-ids that touched it (non-docs file changes)                      | Impl-review findings (own change)          | Audit findings (2026-10-06, pre-F-01)            | Test-plan risk # | Markers /1k lines                        |
| ----------------- | --------------- | ----------- | ----------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------ | ---------------- | ---------------------------------------- |
| errors            | 5 (5)           | 0           | production-error-visibility 26                                          | — (no impl-review in folder)               | whole audit is about it: 42 findings, 5 critical | —                | 0 / 1524                                 |
| cv                | 12 (8)          | 3           | production-error-visibility 12, cv-upload-5mb 8, fast-details 3         | 6 (2 warning)                              | C1–C10: 2 critical, 3 high, 4 medium, 1 low      | —                | 0 / 1093                                 |
| release           | 18 (5)          | 3           | testing-safe-migrations 16, call-scenario-browser 3, PEV 3, idle-week 1 | 7 (3 warning)                              | P-area partly                                    | #2               | 0 / 1162                                 |
| availability      | 7 (3)           | 1           | app-available-after-idle-week 15, PEV 5                                 | 8 (2 warning)                              | P2, P5                                           | —                | 0 / 474                                  |
| status            | 11 (7)          | 1           | testing-status-rules-e2e 6, fast-details 3, PEV 3                       | 6 (3 warning)                              | W-area (writes)                                  | #3               | 0 / 890                                  |
| list-search       | 12 (6)          | 1           | call-scenario-browser 5, PEV 2, e2e-local-guards 1                      | 6 (3 warning)                              | R-area (call-time read)                          | #1               | 0 / 549                                  |
| auth              | 10 (6)          | 1           | fast-details 6, PEV 6, idle-week 4, e2e-local-guards 1                  | none of its own                            | R1, R3, R6 (call-time read)                      | #5, #6           | 0 / 659                                  |
| app-edit          | 8 (8)           | 0           | PEV 8                                                                   | none of its own                            | W1–W12 (writes; shared with notes/status)        | #4               | 0 / 1038                                 |
| notes             | 9 (9)           | 1           | PEV 6, fast-details 3                                                   | none of its own                            | W-area (W8, W10)                                 | #4               | 0 / 731                                  |
| details           | 7 (7)           | 0           | fast-details 2, PEV 2                                                   | (fast-details review: 8, mostly shared/UI) | R-area (R5, R7, R10, R11)                        | —                | 0 / 264                                  |
| demo-data         | 3 (0)           | 0           | —                                                                       | —                                          | —                                                | —                | 0 / 377                                  |
| shared (bucket)   | 16 (12)         | 1           | fast-details 21, PEV 6                                                  | fast-details 8 (2 warning)                 | —                                                | —                | 0 / 1220                                 |
| platform (bucket) | 29 (12)         | 2           | PEV 6, testing-quality-gates-wiring 5, fast-details 4                   | —                                          | —                                                | —                | 0 / 1999                                 |
| docs (bucket)     | 87 (15)         | 6           | every change-id                                                         | —                                          | —                                                | —                | 0 / 7535 own; vendored skills 36 / 32019 |

Unattributed: 0 product files; package-lock.json excluded as noise.

## Friction

- **Reverts: 0** (evidence). The 4 subjects matching "revert" are the status domain's _revert marker_ feature (`testing-status-rules-end-to-end`), not git reverts. No hotfix subjects.
- **Second attempts, all planned review rounds (evidence)**: 6 of 6 reviewed changes were followed by an "impl-review fixes" commit on the same or next day (idle-week b65e422, cv-upload c53948d, fast-details eb1d725, call-scenario 298e61f, status-rules caf2a06, safe-migrations f87a82c). Reviews raised 41 findings, 15 at WARNING; every review rated Safety & Quality WARNING. This is the workflow, not regression.
- **cv** is the only product capability with an unplanned in-change fix on top of the review round: 8538671 "keep the reused-CV message readable" (same day as the feature), plus review findings F2–F4 on the CV panel's saving state. 3 fix commits in 12 (evidence); small numbers.
- **release / CI**: 2026-09-29 deploy setup took 5 iterations (`Fix CI lint…`, `CI: report…as annotations`, `CI: run deploy in the SUPABASE environment…`, two empty `CI: re-run deploy after … secrets`); call-scenario needed 62ceec5 "stop smoke preview before e2e in CI". Mechanical (rule 5).
- **Spin-off change (inference)**: `e2e-local-guards` follows call-scenario review F6 "Pre-existing E2E guard gaps"; `testing-safe-migrations` review F1–F4 list lint escape hatches and missed breaking statements — the migration lint rules in CLAUDE.md reflect those fixes.
- Closed-unmerged PRs, long-open bugs: `unknown` (no forge; no issue tracker in the repo).

## Planning attention

| Capability            | Planned changes (archive, all 2026-10-04..06)                                                                                                 | Foundation docs naming it                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| errors                | production-error-visibility (F-01, 30 plan items, 4 docs incl. research), audit 2026-10-06 (42 findings), lesson "Errors must leave a signal" | roadmap F-01/MS-05, risk register "silent errors" M/M (mitigated)                                                    |
| availability          | app-available-after-idle-week (S-01, 20 items)                                                                                                | roadmap north star S-01/MS-01; risk register "Supabase pauses" M/**H**                                               |
| cv                    | cv-upload-5mb-in-production (S-02, 10 items, p3 skipped after measurement)                                                                    | MS-02; risk register "CPU limit 1102" M/M                                                                            |
| release               | testing-safe-migrations (S-03 + test phase 3, 20 items)                                                                                       | MS-03; risk "rollback on new schema" L/**H**; test-plan risk #2; 2 of 3 lessons (db push first; additive migrations) |
| shared / details      | fast-details-on-phone (S-04, 23 items, 12 files — the largest folder)                                                                         | MS-04; risk "sequential calls latency" L/M                                                                           |
| list-search           | testing-call-scenario-browser (test phase 1, 14 items), e2e-local-guards (9 items)                                                            | test-plan risk #1 (top)                                                                                              |
| status                | testing-status-rules-end-to-end (test phase 2, 19 items)                                                                                      | test-plan risk #3                                                                                                    |
| platform              | testing-quality-gates-wiring (phase 4, hooks)                                                                                                 | test-plan §6.8                                                                                                       |
| app-edit, notes, auth | no change of their own; reached only through PEV/fast-details spillover and audit areas                                                       | test-plan risks #4 (writes + history), #5/#6 (auth)                                                                  |
| demo-data             | none                                                                                                                                          | roadmap S-05 switch-to-real-data **proposed** (next)                                                                 |

All plan.md checklists are fully ticked (0 open items). Only open roadmap work: S-05 (demo-data → real data). `context/changes/` holds only `bootstrap-verification`.

## Debt markers

Zero TODO/FIXME/HACK/XXX in every product capability at HEAD (evidence, 14 capability/bucket rows). All 36 hits sit in vendored course skills (`.claude/skills/**`) — mechanical, not product debt. Debt is instead tracked as review findings and the risk register.

## Mechanical signals

- **docs** 87 commits / 393 changes: prose and planning churn (rule 8), re-attributed above by change-id. Vendored skills/prompts commits (course downloads) are not product buzz (rule 7).
- **production-error-visibility spillover** (rule 12): its 4 feat commits each touched 6–11 capabilities; it accounts for the bulk of app-edit (8 of 8 commits cross-cutting), notes (9/9), details (7/7) and much of cv (12 changes). These capabilities look busier than their own planning says.
- **fast-details-on-phone** mostly touched `shared` (21 changes: tokens/shadcn) — UI contract migration, not details logic.
- **CI deploy iteration** on 2026-09-29 (rule 5) and review-fix rounds (workflow, rule 4: same cause as the plan count).
- **Single author** (rule 6): no review concentration or ownership signal possible.
- **Audit counts are pre-fix**: the 42 audit findings predate F-01; the F-01 plan references 21 of them by ID (C1, C3, C6, C7, C10, P5, P6, R1, R2, R6, R7, R9, W1, W3, W5–W11). Remaining IDs (e.g. C2, C4, C5, C8, C9, P1–P4, R3–R5, R8, R10, R11, W2, W4, W12) are not named in the plan — whether they were fixed is `unknown` from this source (CLAUDE.md describes ErrorBoundary, 500.astro, central hook, readFormData, which suggests many were; inference).

## Unknowns

- PRs, review activity, closed-unmerged PRs, issues and bug ages: **unknown** — gh not installed; recommend installing the GitHub CLI (`gh auth login`) and re-running this sub-agent.
- Production errors: the repo uses Cloudflare Workers Issues → Telegram (`/api/alerts/issue`) and a daily Health workflow; their history is outside git — out of scope, unknown.
- With 8 days of history, no buzz trend is meaningful; every count is small (≤18 commits per product capability).
- Status of audit findings not referenced by the F-01 plan (see above).
- `rg` was not used; markers counted with a Python regex over `git ls-files` (same pattern).

## Commands run

- `python3` parser over `.work/git-log.txt` + `.work/attribute.py` → per-capability commits, fix, cross-cut, change-id × capability (`.work/discussion-commits.tsv`)
- `grep` on commit subjects for revert/hotfix/retry vocabulary
- `git ls-files context …` (planning folders, reviews); `grep` headings/verdict/severity lines in `reviews/impl-review.md`, plan.md checkbox counts
- `awk` over the audit findings table (ID area × severity); `grep -oE '[RWCP][0-9]+'` in the F-01 change folder
- `grep` headings/tables in roadmap.md, infrastructure.md (risk register), test-plan.md (risk map, phases), lessons.md
- `git ls-files` + `attribute.py` + Python regex `TODO|FIXME|HACK|XXX` → markers per 1k lines (`.work/discussion-head-attr.tsv`)
