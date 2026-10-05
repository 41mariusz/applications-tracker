---
change_id: fast-details-on-phone
title: Application details readable and fast on a phone during a call
status: implementing
created: 2026-10-05
updated: 2026-10-05
archived_at: null
---

## Notes

Roadmap S-04 (milestone M-1 "Ready for real use"); risk "Latency from multiple sequential Supabase calls per page" in `context/foundation/infrastructure.md`. Worked through `/10x-ui` (course M2L5).

- **View (one):** `/applications/[id]` — `src/pages/applications/[id]/index.astro` with its islands `StatusControl`, `NotesPanel`, `CvPanel` (and the shared `Topbar`).
- **Token source:** `src/styles/global.css` — shadcn tokens in `:root` / `.dark`, published via `@theme inline`; components in `src/components/ui/` (shadcn "new-york").
- **Contract variant:** fresh starter with a dead token file — the view uses 72 literal palette/arbitrary-value classes and 0 semantic token classes (pre-audit 2026-10-05). Phase 1 makes the view read the existing tokens; new values come only after that.
- **Roadmap outcome to keep:** call-critical info (salary range, quoted rate, status, latest agreement) visible first and quickly on a 360 px phone — measure load time before optimising (roadmap unknown: "is the page actually slow on a phone today?").

Adaptation 2026-10-05 (Phase 1): `color-scheme: dark` was not set globally — `ApplicationForm.tsx` (new/edit pages, out of scope) has `<option className="text-black">`, which a global dark scheme would render black-on-dark. Phase 3 scopes it to the details view instead (`scheme-dark` on the view container). shadcn's generated files import `cn` from `@/lib/utils` (the CLI defaulted to the npm `cn` package, which was removed).
