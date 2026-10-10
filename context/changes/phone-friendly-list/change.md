---
change_id: phone-friendly-list
title: Application list usable on a 360 px phone (S-06)
status: impl_reviewed
created: 2026-10-10
updated: 2026-10-10
archived_at: null
---

## Notes

Roadmap M-2, S-06 (MS-01, north star). `/10x-ui` change.

- **One view:** `/dashboard` — `src/pages/dashboard.astro` (list, search `?q=`, status filter `?status=`; StatusControl island per row).
- **Token source:** existing design system — tokens in `src/styles/global.css` (`:root`, one dark theme; values and replaced literals on record in `context/archive/2026-10-05-fast-details-on-phone/tokens.md`), shared components in `src/components/ui/` (shadcn "new-york"). Extend it; no second palette, no `shadcn init`.
- **Contract variant:** existing design system, view not yet reading it. The details view, Topbar, StatusControl, NotesPanel, CvPanel, Layout, 404/500 and `/dev/ui` are already on the contract (`scripts/check-ui-literals.mjs` CLEAN_VIEWS).

Pre-audit (2026-10-10): hardcoded-value scan on `src/pages/dashboard.astro` → 13 lines with literals (~30 palette/opacity classes: `text-white` ×3, `text-blue-100/70` ×3, `bg-white/10` ×3, `bg-purple-600` ×2, `text-red-200`, `bg-red-500/20`, `ring-purple-400`, …); 0 token classes; 0 imports from `src/components/ui/`. The agent rules (CLAUDE.md "UI contract") already forbid literals — no rule invites one-off values. Known symptom (project map): the list overflows at 360 px with long names.
