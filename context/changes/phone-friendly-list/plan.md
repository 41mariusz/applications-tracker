# Application list usable on a 360 px phone (S-06) Implementation Plan

## Overview

Move `/dashboard` (`src/pages/dashboard.astro`) — the screen used during an unexpected HR call — onto the repo's existing design-system contract (semantic tokens + `src/components/ui/`), and fix what the audit measured on a 360 px phone:

- the status pill that jumps between cards;
- a latent overflow for unbroken names;
- 26 px tap targets;
- invisible keyboard focus on the status filter;
- closed applications whose status control is dimmed to half contrast.

The order follows `/10x-ui`: token values → one view → states. No new token or component is needed, so the "environment / token values" step is empty.

## Current State Analysis

From `context/changes/phone-friendly-list/research.md` (audit at 9084689):

- **No contract use.** `/dashboard` has 13 lines with literal colour classes (~30 occurrences), 0 token classes and 0 imports from `src/components/ui/`. The tokens (`src/styles/global.css` `:root`) and components (`button`, `input`, `alert`, `card`, `badge`, `native-select`, `label`) all exist, and the details view, Topbar, StatusControl, NotesPanel and CvPanel already use them.
- **At 360 px with realistic data:**
  - no horizontal overflow, but a company name without spaces or hyphens pushes the page to 598 px (title block `:126-128` has no wrapping rule);
  - the 145×26 px status control wraps under the title in 7 of 8 cards and stays top-right in the 8th (header row `:125`, StatusControl wrapper `flex flex-col items-end`, `src/components/applications/StatusControl.tsx:54`);
  - chips and pill are 26 px tall, the company link 17 px per line;
  - the search placeholder is cut ("…nazwisko lub").
- **Keyboard (1280 px):** filter chips show no focus at all, because focus sits on an `sr-only` checkbox (`:88`) and the visible `<label>` (`:82`) has no focus style. The company link (`:127`) and the add link (`:51`) show only the faint browser outline.
- **Closed items** get `opacity-50` on the whole card (`:113`), which also dims their working status control.
- **Entry points are sound:** signed-out redirect, empty state, failed read → 500 with a message, paused → `/paused`, and `?q=` / `?status=` from a link all work. No accidental-architecture charge on the route.
- **Test contracts:**
  - smoke reads `<li ` cards with `href="/applications/<id>"`, `data-status` and the `line-through` class on closed items (`scripts/smoke.mjs:254-262`), plus `?status=` / `?q=` (`:470-475`, `:192`);
  - E2E uses the searchbox named "Szukaj", the text "Brak wyników", company links by name, and test ids `search-count`, `applications-list`, `status-filter`, `application-visible` (`tests/e2e/call-phone-search.spec.ts:59-81`).

## Desired End State

- `src/pages/dashboard.astro`:
  - has 0 hits in the hardcoded-value scan;
  - builds its controls from `src/components/ui/` and its surfaces from tokens;
  - is listed in `scripts/check-ui-literals.mjs` `CLEAN_VIEWS`, so `npm run lint` keeps it clean.
- **At 360 px:**
  - the status control sits under the title in every card;
  - a company name with no break opportunity still leaves no horizontal overflow;
  - filter chips and the status control are at least 40 px tall (the status control also on the details view);
  - the search placeholder is fully visible.
- **From 640 px up,** the status control sits to the right of the title.
- **Keyboard focus** is visible, token-driven (`--ring`), on the add button, the search input, every filter chip and every company link.
- **Closed applications:** the title is struck through and the texts are muted, while the status control keeps full contrast.
- **Kitchen sink:** `/dev/ui` shows the list in all 7 states (or N/A with a reason). Screenshots at 1280 and 360 px are kept in the change folder.
- **Guard:** a Playwright spec guards the phone layout. CLAUDE.md states the 40 px tap-target and phone-layout rule.
- **Unchanged:** every smoke and E2E contract above.

### Key Discoveries:

- The details view (S-04) is the reference for applying the contract here — card tokens, `Button` variants, `Alert`, ring focus (`context/archive/2026-10-05-fast-details-on-phone/`).
- `src/components/ui/button.tsx:8` already carries `focus-visible:ring-ring focus-visible:ring-[3px]`. An `<a>` styled with `buttonVariants` gets the same focus as the details view's buttons.
- `Input` and `Button` are React components but render to static HTML in an `.astro` page without a `client:` directive. The inline search script (`dashboard.astro:151-202`) keeps working as long as the input keeps `id="q"` and `name="q"`.
- `StatusControl` is shared with the details page (`src/pages/applications/[id]/index.astro`). Its pill height change applies there by decision. Its alignment must become configurable so the details page keeps its current right alignment.
- The `/dev/ui` kitchen sink (`src/pages/dev/ui.astro`, dev-only, 404 in production) already holds Button, Badge/chips, Input, Card, Empty, Loading and a static-island section to extend.
- E2E helpers create and delete applications through `tests/e2e/support/local-admin.ts`. The spec pattern is in `tests/e2e/call-phone-search.spec.ts`.

## What We're NOT Doing

- New tokens, a second palette, `shadcn init` or new dependencies.
- The Topbar: its desktop width beyond the content column and its 20 px links are layout-wide (audit: deferred).
- A larger tap area for the company link (17 px per line). It is the card's main link but stays a text link in this change; recorded as deferred.
- The add/edit form (S-07), the CV library (S-08) or any other view.
- Behaviour changes: search, filtering, ordering, URLs, status transitions and the empty or error texts stay as they are.
- A screenshot-diff baseline in CI. The visual gate is the kitchen sink plus screenshots in the change folder, plus the phone-layout E2E spec.

## Implementation Approach

1. Change only classes and component usage first, so the view looks the same but reads the contract (Phase 1).
2. Change the phone layout and sizes, guarded by a new browser test (Phase 2).
3. Finish the states and the visual gate (Phase 3).

Each phase keeps the smoke and E2E contracts and is deployable alone.

## Critical Implementation Details

- **Keep the markup contracts.**
  - Each card stays an `<li>` with `data-status`, `data-testid`, `data-search` and `hidden`.
  - The `line-through` class must stay on closed items, because smoke greps for it.
  - The search input keeps `id="q"`, `name="q"`, `type="search"` and its `sr-only` label "Szukaj".
  - Chips stay `<label>` elements wrapping a checkbox `name="status"`, which the inline script and the no-JS form rely on.
- **Focus on the chips:** the focusable element is the `sr-only` checkbox. The visible ring has to be drawn on the `<label>` from its child's state (`has-[:focus-visible]:` with the ring token), not on the checkbox.

## Phase 1: View on tokens and components (C1, C2, C5)

### Overview

Replace every literal in the view with tokens and use the shared components. The look stays the same except for the closed-item treatment.

### Changes Required:

#### 1. Dashboard markup

**File**: `src/pages/dashboard.astro`

**Intent**: Every colour, surface and border comes from tokens; the hand-built controls become the shared components; closed items are struck through and muted instead of dimmed as a whole.

**Contract**:

- **Literals → tokens:**

  | Lines                    | Today                       | After                                                                                                 |
  | ------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------- |
  | `:46,99,102,130,132,138` | literal text classes        | `text-foreground` / `text-supporting-foreground` / `text-muted-foreground` (research's literal table) |
  | `:60`                    | literal empty-state surface | `border-border bg-card`                                                                               |
  | `:82`                    | literal chip classes        | `border-input bg-card hover:bg-muted`; checked `bg-accent text-accent-foreground`                     |
  | `:112`                   | literal card surface        | `border-border bg-card`                                                                               |

- **Shared components:**
  - add link (`:49-54`) → an `<a>` styled with `buttonVariants()` (default variant);
  - no-JS submit (`:94`) → `Button`;
  - search (`:70-78`) → `Input`, same `id`/`name`/`type`/value/placeholder;
  - load error (`:57`) → `Alert` with the destructive treatment used on the details view.
- **Closed items:** no `opacity-50` on the card. The title keeps `line-through`, and the title, position and salary texts use `text-muted-foreground`. The status control is untouched.
- **Markup contracts** from "Critical Implementation Details" are kept.

#### 2. UI contract guard

**File**: `scripts/check-ui-literals.mjs`

**Intent**: Lint fails if a literal comes back into the list.

**Contract**: `src/pages/dashboard.astro` is added to `CLEAN_VIEWS`.

### Success Criteria:

#### Automated Verification:

- Lint passes, incl. the UI contract with `dashboard.astro` in `CLEAN_VIEWS`: `npm run lint`
- Types and unit tests pass: `npx astro check` and `npm test`
- Hardcoded-value scan on the view returns 0 lines (the `/10x-ui` scan command on `src/pages/dashboard.astro`)
- Smoke passes against a local preview: `npm run smoke`
- E2E passes: `npx playwright test`

#### Manual Verification:

- At 1280 and 360 px the list looks as before (cosmic background, card surfaces, chips, purple add button), apart from closed items. Before/after screenshots are compared side by side.
- A closed application shows a struck-through title with muted texts and a status control in full contrast.
- Break check: re-adding one literal class (e.g. `text-white`) to the view turns `npm run lint` red; restored afterwards.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Phone layout and tap targets (C4)

### Overview

Make the card layout predictable on a phone, make the chips and the status pill thumb-sized, and guard both with a browser test.

### Changes Required:

#### 1. Card header layout and wrapping

**File**: `src/pages/dashboard.astro`

**Intent**: The status control stays in one predictable place, and no text can push the page sideways.

**Contract**:

- **Below 640 px** (`sm`), the card header stacks: title block, then the status control on its own line, start-aligned.
- **From 640 px up,** the status control sits to the right of the title block, top-aligned. The title block takes the remaining width (`min-w-0`).
- **Wrapping:** company, position and salary/rate text wrap at any character when needed (`break-words` / `overflow-wrap: anywhere`).
- **Search placeholder** is shortened so it is fully visible at 360 px, with the same meaning: company, position, HR name or phone. The accessible name "Szukaj" (label) is unchanged.

#### 2. Tap targets

**Files**: `src/pages/dashboard.astro`, `src/components/applications/StatusControl.tsx`

**Intent**: The controls used with a thumb during a call are at least 40 px tall.

**Contract**:

- **Filter chips:** at least 40 px tall (`min-h-10` with vertically centred content).
- **StatusControl pill:** at least 40 px tall on every page where it is used (details view included, by decision).
- **New StatusControl prop** controlling the wrapper's alignment, so the list can start-align it below 640 px.
  - The default keeps today's right alignment, so the details view is otherwise unchanged.
  - The pending ("Zapisywanie…") and error lines follow the same alignment.

#### 3. Phone-layout browser test

**File**: `tests/e2e/phone-list.spec.ts` (new)

**Intent**: Keep the phone behaviour from regressing.

**Contract**: at viewport 360×740, signed in, with test applications created and deleted through `tests/e2e/support/local-admin.ts` as in `call-phone-search.spec.ts`. One application must have a company name with no spaces or hyphens, one must be closed. The spec asserts:

- no horizontal overflow (`document.documentElement.scrollWidth <= clientWidth`);
- in every visible card, the status control's top is below the title block's bottom;
- every filter chip and every status control is at least 40 px tall;
- the closed card's title has `line-through`, and its status control is not inside an element with reduced opacity.

### Success Criteria:

#### Automated Verification:

- Lint, types and unit tests pass: `npm run lint`, `npx astro check`, `npm test`
- Hardcoded-value scan on the view still returns 0 lines
- Smoke passes: `npm run smoke`
- E2E passes, incl. `tests/e2e/phone-list.spec.ts`: `npx playwright test`

#### Manual Verification:

- At 360 px every card has the status control under the title, and nothing scrolls sideways. At 1280 px the control sits to the right.
- The details view still shows the status control on the right, now 40 px tall, and a status change there still works.
- Break check: removing the wrapping rule from the company title turns the overflow assertion in `phone-list.spec.ts` red; restored afterwards.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: States, visual gate and rule (C3)

### Overview

Visible keyboard focus everywhere on the list, the 7-state matrix in the kitchen sink, screenshots as review evidence, and the rule that keeps the next agent on the contract.

### Changes Required:

#### 1. Focus-visible

**File**: `src/pages/dashboard.astro`

**Intent**: A keyboard user always sees where focus is.

**Contract**:

- **Filter chip label:** shows the ring token when its checkbox has keyboard focus (`has-[:focus-visible]:ring-2 ring-ring`, or equivalent).
- **Company link:** shows a token ring on `focus-visible` (as the details view's links do).
- **Add button:** gets the `Button` focus ring from Phase 1; verify it.

#### 2. Kitchen sink

**File**: `src/pages/dev/ui.astro`

**Intent**: One page shows the list's pieces in every state for review and screenshots.

**Contract**: a new section "Lista aplikacji" renders, side by side:

| State         | What is shown                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| default       | an open card and a closed card                                                                                                                |
| hover         | a chip and a card link                                                                                                                        |
| focus-visible | chip, link, add button and search, shown via a forced class or a note to Tab                                                                  |
| disabled      | the status control while saving (`disabled`)                                                                                                  |
| error         | the load-error `Alert` and the status-control error line                                                                                      |
| empty         | "no applications" and "no search results"                                                                                                     |
| loading       | **N/A** — the list renders on the server with no client fetch; the closest state is the status control's "Zapisywanie…", shown under disabled |

The same 360 px card markup as the list is used (a shared Astro partial if needed, so the kitchen sink cannot drift from the page).

#### 3. Screenshots

**File**: `context/changes/phone-friendly-list/screenshots/`

**Intent**: Review evidence next to the "before" set from the audit.

**Contract**:

- `after-dashboard-1280.png` and `after-dashboard-360.png` (same local data as the audit);
- `kitchen-sink-list-1280.png` and `kitchen-sink-list-360.png`;
- `after-chip-focus-1280.png`.

#### 4. Rule

**File**: `CLAUDE.md`

**Intent**: The next view (S-07, S-08) inherits the phone rules, not just the colours.

**Contract**: one sentence added to the "UI contract" bullet:

- interactive controls used on a phone are at least 40 px tall;
- text in cards wraps at any character;
- side-by-side rows stack below 640 px rather than wrap unpredictably;
- keyboard focus uses the `ring` token, also on visually custom controls such as chip labels.

### Success Criteria:

#### Automated Verification:

- Lint, types and unit tests pass: `npm run lint`, `npx astro check`, `npm test`
- Smoke and E2E pass: `npm run smoke`, `npx playwright test`
- The five "after" screenshots exist in `context/changes/phone-friendly-list/screenshots/`

#### Manual Verification:

- Tabbing through `/dashboard` at 1280 px shows a visible ring on the add button, the search, every chip and every company link.
- `/dev/ui` "Lista aplikacji" shows all 7 states (loading marked N/A with its reason) at 1280 and 360 px.
- The owner checks the list on their phone in production after deploy: status under the title, chips and status comfortable to tap, nothing scrolls sideways.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None new. The change is markup and styling; the rules it relies on (`search.ts`, `status.ts`) are already tested.

### Integration Tests:

- **Smoke:** the existing list contracts (cards, `data-status`, `line-through`, `?q=` / `?status=`) prove that behaviour did not change.
- **E2E:**
  - `call-phone-search.spec.ts` (searchbox, results, counts) keeps passing;
  - the new `phone-list.spec.ts` guards the 360 px layout, the 40 px targets and the closed-item contrast.

### Manual Testing Steps:

1. Compare before and after screenshots at 1280 and 360 px.
2. Tab through the list at 1280 px and check that every control shows a ring.
3. Check the details view's status control (right-aligned, 40 px, still changes status).
4. In production after deploy, use the list on the phone during a mock call.

## Performance Considerations

None. Static classes only; no new client JavaScript beyond the existing search script and StatusControl island.

## Migration Notes

No data or schema change. No `db push`.

## References

- Audit and charges: `context/changes/phone-friendly-list/research.md`
- Roadmap: `context/foundation/roadmap.md` — S-06 (M-2, MS-01)
- Reference change: `context/archive/2026-10-05-fast-details-on-phone/` (tokens, details view, `/dev/ui`, `check-ui-literals.mjs`)
- Tokens: `src/styles/global.css` `:root`; components: `src/components/ui/`
- Test contracts: `scripts/smoke.mjs:254-262,470-475`; `tests/e2e/call-phone-search.spec.ts:59-81`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: View on tokens and components (C1, C2, C5)

#### Automated

- [x] 1.1 Lint passes incl. UI contract with dashboard.astro in CLEAN_VIEWS: `npm run lint` — 959d7c5
- [x] 1.2 Types and unit tests pass: `npx astro check` and `npm test` — 959d7c5
- [x] 1.3 Hardcoded-value scan on the view returns 0 lines — 959d7c5
- [x] 1.4 Smoke passes: `npm run smoke` — 959d7c5
- [x] 1.5 E2E passes: `npx playwright test` — 959d7c5

#### Manual

- [x] 1.6 List looks as before at 1280 and 360 px apart from closed items (before/after screenshots) — 959d7c5
- [x] 1.7 Closed application: struck-through title, muted texts, status control in full contrast — 959d7c5
- [x] 1.8 Break check: a literal class in the view turns npm run lint red; restored — 959d7c5

### Phase 2: Phone layout and tap targets (C4)

#### Automated

- [x] 2.1 Lint, types and unit tests pass
- [x] 2.2 Hardcoded-value scan on the view still returns 0 lines
- [x] 2.3 Smoke passes: `npm run smoke`
- [x] 2.4 E2E passes incl. phone-list.spec.ts: `npx playwright test`

#### Manual

- [x] 2.5 At 360 px status under the title in every card, no sideways scroll; at 1280 px status on the right
- [x] 2.6 Details view: status control right-aligned, 40 px, status change still works
- [x] 2.7 Break check: no wrapping on the company title turns the overflow assertion red; restored

### Phase 3: States, visual gate and rule (C3)

#### Automated

- [ ] 3.1 Lint, types and unit tests pass
- [ ] 3.2 Smoke and E2E pass
- [ ] 3.3 The five "after" screenshots exist in the change folder

#### Manual

- [ ] 3.4 Tab at 1280 px shows a visible ring on add button, search, every chip and every company link
- [ ] 3.5 /dev/ui "Lista aplikacji" shows all 7 states (loading N/A with reason) at 1280 and 360 px
- [ ] 3.6 Owner checks the list on their phone in production after deploy
