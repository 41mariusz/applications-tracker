---
change_id: ci-cd-code-review
title: AI code review of pull requests in GitHub Actions (M5L3)
status: implemented
created: 2026-10-14
updated: 2026-10-14
archived_at: null
---

## Notes

Course lesson M5L3 (prompt `.claude/prompts/m5l3-cicd.md`). Requirements: `requirements.md` (from `.claude/prompts/m5l3-requirements.md`). Runs the agent from change `tool-loop-agent` (`tools/code-reviewer`, `reviewPullRequest()`, CLI with `DIFF_FILE` / `PR_TITLE` / `PR_BODY`) on every PR. Templates: `.claude/config-templates/m5l3-review.yml.template`, `m5l3-action.yml.template`.
