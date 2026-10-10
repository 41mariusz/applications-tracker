---
change_id: switch-to-real-data
title: Switch from demo data to real data (S-05)
status: archived
created: 2026-10-10
updated: 2026-10-10
archived_at: 2026-10-10T08:07:45Z
---

## Notes

Roadmap S-05 (MS-06). Decided 2026-10-06 (domain distillation Q-01, PRD FR-004 update, CLAUDE.md): the switch wipes **everything** of the owner's account — applications (cascading notes, revisions, status and field history), CV rows and CV files in the `cvs` bucket — once, before the first real application is entered, and only with the owner's explicit go-ahead.

Owner's decision 2026-10-10: **prepare the tool now, do not wipe production yet.** Scope: a clear-only mode for `scripts/demo-data.mjs` with a dry-run preview of what would be deleted and an explicit confirmation, tested on local Supabase. The production wipe is a separate, later step on the owner's "czyść".
