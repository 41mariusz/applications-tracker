# Application form usable on a 360 px phone (S-07) Implementation Plan

## Overview

Move the application form — `src/pages/applications/new.astro`, `src/pages/applications/[id]/edit.astro` and the
shared island `src/components/applications/ApplicationForm.tsx` — onto the repo's design-system contract (tokens in
`src/styles/global.css`, components in `src/components/ui/`), keep every control at least 40 px tall on a 360 px phone,
make a failed validation visible where the user is, and give the edit page the same not-found / failed-read handling as
the details view. The order follows `/10x-ui`: shared classes (the token step — no new values) → one view → states →
guard. Roadmap item S-07 (`context/foundation/roadmap.md:96-102`).

## Current State Analysis

From `context/changes/phone-friendly-form/research.md` (audit at c45c2d7), charges C1–C5:

- **C1 Missing tokens.** 15 scan hits: `new.astro:10` (glass card), `edit.astro:48,50,51`, `ApplicationForm.tsx:11-12,
39, 90, 144, 180-196, 218, 224`. Every literal maps to an existing token; none of the three files is in
  `CLEAN_VIEWS` (`scripts/check-ui-literals.mjs:6-22`).
- **C2 Missing shared component.** Hand-built `input`/`select`/`textarea`/`button`/`label`
  (`ApplicationForm.tsx:27-221`). Today inputs are ≈ 42 px and the submit ≈ 40 px (from classes); the ui components
  are `h-9` = 36 px (`input.tsx:10`, `native-select.tsx:20`, `button.tsx:22`), so a plain swap would regress tap
  targets. "Anuluj" is a ≈ 20 px text link.
- **C3 Error state.** Field error `<p>` has no id / `role` and the control has no `aria-invalid` /
  `aria-describedby` (`:37-43`); selects never show an error (`:173-201`); a validation-only 400 shows no message near
  the buttons and does not move focus (`:74-82`). Over-length values come back with zod's default English message
  (`src/lib/services/applications.ts:19-31` — `.max(n)` without a message) because the inputs have no `maxLength`.
- **C4 Edit entry.** Unknown id / failed read render one literal-styled sentence under "Edytuj aplikację"
  (`edit.astro:49-51`) while the details view shows an `Alert` / a token "Nie znaleziono" card with "Wróć do listy"
  (`[id]/index.astro:83, 92-105`). Neither page has `scheme-dark` or a back link.
- **C5 Pre-hydration submit.** `<form>` has no `action`/`method` (`:93-102`); a tap before hydration would submit a
  native GET with the field values in the URL (inferred, not run).
- **Contracts to keep:** input `name`s = `id`s (`readApplicationForm`, `applications.ts:45-61`), error texts, company
  value in the SSR edit HTML (`scripts/smoke.mjs:446`), "Podaj nazwę firmy" in the 400 body (`:331`, `:450`).

## Desired End State

- `new.astro`, `[id]/edit.astro`, `ApplicationForm.tsx` and the new `form-classes.ts` have 0 hits in the
  hardcoded-value scan and are listed in `CLEAN_VIEWS`.
- Both pages use the details-view shell: `bg-cosmic … scheme-dark`, a "← Moje aplikacje" link, the form in a
  `bg-card rounded-xl border` card; fields filled with `bg-muted`.
- At 360 px: no horizontal scroll; every input, select, textarea, the submit button and the cancel action are at least
  40 px tall; two/three-column rows stack (unchanged `sm:` grids).
- Submitting with errors: the first invalid control (in form order) receives focus (and scrolls into view), every
  invalid control has `aria-invalid` + `aria-describedby` to its `role="alert"` message, selects show the error too, and
  a destructive `Alert` "Popraw zaznaczone pola." appears above the buttons.
- Inputs carry `maxLength` equal to the schema limits, so the English zod message cannot be reached from the form.
- The submit button is disabled until the island hydrates; during save the form has `aria-busy` and the button reads
  "Zapisywanie…".
- `/applications/<unknown or malformed id>/edit` → 404 with the details view's "Nie znaleziono" card; a failed read →
  500 with an `Alert`; neither shows the form.
- `/dev/ui` shows the form in all 7 states (or N/A with a reason) using the real component; screenshots at 1280 and
  360 px are kept in the change folder.
- Guards: `tests/e2e/phone-form.spec.ts`, a smoke step for a bad edit id, the CLAUDE.md UI rule mentions the form
  classes.

### Key Discoveries:

- 40 px on the contract is reached per view with `min-h-10` (+ `h-auto` to undo `h-9`):
  `src/components/applications/StatusControl.tsx:12-13`, `src/components/applications/list-classes.ts:4-5`. Do not
  change `h-9` inside `src/components/ui/` — it would move every view.
- Shared class constants live next to the view so `/dev/ui` reuses them (`list-classes.ts`, S-06 review F1,
  `context/archive/2026-10-10-phone-friendly-list/reviews/impl-review.md:27-35`).
- Error wiring precedent: `useId` ids + `aria-invalid` + `aria-describedby` + `role="alert"`
  (`src/components/applications/NotesPanel.tsx:71-72, 127-128, 148-149`); ui components already style
  `aria-invalid:border-destructive` (`src/components/ui/input.tsx:12`).
- Hydration flag precedent: `useSyncExternalStore(noopSubscribe, () => true, () => false)`
  (`NotesPanel.tsx:61-65`) — SSR renders `false`, the client after hydration `true`, no mismatch.
- `NativeSelect` wrapper defaults to `w-fit` (`native-select.tsx:13`) → pass `wrapperClassName="w-full"`; options via
  `NativeSelectOption` (`bg-popover`, `native-select.tsx:40`) replace `text-black`.
- `/dev/ui` server-renders islands without `client:` (`src/pages/dev/ui.astro:476-512`); state that only exists after
  interaction needs initial props to be shown there.
- Details-view reference for the shell, link and not-found card: `src/pages/applications/[id]/index.astro:77, 83-105`.

## What We're NOT Doing

- No new token values and no changes to `src/components/ui/*` (heights are overridden per view).
- No "today in Europe/Warsaw" default for `applied_on` (`ApplicationForm.tsx:170` stays UTC) — deferred to S-12.
- No Topbar changes (`break-all`, 20 px links, `src/components/Topbar.astro:13-32`) — deferred to S-12.
- No change to the details view's closed state (`[id]/index.astro:112`) — other view.
- No Polish messages in the zod schema; `maxLength` on inputs covers the form path.
- No progressive-enhancement server fallback (`method="post"` handler) — the submit is simply disabled until hydration.
- No `toHaveScreenshot` baseline (the repo has none); the visual gate is `/dev/ui` + screenshots in the change folder.
- No disabling of inputs while saving (see Critical Implementation Details).

## Implementation Approach

Phase 1 adds the shared vocabulary (classes, limits) without touching the rendered view. Phase 2 rebuilds the view on
ui components with those classes and fixes the edit entry. Phase 3 adds the error/busy behaviour and the initial props
that let `/dev/ui` render all states from the real component. Phase 4 locks it in with e2e, smoke, lint and the rule.
After every visual phase: screenshot at 1280 and 360 px and re-run the hardcoded-value scan on the view's files.

## Critical Implementation Details

- **Do not disable inputs during save.** `new FormData(form)` omits disabled controls; any disabled `<fieldset>` or
  input would drop fields from the request. Busy state is the button's `disabled` + `aria-busy` on the form.
- **Focus after a validation 400** must run after React has rendered the new errors (e.g. in an effect keyed on the
  error set, or `flushSync`), and pick the first invalid field in **form order**, not object-key order.
- **Pre-hydration disable** must come from `useSyncExternalStore` (server snapshot `false`), not from `useEffect` +
  state, to keep SSR and first client render identical.

## Phase 1: Shared form classes and field limits

### Overview

The token step of `/10x-ui`: no new values, only the class constants and limits the view and `/dev/ui` will share.
No visual change.

### Changes Required:

#### 1. Form class constants

**File**: `src/components/applications/form-classes.ts` (new)

**Intent**: One place for the form's 40 px control sizing, field label, field error text and cancel-link classes, so
`ApplicationForm.tsx` and `/dev/ui` cannot drift (mirrors `list-classes.ts`).

**Contract**: exported string constants built only from token classes: a control class (`bg-muted` fill, `h-auto
min-h-10`, base text size so iOS does not zoom), a label class (`text-supporting-foreground`), an error text class
(`text-destructive text-xs`), a text-action class for "Anuluj" (link variant, `min-h-10`). Exact names are the
implementer's; they are referenced by Phase 2 and Phase 3.

#### 2. Field length limits

**File**: `src/lib/services/applications.ts`

**Intent**: Export the per-field maximum lengths the zod schema already uses, and make the schema read them, so the
form can set `maxLength` from the same numbers.

**Contract**: an exported `as const` map keyed by the text fields of `ApplicationFormValues` (company 200, position 200,
posting_url 2000, salary_range 100, quoted_rate 100, hr_contact_name 200, hr_contact_phone 50); schema behaviour and
messages unchanged.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes (incl. `check-ui-literals`, `check-migrations`)
- `npm test` passes (existing validation tests unchanged)
- `npx astro check` passes
- Hardcoded-value scan on `form-classes.ts` returns 0 hits

#### Manual Verification:

- `/applications/new` renders exactly as before (no visual change in this phase)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human before proceeding to the next phase.

---

## Phase 2: The view on tokens and ui components

### Overview

Rebuild the form and both pages from ui components and tokens at ≥ 40 px, align the edit entry with the details view,
and disable submit until hydration (C1, C2, C4, C5).

### Changes Required:

#### 1. ApplicationForm on ui components

**File**: `src/components/applications/ApplicationForm.tsx`

**Intent**: Replace the hand-built controls with `Label`, `Input`, `Textarea`, `NativeSelect` + `NativeSelectOption`,
`Button`, styled through `form-classes.ts`; drop every literal (`bg-white/10`, `text-blue-100/80`, `focus:ring-purple-400`,
`text-black`, `bg-purple-600`, `text-purple-300`). Set `maxLength` from the Phase 1 limits. Render "Anuluj" as a ≥ 40 px
link-styled action. Disable the submit until hydrated.

**Contract**: unchanged props, field `name`/`id` pairs, submit/cancel targets and texts ("Zapisz", "Zapisywanie…",
"Anuluj"); selects use `wrapperClassName="w-full"`; submit `disabled` = `pending || !hydrated` with `hydrated` from
`useSyncExternalStore` (server `false`).

#### 2. New page shell

**File**: `src/pages/applications/new.astro`

**Intent**: Use the details-view shell: `scheme-dark` on the container, `text-foreground` column, "← Moje aplikacje"
link (link variant as `[id]/index.astro:77`), heading and form inside a `bg-card rounded-xl border` card.

**Contract**: title "Nowa aplikacja", h1 text unchanged; no literal classes.

#### 3. Edit page shell and entry states

**File**: `src/pages/applications/[id]/edit.astro`

**Intent**: Same shell as new; on 404 render the details view's not-found card ("Nie znaleziono", "Tej aplikacji nie
ma albo link jest nieprawidłowy.", "Wróć do listy", `data-testid="not-found"`) and on 500 an `Alert variant="destructive"`
— without the "Edytuj aplikację" heading or the form in either case. The back link points to the application when it
exists, else to `/dashboard`.

**Contract**: status codes and server logic (`:13-42`) unchanged; page title per case like `[id]/index.astro:83`; SSR
edit HTML still contains the company value.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan on `new.astro`, `[id]/edit.astro`, `ApplicationForm.tsx`, `form-classes.ts` returns 0 hits
- `npm run lint`, `npm test`, `npx astro check`, `npm run build` pass
- `npm run smoke` passes against a local preview

#### Manual Verification:

- At 360 px (`/applications/new`, `/applications/<id>/edit`): no sideways scroll, every control and "Anuluj" ≥ 40 px,
  rows stacked; at 1280 px rows side by side — screenshots saved in the change folder
- Select option lists are readable (light text on the dark popover) in Chromium
- Keyboard: every control and the back/cancel links show the `ring` focus
- `/applications/00000000-0000-4000-8000-000000000000/edit` shows the "Nie znaleziono" card with "Wróć do listy"
- Create and edit still save and redirect as before

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human before proceeding to the next phase.

---

## Phase 3: States — error, busy and the kitchen sink

### Overview

Make the error state visible and announced, mark required and busy states, and render all 7 states of the real form in
`/dev/ui` (C3, 7-state matrix).

### Changes Required:

#### 1. Error and busy behaviour

**File**: `src/components/applications/ApplicationForm.tsx`

**Intent**: Wire every field (inputs, textarea, both selects) to its error with `useId` ids, `aria-invalid`,
`aria-describedby` and a `role="alert"` message; after a validation-only failure focus the first invalid field in form
order and show a destructive `Alert` "Popraw zaznaczone pola." above the buttons (server/network errors keep the
existing `errorMessage` Alert). Mark company and position `aria-required`. Set `aria-busy` on the form while pending.

**Contract**: field order for focus = render order (company, position, posting_url, salary_range, quoted_rate,
hr_contact_name, hr_contact_phone, applied_on, employment_type, work_mode); visible "*" in labels unchanged; no input
is `disabled` during save.

#### 2. Initial props for the kitchen sink

**File**: `src/components/applications/ApplicationForm.tsx`

**Intent**: Optional props that seed the initial state so `/dev/ui` can server-render error, server-error, pending and
rate-note states from the real component.

**Contract**: optional `initialErrors?: ApplicationFormErrors`, `initialServerError?: ClientMessage`,
`initialPending?: boolean`; omitted in `new.astro` / `edit.astro`; documented as kitchen-sink only. Rate-note state is
reached by passing edit `values` whose `quoted_rate` differs — if the component needs it, an optional
`initialQuotedRate?: string`.

#### 3. Form section in the kitchen sink

**File**: `src/pages/dev/ui.astro`

**Intent**: Add a "Formularz aplikacji" section rendering the form (no `client:`) in: default (new), edit with values,
field errors + validation Alert, server-error Alert, pending, rate-note visible; hover / focus-visible through the
existing `data-ks` targets; disabled = pending submit; empty = new form defaults; loading = pending (N/A for skeleton,
the form has no async data — reason stated in the section).

**Contract**: dev-only page unchanged otherwise; section uses `form-classes.ts` and tokens only.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm test`, `npx astro check`, `npm run build` pass
- Hardcoded-value scan on the four view files and `src/pages/dev/ui.astro` returns 0 hits

#### Manual Verification:

- At 360 px, submit an empty form scrolled to the bottom: focus jumps to "Firma", its message is visible, the Alert
  "Popraw zaznaczone pola." is above "Zapisz"
- A screen reader (or the accessibility tree in DevTools) names each invalid field's message via `aria-describedby`
- `/dev/ui` "Formularz aplikacji" shows all 7 states (or N/A with reason) — screenshots at 1280 and 360 px saved in the
  change folder

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human before proceeding to the next phase.

---

## Phase 4: Guards — e2e, smoke, lint and rule

### Overview

Leave checks that keep the next agent on the contract and keep the phone behaviour from regressing.

### Changes Required:

#### 1. Phone form E2E

**File**: `tests/e2e/phone-form.spec.ts` (new)

**Intent**: At 360×740 (pattern of `tests/e2e/phone-list.spec.ts`): no horizontal overflow on `/applications/new`;
every input, select, the submit and "Anuluj" ≥ 40 px via `boundingBox()`; empty submit → "Firma" focused and the
validation Alert visible; fill company + position with an `[E2E]` tag, save → `/dashboard` with the new card; the edit
page of a malformed and of an unknown UUID shows `data-testid="not-found"`.

**Contract**: created applications are found by their tagged company link on `/dashboard` and deleted in `afterEach`
through `tests/e2e/support/local-admin.ts`; selects by label / role, not CSS classes.

#### 2. Smoke step for a bad edit id

**File**: `scripts/smoke.mjs`

**Intent**: Next to the details 404 check (`:526-528`), assert `/applications/abc/edit` → 404 with "Nie znaleziono".

**Contract**: same `{ status, bodyIncludes }` step shape.

#### 3. Lint guard

**File**: `scripts/check-ui-literals.mjs`

**Intent**: Add `src/pages/applications/new.astro`, `src/pages/applications/[id]/edit.astro`,
`src/components/applications/ApplicationForm.tsx`, `src/components/applications/form-classes.ts` to `CLEAN_VIEWS`.

**Contract**: list order irrelevant; `npm run lint` fails on a literal in any of them.

#### 4. Rule

**File**: `CLAUDE.md`

**Intent**: In the existing "UI contract" bullet (outside any CLI-managed block), name `form-classes.ts` as the source
of form control sizing (≥ 40 px via `min-h-10`, never by editing `src/components/ui/`), note the form's guard spec
`tests/e2e/phone-form.spec.ts`, and add the edit not-found behaviour to the Pages line.

**Contract**: extend existing bullets; no new rules file.

### Success Criteria:

#### Automated Verification:

- `npx playwright test tests/e2e/phone-form.spec.ts` passes against the local stack
- `npx playwright test` (full suite) passes
- `npm run smoke` passes, including the new bad-edit-id step
- `npm run lint` passes and fails when a literal (e.g. `text-white`) is temporarily added to `ApplicationForm.tsx`
- `npm test`, `npx astro check`, `npm run build` pass

#### Manual Verification:

- CLAUDE.md reads correctly and points at `form-classes.ts`, `/dev/ui` and the spec
- `ui-quality-checklist` (`.claude/skills/10x-ui/references/ui-quality-checklist.md`) walked for this view

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human before proceeding to `/10x-impl-review`.

---

## Testing Strategy

### Unit Tests:

- Existing `applications` validation tests keep passing after the limits are extracted (behaviour unchanged).

### Integration Tests:

- `tests/e2e/phone-form.spec.ts`: layout at 360 px, focus + Alert on empty submit, create through the form, edit
  not-found for malformed and unknown ids.
- `scripts/smoke.mjs`: bad edit id → 404 "Nie znaleziono"; existing create/edit/400 steps unchanged.

### Manual Testing Steps:

1. 360 px: open `/applications/new`, scroll to the bottom, tap "Zapisz" empty → focus on "Firma", Alert above "Zapisz".
2. Fill and save → `/dashboard`; edit it, change "Moja podana stawka" → the rate-note textarea appears and saves.
3. Keyboard-tab through the form at 1280 px → `ring` focus on every control and link.
4. Open an edit link with a random UUID → "Nie znaleziono" card with "Wróć do listy".

## Performance Considerations

None — same island, same requests; ui components add no runtime dependencies beyond those already bundled.

## Migration Notes

No database migration. The change is UI-only and backward-compatible with the API.

## References

- Research: `context/changes/phone-friendly-form/research.md`
- Details-view reference: `src/pages/applications/[id]/index.astro:77-105`
- Previous UI changes: `context/archive/2026-10-05-fast-details-on-phone/`, `context/archive/2026-10-10-phone-friendly-list/`
- Phone spec pattern: `tests/e2e/phone-list.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared form classes and field limits

#### Automated

- [x] 1.1 `npm run lint` passes (incl. `check-ui-literals`, `check-migrations`) — a2a5f36
- [x] 1.2 `npm test` passes (existing validation tests unchanged) — a2a5f36
- [x] 1.3 `npx astro check` passes — a2a5f36
- [x] 1.4 Hardcoded-value scan on `form-classes.ts` returns 0 hits — a2a5f36

#### Manual

- [x] 1.5 `/applications/new` renders exactly as before (no visual change in this phase) — a2a5f36

### Phase 2: The view on tokens and ui components

#### Automated

- [x] 2.1 Hardcoded-value scan on `new.astro`, `[id]/edit.astro`, `ApplicationForm.tsx`, `form-classes.ts` returns 0 hits
- [x] 2.2 `npm run lint`, `npm test`, `npx astro check`, `npm run build` pass
- [x] 2.3 `npm run smoke` passes against a local preview

#### Manual

- [x] 2.4 At 360 px: no sideways scroll, every control and "Anuluj" ≥ 40 px, rows stacked; 1280 px side by side — screenshots saved
- [x] 2.5 Select option lists are readable (light text on the dark popover) in Chromium
- [x] 2.6 Keyboard: every control and the back/cancel links show the `ring` focus
- [x] 2.7 Unknown-UUID edit URL shows the "Nie znaleziono" card with "Wróć do listy"
- [x] 2.8 Create and edit still save and redirect as before

### Phase 3: States — error, busy and the kitchen sink

#### Automated

- [ ] 3.1 `npm run lint`, `npm test`, `npx astro check`, `npm run build` pass
- [ ] 3.2 Hardcoded-value scan on the four view files and `src/pages/dev/ui.astro` returns 0 hits

#### Manual

- [ ] 3.3 At 360 px, empty submit from the bottom: focus on "Firma", message visible, Alert above "Zapisz"
- [ ] 3.4 Accessibility tree names each invalid field's message via `aria-describedby`
- [ ] 3.5 `/dev/ui` "Formularz aplikacji" shows all 7 states (or N/A with reason) — screenshots at 1280 and 360 px saved

### Phase 4: Guards — e2e, smoke, lint and rule

#### Automated

- [ ] 4.1 `npx playwright test tests/e2e/phone-form.spec.ts` passes against the local stack
- [ ] 4.2 `npx playwright test` (full suite) passes
- [ ] 4.3 `npm run smoke` passes, including the new bad-edit-id step
- [ ] 4.4 `npm run lint` passes and fails when a literal is temporarily added to `ApplicationForm.tsx`
- [ ] 4.5 `npm test`, `npx astro check`, `npm run build` pass

#### Manual

- [ ] 4.6 CLAUDE.md reads correctly and points at `form-classes.ts`, `/dev/ui` and the spec
- [ ] 4.7 `ui-quality-checklist` walked for this view
