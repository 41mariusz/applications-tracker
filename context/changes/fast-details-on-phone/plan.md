# Application Details on a Phone — UI Contract Implementation Plan

## Overview

Make `/applications/[id]` — the screen opened during a recruiter's call — built from the repo's design-system contract (semantic tokens + shared components) instead of 72 literal classes, and fix what the audit found on a phone: invisible keyboard focus, missing "saving" feedback, a misleading error for bad links, no return to the application after sign-in, and a top bar that does not fit 360 px. Speed was measured and is fine (P50 223 ms); it is not optimised here.

Roadmap: S-04 `fast-details-on-phone` (milestone M-1). Research: `context/changes/fast-details-on-phone/research.md` (charges C1–C5 + owner decisions). Worked through `/10x-ui` (course M2L5).

## Current State Analysis

- Token source `src/styles/global.css:6-73` holds the stock shadcn neutral palette (white `:root`, grey `.dark`); `.dark` is never activated (`src/layouts/Layout.astro:16`); the real look is `bg-cosmic` hex literals (`global.css:113-115`) plus palette classes in views.
- The 6 view files (`src/pages/applications/[id]/index.astro`, `src/components/Topbar.astro`, `src/components/applications/{StatusControl,NotesPanel,CvPanel}.tsx`, `src/layouts/Layout.astro`) contain 72 literal palette/arbitrary classes and 0 semantic token classes.
- `src/components/ui/button.tsx` is used only by `auth/SubmitButton.tsx`; buttons, cards, inputs/selects, chips and error boxes are hand-built (research C2 lists file:line).
- No focus style on buttons/links; inputs use `focus:` with a literal purple (research C3).
- Malformed id / Supabase error → "Nie udało się wczytać aplikacji." with HTTP 200 (`index.astro:22-28`); no `src/pages/404.astro`; middleware redirects to `/auth/signin` without a return path (`src/middleware.ts:36-39`); `Topbar` row does not wrap (`Topbar.astro:5-9`); no `break-words` on long text (research C4).
- Smoke test compares redirect locations with `startsWith` (`scripts/smoke.mjs:390`), so `/auth/signin?next=…` keeps existing steps passing.

## Desired End State

- `global.css` tokens carry the app's current dark look (one theme); `bg-cosmic` reads tokens; other pages look exactly as before.
- The details view (page, `Topbar`, three islands) uses only semantic token classes and components from `src/components/ui/`; the hardcoded-value scan finds 0 hits in those files.
- Every control in the view shows a token-driven `focus-visible` ring; status change and note removal show a pending state; the CV panel is interactive without scrolling to it.
- A malformed or unknown application id gives HTTP 404 with a Polish "not found" page; a Supabase failure gives HTTP 500; signing in from a protected link returns to that link.
- A dev-only kitchen sink at `/dev/ui` shows the view's components in all 7 states; screenshots at 1280 px and 360 px are kept in the change folder.
- `CLAUDE.md` tells the next agent where tokens/components live and forbids literal colours in views; `npm run lint` fails if a literal comes back into the cleaned files.

### Key Discoveries:

- Contract variant: fresh starter with a dead token file — give existing token names the real values, then make the view read them (research "Architecture Insights").
- shadcn "new-york" via `components.json`; add components with `npx shadcn@latest add <name>` (CLAUDE.md Key conventions).
- Sign-in form posts natively to `/api/auth/signin` (`src/components/auth/SignInForm.tsx:43`), so `next` can travel as a hidden field.
- The hardcoded-value scan (from `/10x-ui`) is the measure for C1: 72 → 0 on the view's files.

## What We're NOT Doing

- Migrating `/dashboard`, `/cv`, `/applications/new`, `/applications/[id]/edit` or sign-in to tokens/components (later, separate changes). They must look unchanged.
- Light mode or new colours — tokens take today's values (owner decision).
- Data-loading optimisation (C5, deferred: P50 223 ms / P90 672 ms meets the call scenario; revisit if P90 > ~1.5 s).
- Adding Playwright or any screenshot-testing dependency to the repo (planned for course lesson M3L4); screenshots are taken with a throwaway headless browser outside the repo.
- Changing what data the page shows or its section order (FR-006 holds: call-critical info first).

## Implementation Approach

Contract before pixels: first make the components and theme environment available (no visual change), then give the tokens the current values and prove other pages did not move, then rebuild the one view on tokens/components, then fix entry and states with a kitchen sink as evidence, and finally leave the rule and the lint check so the next agent stays on the contract.

## Critical Implementation Details

- **Never swap `.env` for local tests.** For previews against local Supabase write only `/home/dev/10xdevs/.dev.vars` (absolute path) and delete it afterwards; `.env` holds cloud secrets that exist nowhere else (see memory/lesson from 2026-10-05).
- **`next` must stay inside the app.** Accept only paths that start with a single `/` (reject `//…`, `/\…`, absolute URLs) — otherwise the sign-in becomes an open redirect.
- **Topbar is shared.** It renders on every page; migrating it changes all pages' markup but, with tokens equal to today's colours, not their look — the Phase 2 before/after screenshots cover this.

## Phase 1: Components and theme environment

### Overview

Make the shared components this view needs available and put native controls in dark mode, with no visible change yet.

### Changes Required:

#### 1. shadcn components

**File**: `src/components/ui/` (new: `card.tsx`, `badge.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `alert.tsx`)

**Intent**: Provide the repo-owned components the view will use instead of hand-built markup.

**Contract**: Added with `npx shadcn@latest add card badge input textarea label alert`; unchanged generated code (shadcn "new-york").

#### 2. Native select

**File**: `src/components/ui/native-select.tsx`

**Intent**: One shared styled `<select>` (status change, CV library pick) instead of three copied class strings; use shadcn's `native-select` if the registry provides it, otherwise a small component styled like `input.tsx`.

**Contract**: `NativeSelect` accepting standard `<select>` props, styled with `border-input`, `bg-transparent`, `focus-visible:ring-ring`.

#### 3. Dark native controls

**File**: `src/layouts/Layout.astro` (or the base layer in `src/styles/global.css`)

**Intent**: Native `<select>`/`<option>` and scrollbars render dark, removing the need for `text-black` on options.

**Contract**: `color-scheme: dark` on the root element.

### Success Criteria:

#### Automated Verification:

- Lint and type check pass: `npm run lint && npx astro check`
- Unit tests pass: `npm test`
- Production build succeeds: `npm run build`

#### Manual Verification:

- None — no visible change is expected in this phase

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Token values = today's look

### Overview

Give the existing token names the app's real colours (one dark theme) and make `bg-cosmic` read tokens, without moving a pixel on any page.

### Changes Required:

#### 1. Token values

**File**: `src/styles/global.css`

**Intent**: `:root` carries the dark navy/purple look currently written as literals; `.dark` mirrors it (or is reduced to the same values) so no toggle can switch to the stock grey; add `--warning` (revert hint) and a link role if `--primary` cannot cover links; `bg-cosmic` uses the background tokens instead of hex.

**Contract**: Token roles mapped from research "Literal groups": `--background` (navy), `--card` (panel surface), `--border`/`--input`, `--primary` + `--primary-foreground` (purple action), `--muted-foreground` (≤ 2 steps of secondary text), `--destructive`, `--accent`/`--secondary` (chips), `--ring` (focus), `--warning` (new, published via `@theme inline`), `--popover` (native options). Values chosen to match the current literals (e.g. `bg-purple-600`, `text-blue-100/60`, `bg-white/5`, `#0a0e1a`).

#### 2. Values on record

**File**: `context/changes/fast-details-on-phone/tokens.md`

**Intent**: Deposit the chosen values and the literal each one replaces, so the next session does not reinvent them; a comment above the `:root` block points to this file.

**Contract**: Table role → token → value → replaced literal(s).

### Success Criteria:

#### Automated Verification:

- Lint, type check and build pass: `npm run lint && npx astro check && npm run build`
- Before/after screenshots of `/dashboard`, `/cv` and `/auth/signin` at 1280 px and 360 px (headless Chromium against a local preview) differ by at most 0.1 % of pixels

#### Manual Verification:

- Owner confirms on production that the dashboard, CV library and sign-in look unchanged after deploy

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Details view on tokens and components

### Overview

Rebuild the one view from tokens and repo components (C1, C2) and fix its 360 px layout (part of C4).

### Changes Required:

#### 1. Page

**File**: `src/pages/applications/[id]/index.astro`

**Intent**: Replace literal classes with token classes; panels use `Card`; error box uses `Alert`; links/buttons use `Button` variants; long text gets `break-words` (h1, latest note, history values). Section order and content unchanged.

**Contract**: 0 hits of the hardcoded-value scan in the file.

#### 2. Top bar

**File**: `src/components/Topbar.astro`

**Intent**: Token classes and `Button` (link/ghost) styling; the row wraps (or stacks) so email and three links fit at 360 px without overflow.

**Contract**: No horizontal overflow at 360 px; 0 scan hits.

#### 3. Islands

**Files**: `src/components/applications/StatusControl.tsx`, `NotesPanel.tsx`, `CvPanel.tsx`

**Intent**: Use `Button`, `Badge` (status pill, note-kind chips), `Input`/`Textarea`/`Label`, `NativeSelect`, `Alert`/token-styled error text; remove `inputClass`/`selectClass` copies; CV file name breaks long words.

**Contract**: Behaviour unchanged (same handlers, texts and API calls); 0 scan hits in each file.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan reports 0 hits in the 6 view files: `grep -cE '<scan regex from /10x-ui>' <files>` (the Phase 5 script once it exists)
- Lint, type check, unit tests pass: `npm run lint && npx astro check && npm test`
- Smoke test passes (details, notes, status and CV flows unchanged): `npm run build && npm run smoke`
- At 360 px the details page has no horizontal scroll (`document.documentElement.scrollWidth <= 360` in headless Chromium, with a long company name and a long URL in a note)

#### Manual Verification:

- On a phone the details page reads at least as clearly as before; call-critical info is still first

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Entry and the 7 states

### Overview

Fix how the view is reached (C4) and complete its state matrix (C3), with a dev-only kitchen sink as evidence.

### Changes Required:

#### 1. Not found / server error

**Files**: `src/pages/applications/[id]/index.astro`, `src/pages/404.astro` (new)

**Intent**: A malformed id (not a UUID) or an unknown/foreign id → HTTP 404 with a Polish "Nie znaleziono" page (link back to the list); a Supabase failure → HTTP 500 with the existing load-error message.

**Contract**: id validated as UUID before querying; status codes 404 / 500 as described.

#### 2. Return after sign-in

**Files**: `src/middleware.ts`, `src/pages/auth/signin.astro`, `src/components/auth/SignInForm.tsx`, `src/pages/api/auth/signin.ts` (+ a pure rule with a test in `src/lib/domain/`)

**Intent**: Redirect unauthenticated protected requests to `/auth/signin?next=<path+query>`; the form carries `next` as a hidden field; after a successful sign-in redirect to `next` when it is a safe in-app path, else `/dashboard`.

**Contract**: `safeNextPath(value: string | null): string` — returns the value only if it starts with exactly one `/` and is not `//…` or `/\…`; otherwise `/dashboard`. Unit tests cover `/applications/x`, `//evil.com`, `/\evil`, `https://evil.com`, `null`.

#### 3. States

**Files**: `StatusControl.tsx`, `NotesPanel.tsx`, `CvPanel.tsx`, `src/pages/applications/[id]/index.astro`

**Intent**: Every button/link/control shows a `focus-visible` ring from `--ring`; `StatusControl` shows "Zapisywanie…" while saving; note removal shows a pending state; `CvPanel` hydrates with `client:idle` instead of `client:visible`.

**Contract**: 7-state matrix rows from research filled: default, hover, focus-visible, disabled, error, empty, loading.

#### 4. Kitchen sink

**File**: `src/pages/dev/ui.astro` (+ any small wrappers it needs)

**Intent**: One dev-only page showing the view's components (buttons, badge, inputs, select, card, alert, empty/loading texts, the three panels with sample data) in all 7 states side by side.

**Contract**: Returns 404 unless `import.meta.env.DEV`; not linked from the app.

#### 5. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Cover the new entry behaviour.

**Contract**: `GET /applications/abc` (signed in) → 404; anonymous `GET /applications/<id>` → 302 to `/auth/signin?next=%2Fapplications%2F<id>`; sign-in POST with that `next` → 302 to `/applications/<id>`; sign-in with `next=//evil.com` → 302 to `/dashboard`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including `safeNextPath`: `npm test`
- Lint and type check pass: `npm run lint && npx astro check`
- Smoke test passes, including the 404 and return-path steps: `npm run build && npm run smoke`
- Kitchen sink screenshots at 1280 px and 360 px saved to `context/changes/fast-details-on-phone/screenshots/`, with hover and focus-visible triggered by the screenshot script
- `/dev/ui` returns 404 in the production build (`npm run preview`)

#### Manual Verification:

- Owner reviews the kitchen sink screenshots: every one of the 7 states is visible or marked N/A with a reason
- On production, a mistyped application link shows "Nie znaleziono"; signing in from an application link opens that application
- Keyboard focus is visible on every control of the details page (desktop browser, Tab through the page)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Guard — rule and check

### Overview

Leave the contract in the agent rules and a failing check, so the next agent does not reintroduce literals.

### Changes Required:

#### 1. Agent rule

**File**: `CLAUDE.md` (also read through the `AGENTS.md` symlink)

**Intent**: A short UI block under Key conventions: tokens live in `src/styles/global.css` (one dark theme; values on record in the change's `tokens.md`), components in `src/components/ui/` — check there before creating one, add missing ones with `npx shadcn@latest add`; no literal colours or arbitrary values in views — use token classes; kitchen sink at `/dev/ui` (dev only); list of views already on the contract.

**Contract**: Edit the Key conventions section; no second rules file.

#### 2. Lint check

**Files**: `scripts/check-ui-literals.mjs` (new), `package.json`

**Intent**: Dependency-free script running the `/10x-ui` hardcoded-value scan over a list of cleaned view files and exiting non-zero on any hit; `npm run lint` runs it after ESLint (so CI's lint step enforces it).

**Contract**: File list starts with the 6 files of this view; output names file:line of each hit.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes, and fails when a literal such as `text-purple-300` is temporarily added to `Topbar.astro` (deliberate-break check)
- CI is green on the pushed commit

#### Manual Verification:

- Owner reads the new CLAUDE.md UI block and finds it clear

**Implementation Note**: After completing this phase, pause for manual confirmation from the human.

---

## Testing Strategy

### Unit Tests:

- `safeNextPath`: in-app path kept; `//host`, `/\host`, absolute URLs, empty and `null` → `/dashboard`.

### Integration Tests:

- Smoke: existing details/notes/status/CV steps unchanged; new 404 for a malformed id, return path after sign-in, open-redirect attempt refused.

### Manual Testing Steps:

1. Phone: open an application during a mock call — call info first, readable, no sideways scroll.
2. Desktop: Tab through the details page — focus visible on every control.
3. Mistyped link and sign-in-from-link on production.

## Performance Considerations

No data-loading changes (C5 deferred). `client:idle` for `CvPanel` hydrates after the main thread is idle instead of on scroll — slightly earlier JS work, no effect on first paint.

## Migration Notes

No database changes. Visual change limited to the details view; other pages unchanged by design (Phase 2 screenshot diff).

## References

- Research: `context/changes/fast-details-on-phone/research.md` (charges C1–C5, owner decisions)
- `/10x-ui` skill: `.claude/skills/10x-ui/SKILL.md` and `references/ui-quality-checklist.md`
- Roadmap item: `context/foundation/roadmap.md` — S-04
- Token source: `src/styles/global.css:6-122`; view: `src/pages/applications/[id]/index.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Components and theme environment

#### Automated

- [x] 1.1 Lint and type check pass: `npm run lint && npx astro check` — a14192f
- [x] 1.2 Unit tests pass: `npm test` — a14192f
- [x] 1.3 Production build succeeds: `npm run build` — a14192f

#### Manual

- [x] 1.4 None — no visible change is expected in this phase — a14192f

### Phase 2: Token values = today's look

#### Automated

- [x] 2.1 Lint, type check and build pass: `npm run lint && npx astro check && npm run build` — 0dda353
- [x] 2.2 Before/after screenshots of `/dashboard`, `/cv` and `/auth/signin` at 1280 px and 360 px (headless Chromium against a local preview) differ by at most 0.1 % of pixels — 0dda353

#### Manual

- [x] 2.3 Owner confirms on production that the dashboard, CV library and sign-in look unchanged after deploy — e63d95a

### Phase 3: Details view on tokens and components

#### Automated

- [x] 3.1 Hardcoded-value scan reports 0 hits in the 6 view files: `grep -cE '<scan regex from /10x-ui>' <files>` (the Phase 5 script once it exists) — e63d95a
- [x] 3.2 Lint, type check, unit tests pass: `npm run lint && npx astro check && npm test` — e63d95a
- [x] 3.3 Smoke test passes (details, notes, status and CV flows unchanged): `npm run build && npm run smoke` — e63d95a
- [x] 3.4 At 360 px the details page has no horizontal scroll (`document.documentElement.scrollWidth <= 360` in headless Chromium, with a long company name and a long URL in a note) — e63d95a

#### Manual

- [x] 3.5 On a phone the details page reads at least as clearly as before; call-critical info is still first — 3efc183

### Phase 4: Entry and the 7 states

#### Automated

- [x] 4.1 Unit tests pass, including `safeNextPath`: `npm test` — 3efc183
- [x] 4.2 Lint and type check pass: `npm run lint && npx astro check` — 3efc183
- [x] 4.3 Smoke test passes, including the 404 and return-path steps: `npm run build && npm run smoke` — 3efc183
- [x] 4.4 Kitchen sink screenshots at 1280 px and 360 px saved to `context/changes/fast-details-on-phone/screenshots/`, with hover and focus-visible triggered by the screenshot script — 3efc183
- [x] 4.5 `/dev/ui` returns 404 in the production build (`npm run preview`) — 3efc183

#### Manual

- [x] 4.6 Owner reviews the kitchen sink screenshots: every one of the 7 states is visible or marked N/A with a reason
- [x] 4.7 On production, a mistyped application link shows "Nie znaleziono"; signing in from an application link opens that application
- [x] 4.8 Keyboard focus is visible on every control of the details page (desktop browser, Tab through the page)

### Phase 5: Guard — rule and check

#### Automated

- [x] 5.1 `npm run lint` passes, and fails when a literal such as `text-purple-300` is temporarily added to `Topbar.astro` (deliberate-break check)
- [ ] 5.2 CI is green on the pushed commit

#### Manual

- [ ] 5.3 Owner reads the new CLAUDE.md UI block and finds it clear
