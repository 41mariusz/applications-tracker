# Follow-ups from the implementation review (2026-10-10)

Source: `reviews/impl-review.md`, finding F8. Out of scope for S-06; pick up in S-07 (phone-friendly-form) or S-12 (audit-findings-closed).

- **Details view, closed application** — `src/pages/applications/[id]/index.astro:112` still marks a closed application with `line-through opacity-60`. The list now uses struck-through muted text with the status control at full contrast (`ApplicationCard.astro`); align the details view with it.
- **Topbar e-mail wrapping** — `src/components/Topbar.astro` uses `break-all`; the phone rule in CLAUDE.md is `wrap-anywhere`. Topbar also stays wider than the content column on desktop and has 20 px links (S-06 audit, deferred).
