---
change_id: phone-friendly-form
title: Application form on design tokens and phone-friendly (/10x-ui)
status: implemented
created: 2026-10-10
updated: 2026-10-10
archived_at: null
---

## Notes

UI change driven by `/10x-ui`.

- **View (one):** the application form — `src/pages/applications/new.astro`. The form itself is
  `src/components/applications/ApplicationForm.tsx`, also rendered by `src/pages/applications/[id]/edit.astro`,
  so both entry points are audited together.
- **Token source:** the existing design system — tokens in `src/styles/global.css` (`:root`), components in
  `src/components/ui/`. Contract variant: **existing design system** — extend it; no second palette, no `shadcn init`.
- **Pre-audit (2026-10-10), hardcoded-value scan:** `new.astro` 1, `ApplicationForm.tsx` 11, `[id]/edit.astro` 3
  literals; the form imports only `Alert` from `@/components/ui` (hand-built input/select/textarea/button).
  None of the three files is in `CLEAN_VIEWS` (`scripts/check-ui-literals.mjs`).
- **Done when:** phone rules from CLAUDE.md hold at 360 px (controls ≥ 40 px, focus via `ring`, rows stack
  below 640 px), the 7-state matrix is shown in `/dev/ui`, and the three files are added to `CLEAN_VIEWS`.
