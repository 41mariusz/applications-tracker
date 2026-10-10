---
change_id: phone-friendly-cv-library
title: CV library usable on a 360 px phone (S-08)
status: archived
created: 2026-10-10
updated: 2026-10-10
archived_at: 2026-10-10T10:37:11Z
---

## Notes

Roadmap M-2, S-08 (MS-01). `/10x-ui` change.

- **One view:** `/cv` — `src/pages/cv.astro` with its island `src/components/applications/CvLibrary.tsx` (upload, list of CVs, usage list, lazy `CvPreview`).
- **Token source:** existing design system — tokens in `src/styles/global.css` (`:root`, one dark theme; values and replaced literals on record in `context/archive/2026-10-05-fast-details-on-phone/tokens.md`), shared components in `src/components/ui/` (shadcn "new-york"). Extend it; no second palette, no `shadcn init`.
- **Contract variant:** existing design system, view not yet reading it. Dashboard, details view, Topbar, StatusControl, NotesPanel, CvPanel, ErrorBoundary, ErrorText, Layout, 404/500 and `/dev/ui` are already on the contract (`scripts/check-ui-literals.mjs`).
- **Sequencing:** `CvPreview` is shared with S-09 (cv-preview-by-type) — run the two one after the other, not at the same time.

Pre-audit (2026-10-10): hardcoded-value scan → `cv.astro` 2 lines, `CvLibrary.tsx` 17 lines, `CvPreview.tsx` 2 lines; token classes: 0 / 1 / 1; imports from `src/components/ui/`: 0 / 0 / 1. The agent rules (CLAUDE.md "UI contract") already forbid literals — no rule invites one-off values.
