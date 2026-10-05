---
date: 2026-10-05T09:57:01Z
researcher: Claude (Opus 5.5) for Mariusz Michalak
git_commit: 62a42bd
branch: main
repository: applications-tracker
topic: "UI audit of /applications/[id] (tokens, components, entry architecture, 7 states) and whether the page is slow on a phone"
tags: [research, ui, design-tokens, shadcn, tailwind, application-details, performance]
status: complete
last_updated: 2026-10-05
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Owner decisions on theme and scope (Open Questions 1-2)"
---

# Research: application details view — UI contract audit and phone speed

**Date**: 2026-10-05T09:57:01Z
**Researcher**: Claude (Opus 5.5) for Mariusz Michalak
**Git Commit**: 62a42bd
**Branch**: main
**Repository**: applications-tracker

## Research Question

Roadmap S-04 (`fast-details-on-phone`), run through `/10x-ui`: audit the one view `/applications/[id]` in both directions (token/component source ↔ view), check its entry architecture and 7-state matrix at a 360 px phone width, and answer the roadmap unknown "is the details page actually slow on a phone today?". Output: 3–5 charges with file, line and user impact.

## Summary

- **The page is not slow.** Production, last 7 days (33 `GET /applications/<id>` requests, served from Warsaw): wall time P50 **223 ms**, P90 672 ms, max 1448 ms (one outlier followed by 183 and 147 ms); CPU P50 26 ms, max 69 ms; all `ok`. Far inside the PRD's "< 10 s during a call". Speed work is optional, not the core of this change.
- **The token file is dead and wrong for this app.** `src/styles/global.css` holds the stock shadcn neutral palette (white `:root`, grey `.dark`); `.dark` is never activated (`src/layouts/Layout.astro:16` has no class), and the app's actual dark navy/purple look lives only in `bg-cosmic` hex literals (`global.css:113-115`) and palette classes in views. The 6 view files contain **72** literal palette/arbitrary classes and **0** semantic token classes (pre-audit scan, 2026-10-05).
- **Shared components are not used:** `src/components/ui/button.tsx` is imported only by `auth/SubmitButton.tsx` (which overrides it with purple literals); buttons, cards, inputs/selects, chips and error boxes are hand-built and copy-pasted.
- **Keyboard focus is mostly invisible:** no button or link in the view has a focus style; the 3 inputs that have one use `focus:` (not `focus-visible:`) with a literal purple; the base outline is grey on a dark background.
- **Entry/layout gaps:** a malformed id (`/applications/abc`) and a Supabase error both show "Nie udało się wczytać aplikacji." with **HTTP 200**; there is no `404.astro`; sign-in does not return to the requested application; the Topbar row does not wrap at 360 px; no `break-words` for long names/URLs in notes and history.

## Charges

Each charge: file:line, category, effect on the user.

1. **C1 — Missing tokens: the token source describes a theme the app never shows** (missing tokens). `src/styles/global.css:6-73` (neutral white/grey `:root` and `.dark`), `:113-115` (`bg-cosmic` hex literals), `src/layouts/Layout.astro:16` (no `dark` class); 72 literals in the view, e.g. muted text in five shades `text-blue-100/50|/60|/70|/80` and `text-white/80` (e.g. `src/pages/applications/[id]/index.astro`, `Topbar.astro:5,8`), primary actions `bg-purple-600 hover:bg-purple-500` (`NotesPanel.tsx:133`, `CvPanel.tsx:114`), errors `text-red-300` / `bg-red-500/20` (`index.astro:58`, `NotesPanel.tsx:128`). **Effect:** secondary text has inconsistent contrast across sections, and any later restyle or dark/light fix means editing dozens of class strings per view; a `bg-primary` would render near-black on navy, which is why the views drifted to literals.
2. **C2 — Missing shared components** (missing shared component). Hand-built buttons: `NotesPanel.tsx:80,130,138,193,202`, `CvPanel.tsx:108,119`, `Topbar.astro:17`; repeated card markup: `index.astro:60,68,89,122,154`, `NotesPanel.tsx:161,180,233`, `CvPanel.tsx:98`; three copies of the input/select class string: `NotesPanel.tsx:11` (`inputClass`), `CvPanel.tsx:17` (`selectClass`), `StatusControl.tsx:59`; status pill `StatusControl.tsx:59` and note-kind chips `NotesPanel.tsx:88-90`; error boxes `index.astro:58`, `NotesPanel.tsx:128`. `ui/button.tsx` is unused here. **Effect:** buttons and fields look and behave slightly differently in each panel (hover, disabled, focus), and every UI fix must be repeated in several places.
3. **C3 — Focus-visible and loading states missing** (states). No focus style on any button or link in the view (e.g. `Topbar.astro:10,13,17`, `NotesPanel.tsx:138,193,202`, `CvPanel.tsx:108`); inputs use `focus:ring-purple-400` (`StatusControl.tsx:59`, `NotesPanel.tsx:12`, `CvPanel.tsx:18`); base `outline-ring/50` is grey (`global.css:119`). Loading gaps: `StatusControl` shows no pending text, only opacity (`StatusControl.tsx:57-59`); note delete has no pending state (`NotesPanel.tsx:152-156`); `CvPanel` is `client:visible` (`index.astro:120`), so its controls are inert until scrolled into view and hydrated. **Effect:** with a keyboard (or a phone with a hardware keyboard) the user cannot see where they are; status changes give no "saving" feedback during a call.
4. **C4 — Entry architecture and 360 px layout** (accidental architecture). Malformed id or Supabase failure → generic "Nie udało się wczytać aplikacji." with HTTP 200 (`index.astro:22-28`), only a missing/foreign UUID gets 404 (`:30-32`, card at `:59-63`); no `src/pages/404.astro`; middleware redirects to `/auth/signin` without a return path (`src/middleware.ts:36-39`); `Topbar` is a non-wrapping `flex justify-between` row (`Topbar.astro:5-9`) with ~296 px usable at 360 px; no `break-words` on h1 (`index.astro:74`), note bodies (`index.astro:93`, `NotesPanel.tsx:208`), history values (`index.astro:171-172`), CV file name (`CvPanel.tsx:104`). **Effect:** opening a mistyped or stale link from a phone shows a load error instead of "not found"; after signing in from a link the user lands on the dashboard, not the application they wanted; the top bar can squash or overflow on a 360 px phone; a long URL in a note can force horizontal scrolling.
5. **C5 — Sequential data loading (deferred)** (performance). 6 Supabase requests in 3 waves: middleware `auth.getUser()` (`src/middleware.ts:15`) → `Promise.all` of the application row and the whole CV library (`index.astro:23`, `src/lib/services/cv.ts:58`) → `Promise.all` of notes, status changes and field changes (`src/lib/services/notes.ts:92-110`). **Effect:** measured P50 223 ms / P90 672 ms — acceptable; parallelising would shave latency but is not needed for the call scenario. **Deferred:** measured speed already meets the roadmap outcome; revisit if P90 exceeds ~1.5 s.

## Detailed Findings

### Token source vs the rendered look

- `:root` (`global.css:6-39`): `--background` white, `--primary` near-black, `--muted-foreground` mid-grey; `.dark` (`:41-73`): greys, `--border` white/10%. Neither contains the app's navy/purple. `@custom-variant dark` is declared (`:4`) but no element gets `dark`.
- `body` gets `bg-background text-foreground` (`global.css:122`) — white with near-black text — and `bg-cosmic` covers it on 9 pages.
- Semantic token classes in the 6 view files: 0. Only `ui/button.tsx:8` uses `focus-visible:ring-ring/50`.

### Literal groups (view → source)

| Role                      | Literal(s), count, example                                               | Token that should cover it               |
| ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| Page background           | `bg-cosmic` ×1 (`index.astro:51`)                                        | `--background` (navy)                    |
| Panel surface             | `bg-white/5` ×8, `bg-white/10` ×~5 (`index.astro:69` vs `:122`)          | `--card` (+ one raised level if kept)    |
| Borders                   | `border-white/10` ×8, `/20` ×6                                           | `--border`, `--input`                    |
| Primary action            | `bg-purple-600 hover:bg-purple-500` ×3                                   | `--primary` / `--primary-foreground`     |
| Links / secondary actions | `text-purple-300` ×12, `hover:text-purple-100` ×4                        | Button `link` variant or a `--link` role |
| Muted text                | `text-blue-100/50` ×3, `/60` ×15, `/70` ×9, `/80` ×1, `text-white/80` ×1 | `--muted-foreground` (≤ 2 steps)         |
| Errors                    | `text-red-300` ×5, `text-red-200` + `bg-red-500/20` ×2                   | `--destructive`                          |
| Chips / selected          | `bg-purple-500/30`, `border-purple-300 bg-purple-500/40`                 | `--accent` / `--secondary`               |
| Revert warning            | `text-amber-300` (`index.astro:166`)                                     | new `--warning`                          |
| Inputs / options          | `bg-white/10 border-white/20`, `text-black` ×5 on `<option>`             | `--input`, `--popover`                   |
| Focus                     | `focus:ring-purple-400` ×3                                               | `--ring`                                 |

### 7-state matrix (today)

| State         | Today                                                             | Gap                                                                |
| ------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| default       | renders, literals only                                            | not token-built                                                    |
| hover         | `hover:underline` / `hover:bg-*` literals                         | not token-driven                                                   |
| focus-visible | 3 inputs with `focus:`; buttons/links none                        | **missing**                                                        |
| disabled      | StatusControl, NotesPanel submit, CvPanel controls                | CvPanel button without disabled style                              |
| error         | messages in all islands and page                                  | literal reds, no shared alert                                      |
| empty         | "Brak notatek.", "Nie dołączono CV.", "—", "Bez zmian od dodania" | ok                                                                 |
| loading       | "Zapisywanie…" in NotesPanel/CvPanel                              | none in StatusControl, note delete; CvPanel inert before hydration |

### Phone layout (360 px)

DOM order: Topbar → back link → call summary (company/position + status pill, salary range and quoted rate in a 2-column grid, latest agreement, HR with `tel:` link) (`index.astro:68-116`) → NotesPanel (add form before timeline) → CvPanel → Szczegóły → Historia zmian. Call-critical info is first and compact (FR-006 holds); HR phone is last in the summary and a long latest note pushes it down.

### Speed (Cloudflare Workers Observability, 2026-09-29 → 2026-10-05, read-only)

| Route (GET)          | Count | wall P50 / P90 / max | CPU P50 / P90 / max | Statuses      |
| -------------------- | ----- | -------------------- | ------------------- | ------------- |
| `/applications/<id>` | 33    | 223 / 672 / 1448 ms  | 26 / 58 / 69 ms     | 31×200, 2×302 |
| `/dashboard`         | 29    | 380 / 772 / 1886 ms  | 112 / 185 / 280 ms  | 26×200, 3×302 |

Wall ≈ 8–10× CPU on the details page → mostly I/O wait. Per-subrequest timings are not available in the events (no spans).

## Code References

- `src/styles/global.css:4,6-73,113-115,119,122` — dark variant, token values, `bg-cosmic`, base outline, body colours
- `src/layouts/Layout.astro:16` — `<html lang="pl">` without `dark`
- `src/pages/applications/[id]/index.astro:22-32,51,58-63,68-116,120,154-179` — data load, error/404, background, call summary, CvPanel hydration, history
- `src/components/Topbar.astro:5-21` — non-wrapping top bar, link buttons
- `src/components/applications/StatusControl.tsx:57-64,72`, `NotesPanel.tsx:11-12,80-90,128-138,152-156,193-209,233-256`, `CvPanel.tsx:17-18,98-177`
- `src/components/ui/button.tsx:8`, `src/components/auth/SubmitButton.tsx:3,18`
- `src/middleware.ts:15,36-39`; `src/lib/services/notes.ts:84-110`; `src/lib/services/cv.ts:58`

## Architecture Insights

- Contract variant: **fresh starter with a dead token file** — the fix starts by giving the existing token names the app's real values (dark navy/purple as the only theme) and making this view read them; new token names (`--warning`, maybe a raised surface) only where a role has no token.
- `components.json` is shadcn "new-york"; components are added with `npx shadcn@latest add <name>` (CLAUDE.md "Key conventions").
- Agent rules (CLAUDE.md / AGENTS.md :56-57) mention `cn()` and the shadcn path but say nothing about using tokens or `src/components/ui` first, nor forbid palette literals — the guard this change must leave.

## Historical Context (from prior changes)

- `context/archive/2026-10-04-cv-upload-5mb-in-production/` — added the `CvPanel` reload delay and disabled states (2026-10-05); C2/C3 build on that component.
- `context/foundation/infrastructure.md` risk "Latency from multiple sequential Supabase calls per page" (L/M) — **supported** as a description of the loading pattern (C5), **not supported** as a user-visible problem today: measured P90 672 ms.

## Related Research

- `context/archive/2026-10-04-cv-upload-5mb-in-production/research.md` — same Observability query method (CPU/wall per invocation).

## Open Questions

1. Should the app keep a single dark theme (tokens = current navy/purple look) or also offer light mode? Product choice for `/10x-plan`; the audit assumes one dark theme because that is what every page renders today.
2. How far should this change reach beyond the one view? Token values are global (they affect every page); component swaps should stay within this view per `/10x-ui` rules.

## Follow-up 2026-10-05: owner decisions

Resolves Open Questions 1–2.

1. **Theme:** one dark theme only — no light mode. The token values take the app's current navy/purple look.
2. **Scope:** token values are set to the colours the app shows today, so no page changes visually from the token edit alone (other pages use literal classes and barely read tokens). Only `/applications/[id]` (page + `StatusControl`, `NotesPanel`, `CvPanel`, and the shared `Topbar` it renders) moves to tokens and shared components and gets the C3/C4 fixes. `/dashboard`, `/cv` and sign-in stay as they are and migrate in later, separate changes.
