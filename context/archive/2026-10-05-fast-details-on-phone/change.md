---
change_id: fast-details-on-phone
title: Application details readable and fast on a phone during a call
status: archived
created: 2026-10-05
updated: 2026-10-05
archived_at: 2026-10-05T12:06:21Z
---

## Notes

Roadmap S-04 (milestone M-1 "Ready for real use"); risk "Latency from multiple sequential Supabase calls per page" in `context/foundation/infrastructure.md`. Worked through `/10x-ui` (course M2L5).

- **View (one):** `/applications/[id]` — `src/pages/applications/[id]/index.astro` with its islands `StatusControl`, `NotesPanel`, `CvPanel` (and the shared `Topbar`).
- **Token source:** `src/styles/global.css` — shadcn tokens in `:root` / `.dark`, published via `@theme inline`; components in `src/components/ui/` (shadcn "new-york").
- **Contract variant:** fresh starter with a dead token file — the view uses 72 literal palette/arbitrary-value classes and 0 semantic token classes (pre-audit 2026-10-05). Phase 1 makes the view read the existing tokens; new values come only after that.
- **Roadmap outcome to keep:** call-critical info (salary range, quoted rate, status, latest agreement) visible first and quickly on a 360 px phone — measure load time before optimising (roadmap unknown: "is the page actually slow on a phone today?").

Adaptation 2026-10-05 (Phase 1): `color-scheme: dark` was not set globally — `ApplicationForm.tsx` (new/edit pages, out of scope) has `<option className="text-black">`, which a global dark scheme would render black-on-dark. Phase 3 scopes it to the details view instead (`scheme-dark` on the view container). shadcn's generated files import `cn` from `@/lib/utils` (the CLI defaulted to the npm `cn` package, which was removed).

Phase 2 gate note (2026-10-05): pixel diff before/after — /dashboard, /cv, /auth/signin at 1280 px: 0.0000 %; /auth/signin at 360 px: 0.0000 %; /dashboard and /cv at 360 px: 4.24 %, entirely in x = 360–375 px (pages are 376 px wide because the Topbar overflows — charge C4, fixed in Phase 3), where the canvas changed from white (255,255,255) to the token navy (10,14,26). The visible viewport (0–359 px) is identical. Accepted by the owner as meeting 2.2.

Phase 3 notes (2026-10-05): `StatusControl` is also rendered on `/dashboard`, so its pill there now uses `NativeSelect` (component chevron instead of the "▾" glyph) — a small, consistent change outside the one view, accepted as part of migrating this shared island (like `Topbar`). `ui/button.tsx` `link` variant now uses `text-link`; `ui/native-select.tsx` gained an optional `wrapperClassName`. 360 px check: details page `scrollWidth = 360` with a long company name and a long URL in a note. Pre-existing: `/dashboard` overflows at 360 px with a very long company name (not migrated here — follow-up for the dashboard change).

Impl-review fixes (2026-10-05): Radix comes only from the umbrella `radix-ui` package (what the current shadcn registry generates; `Slot.Root` in `ui/button.tsx` and `ui/badge.tsx`, `Label` in `ui/label.tsx`); `@radix-ui/react-slot` was removed from `package.json` — the `@radix-ui/*` entries in the lockfile are transitive dependencies of `radix-ui`.
