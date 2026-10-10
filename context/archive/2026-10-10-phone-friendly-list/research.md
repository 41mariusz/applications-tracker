---
date: 2026-10-10T08:17:36Z
researcher: Claude (agent) for the repository owner
git_commit: 908468945bbd94d9b25cba319a2d3b4b94f012a4
branch: main
repository: applications-tracker
topic: "/10x-ui audit of /dashboard (application list) against the design-system contract and a 360 px phone"
tags: [research, ui, dashboard, tokens, mobile, focus, s-06]
status: complete
last_updated: 2026-10-10
last_updated_by: Claude (agent)
---

# Research: /dashboard UI audit (S-06)

**Date**: 2026-10-10T08:17:36Z
**Researcher**: Claude (agent) for the repository owner
**Git Commit**: 908468945bbd94d9b25cba319a2d3b4b94f012a4
**Branch**: main
**Repository**: applications-tracker

## Research Question

Two-way `/10x-ui` audit of the one view `/dashboard` (`src/pages/dashboard.astro`):

- **Source → view:** which tokens and shared components exist, and which the view reads.
- **View → source:** each literal in the view, and the token or component that should cover it.

The audit also measures the view on a 360 px phone and checks keyboard focus, then lists 3–5 charges for the plan.

Labels: **[E]** evidence (code read, or measured in a local production preview), **[I]** inference.

## Summary

- **The view reads none of the contract.** `/dashboard` has 13 lines with literal colour classes (about 30 occurrences), 0 token classes and 0 imports from `src/components/ui/`, while the design system is complete and already used by the details view [E].
- **No horizontal overflow at 360 px with realistic data,** but the overflow is latent: a company name with no break opportunity pushes the page to 598 px [E].
- **On a phone the status pill jumps around.** It sits under the title in 7 of 8 cards and to the right in the remaining one [E].
- **Tap targets are small:** filter chips and the status pill are 26 px tall, links 17 px [E].
- **Keyboard focus is invisible on the status filter chips,** and weak (browser default) on the company link and the add button [E].
- **Closed applications are dimmed as a whole,** including their status control [E].
- **Entry points are sound:**
  - an anonymous visit redirects to sign-in;
  - an empty list has a real empty state;
  - a failed read shows a message with status 500;
  - a paused project redirects;
  - bookmarked `?q=` / `?status=` work.

  No accidental-architecture charge on the route.

## Detailed Findings

### Source → view

- **Tokens** live in `src/styles/global.css` (`:root`, one dark theme), with the original literals on record in `context/archive/2026-10-05-fast-details-on-phone/tokens.md` [E]. The roles are:

  | Role                      | Replaces           |
  | ------------------------- | ------------------ |
  | `--card`                  | `bg-white/5`       |
  | `--muted`                 | `bg-white/10`      |
  | `--border`                | `border-white/10`  |
  | `--input`                 | `border-white/20`  |
  | `--primary`               | `bg-purple-600`    |
  | `--accent`                | `bg-purple-500/40` |
  | `--muted-foreground`      | `text-blue-100/60` |
  | `--supporting-foreground` | `text-blue-100/70` |
  | `--destructive`           | text red           |
  | `--ring`                  | `ring-purple-400`  |
  | `--link`                  | text purple        |

  The page background is the utility `bg-cosmic`.

- **Components** in `src/components/ui/`: `alert`, `badge`, `button`, `card`, `input`, `label`, `native-select`, `textarea`, `LibBadge.astro` [E].
- **What already reads them:** the details view, Topbar, StatusControl, NotesPanel, CvPanel, Layout, 404/500 and `/dev/ui` (`scripts/check-ui-literals.mjs` `CLEAN_VIEWS`) [E].
- **What `/dashboard` reads:** 0 token classes and 0 `components/ui` imports. It uses only Topbar and StatusControl, which are on the contract [E].
- **Agent rules:** CLAUDE.md "UI contract" already forbids literal colours in views. No rule invites one-off values [E]. The drift exists because the view predates the contract (S-04 explicitly left `/dashboard` for a later change: `context/archive/2026-10-05-fast-details-on-phone/plan.md:36`).

### View → source: literals

Hardcoded-value scan on `src/pages/dashboard.astro`: **13 lines** [E].

| Line          | Literal                                                                                                                                                                | Should be                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 46            | `text-white` (content column)                                                                                                                                          | `text-foreground` (inherits)                                                          |
| 51            | `bg-purple-600 … hover:bg-purple-500` (add link)                                                                                                                       | `Button` (primary) as a link                                                          |
| 57            | `bg-red-500/20 … text-red-200` (load error)                                                                                                                            | `Alert` (destructive) / `text-destructive`                                            |
| 60            | `border-white/10 bg-white/5 … text-blue-100/70` (empty state)                                                                                                          | `border-border bg-card text-supporting-foreground`                                    |
| 77            | `border-white/20 bg-white/10 … text-white placeholder-white/40 focus:ring-purple-400` (search)                                                                         | `Input`                                                                               |
| 82            | `border-white/20 bg-white/5 … text-blue-100/80 … hover:bg-white/10 has-[:checked]:border-purple-300 has-[:checked]:bg-purple-500/40 has-[:checked]:text-white` (chips) | `border-input bg-card text-supporting-foreground hover:bg-muted`, checked `bg-accent` |
| 94            | `bg-purple-600` (no-JS submit)                                                                                                                                         | `Button`                                                                              |
| 99, 102       | `text-blue-100/60`, `text-blue-100/70`                                                                                                                                 | `text-muted-foreground`, `text-supporting-foreground`                                 |
| 112           | `border-white/10 bg-white/10 … backdrop-blur-xl` (card)                                                                                                                | `border-border bg-card` (as on the details view)                                      |
| 130, 132, 138 | `text-blue-100/70`, `/50`, `/80`                                                                                                                                       | `text-supporting-foreground` / `text-muted-foreground`                                |

### Measured on a 360 px phone

Production preview against local Supabase; 8 test applications with long names, positions and salary text. Screenshots in `screenshots/` [E].

- **No horizontal overflow** with the test data: `scrollWidth 360 = clientWidth 360`, and 0 elements past the right edge. A long hyphenated company name wraps to 3 lines and is not clipped.
- **Latent overflow:** a company name without spaces or hyphens makes `scrollWidth` 598. The title block (lines 126–128) has no `break-words` / `min-w-0`, and neither do position and salary (lines 130–141) (`screenshots/before-dashboard-360-unbreakable-name.png`).
- **Status pill placement:**
  - The header row (`flex flex-wrap … justify-between`, line 125) wraps the 145×26 px status control below the title in 7 of 8 cards.
  - In those cards it sits at the left edge. In the eighth card ("Umbrella", short title) it stays at the top right.
  - The control's own `items-end` does nothing once it wraps (`screenshots/before-dashboard-360.png`).
- **Tap targets:**

  | Element       | Height         |
  | ------------- | -------------- |
  | Filter chips  | 26 px          |
  | Status select | 26 px          |
  | Company link  | 17 px per line |
  | Topbar links  | 20 px          |
  | Add button    | 36 px          |
  | Search input  | 50 px          |

- **Search placeholder** is truncated at 360 px ("…nazwisko lub").
- **Title row:** the h1 and "+ Dodaj aplikację" fit on one line.

### Keyboard focus (1280 px)

Tab order: Topbar → add button → search → 6 chips → per card: company link, status select [E].

| Control                  | Focus indicator                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Search input (line 77)   | 2 px purple ring — visible                                                                                         |
| Filter chip (line 82/88) | **none** on the visible label; focus sits on the 1×1 `sr-only` checkbox (`screenshots/before-chip-focus-1280.png`) |
| Company link (line 127)  | browser default `outline: auto`, faint on the dark card                                                            |
| Add button (line 51)     | browser default outline only, weak on the purple fill                                                              |
| Status select, Topbar    | 3 px ring — visible (already on the contract)                                                                      |

### Entry points (accidental-architecture check)

- **Signed out:** `/dashboard` is in `PROTECTED_ROUTES` and redirects to `/auth/signin?next=…`; smoke "dashboard redirects anonymous user" covers it [E].
- **No data:** a real empty state with a call to action (line 59–63) [E].
- **Failed read:** a message, status 500 and one logged line (lines 19–25). A paused project redirects to `/paused` (line 20) [E].
- **Straight from a link:** `?q=` and `?status=` filter on the server, and an unknown status value is ignored (`src/lib/domain/search.ts`). The test run confirmed `?status=offer` and a no-results query [E].
- **Result:** no route-level accidental-architecture charge.

### Test contracts the change must keep

- **Smoke:**
  - each card is an `<li ` with an `href="/applications/<id>"`, a `data-status` attribute and the `line-through` class on closed items (`scripts/smoke.mjs:254-262`);
  - `?status=` / `?q=` behaviour (`:470-475`, `:192`).
- **E2E:**
  - searchbox named "Szukaj", text "Brak wyników", test id `search-count`, company links by name (`tests/e2e/call-phone-search.spec.ts:59-81`);
  - test ids `applications-list`, `status-filter`, `application-visible` (`src/pages/dashboard.astro:79,108,116`).

## Charges

| #   | Category                         | Where                                                                                                                                                                                                                                  | Effect on the user                                                                                                                                                                     |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Missing tokens                   | `src/pages/dashboard.astro:46,51,57,60,77,82,94,99,102,112,130,132,138` — about 30 literal classes; 0 token classes                                                                                                                    | The list is styled apart from the rest of the app, so any token change (contrast, focus colour) never reaches the screen the owner uses most.                                          |
| C2  | Missing shared component         | add link `:49-54` (hand-built button), search `:70-78` (hand-built input), load error `:57` (hand-built alert), card `:110-114` (copy of the card surface) — vs `Button`, `Input`, `Alert` and the card tokens in `src/components/ui/` | The same controls look and behave differently here than on the details view; the hand-built add button has only the browser's faint focus outline.                                     |
| C3  | Missing tokens (focus state)     | chips `:82` / `:88` (focus on an `sr-only` checkbox, label without a focus style); company link `:127`; add link `:51`                                                                                                                 | A keyboard user cannot see which status filter is focused, and barely sees focus on the main links.                                                                                    |
| C4  | Accidental architecture (layout) | header row `:125` + StatusControl wrapper; title/position/salary `:126-141` without wrapping rules; chips `:82` and status control 26 px tall                                                                                          | On a phone the status pill is in a different place on each card, a long unbroken name would push the page sideways, and the chips and pill are hard to hit with a thumb during a call. |
| C5  | Missing tokens (state)           | closed item `:113` `opacity-50` on the whole card                                                                                                                                                                                      | A closed application's status control is dimmed to half contrast although it still works (it is how the owner reopens a revert).                                                       |

**Not charges (recorded):**

- **Topbar width:** at 1280 px the Topbar spans wider than the `max-w-3xl` content column. Layout-wide (`Layout`/`Topbar`), outside this one-view change → **deferred** to a later UI change.
- **Truncated search placeholder:** at 360 px it is a copy-length issue. It folds into C4 (shorter phone placeholder or wrapping) only if the plan chooses so.
- **`LibBadge.astro`:** carries literals (`bg-blue-900/50`, …) but is not used by `/dashboard` → out of scope.

## Code References

- `src/pages/dashboard.astro:43-148` — the view; literal lines listed above
- `src/styles/global.css` `:root` — token values; `@utility bg-cosmic` (page background)
- `src/components/ui/{button,input,alert,card,badge}.tsx` — components to use
- `src/components/applications/StatusControl.tsx:54,64` — status control wrapper (`flex flex-col items-end`) and pill
- `scripts/check-ui-literals.mjs:6-17` — `CLEAN_VIEWS` (add `src/pages/dashboard.astro` when clean)
- `scripts/smoke.mjs:254-262,470-475`; `tests/e2e/call-phone-search.spec.ts:59-81` — markup contracts to keep

## Architecture Insights

- **This is the "existing design system" variant.** Every role the view needs already exists as a token, and every control has a component. Nothing new needs to be added to `global.css` or via `shadcn add`.
- **The details view (S-04) is the reference** for how this repo applies the contract: card tokens, `Button` variants, `Alert`, ring focus. `/dev/ui` is the kitchen sink to extend.

## Historical Context (from prior changes)

- `context/archive/2026-10-05-fast-details-on-phone/` — the S-04 change:
  - defined the tokens from the existing literals (`tokens.md`);
  - moved the details view onto them;
  - fixed the Topbar at 360 px;
  - added `scripts/check-ui-literals.mjs` and `/dev/ui`;
  - explicitly left `/dashboard` for a later change (`plan.md:36`).
- `context/map/repo-map.md` named the dashboard as the screen that breaks on a small phone. This audit refines that: no current overflow with realistic data, but a latent one, plus the unstable pill and small targets.

## Related Research

- `context/archive/2026-10-05-fast-details-on-phone/research.md` — the same audit method on the details view.

## Open Questions

- None blocking. Which tap-target height to aim for (e.g. 32–40 px for chips and the pill, against keeping the list compact) is a plan-level design choice.
