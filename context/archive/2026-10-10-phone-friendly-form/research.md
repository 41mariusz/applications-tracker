---
date: 2026-10-10T09:32:39+00:00
researcher: Claude (Opus 5.5) for Mariusz Michalak
git_commit: c45c2d7d9df102edcbd4d9bc13ae6d2f615e1554
branch: phone-friendly-form
repository: applications-tracker
topic: "/10x-ui audit of the application form (new + edit) against the design-system contract and phone rules"
tags: [research, ui, design-tokens, ApplicationForm, new.astro, edit.astro, phone]
status: complete
last_updated: 2026-10-10
last_updated_by: Claude (Opus 5.5)
---

# Research: /10x-ui audit of the application form

**Date**: 2026-10-10T09:32:39+00:00
**Researcher**: Claude (Opus 5.5) for Mariusz Michalak
**Git Commit**: c45c2d7d9df102edcbd4d9bc13ae6d2f615e1554
**Branch**: phone-friendly-form
**Repository**: applications-tracker

## Research Question

Two-way audit (source → view, view → source) of the application form — `src/pages/applications/new.astro`,
`src/pages/applications/[id]/edit.astro` and the shared island `src/components/applications/ApplicationForm.tsx` —
against the tokens in `src/styles/global.css` and the components in `src/components/ui/`, plus the phone rules in
`CLAUDE.md` (360 px, controls ≥ 40 px, `ring` focus, rows stack below 640 px, `wrap-anywhere`) and the entry points
(logged out, unknown/malformed edit id, failed read, failed save). Output: 3–5 charges with file, line and user impact.
Roadmap entry: `context/foundation/roadmap.md:96-102` (S-07, "user can add and edit an application comfortably on a
360 px phone").

## Summary

The form is the last core-flow view still off the contract. Of the three files, none is in `CLEAN_VIEWS`
(`scripts/check-ui-literals.mjs:6-22`); the hardcoded-value scan finds 15 hits (new 1, form 11, edit 3), and the form
imports exactly one ui component (`Alert`, `ApplicationForm.tsx:3`). The tokens it needs already exist — every literal
in these files maps to an existing token (table under C1) — so the contract variant is **existing design system**: no
new token values are needed.

Five charges (details below):

- **C1 Missing tokens** — literal palette classes in the form, its card shell and the edit page's error/not-found text.
- **C2 Missing shared component** — hand-built `input`/`select`/`textarea`/`button`/`label` shadow `Input`,
  `NativeSelect`, `Textarea`, `Button`, `Label`; swapping them in naively would drop controls from 42/40 px to 36 px.
- **C3 Error state is invisible on a phone and unassociated** — field errors have no `aria-invalid` /
  `aria-describedby`, selects never show an error, focus is not moved, and a validation failure shows no message near
  the submit button.
- **C4 Accidental architecture on edit entry** — unknown id / failed read render ad-hoc literal text under an
  "Edytuj aplikację" heading, diverging from the details view's not-found card and `Alert`.
- **C5 Pre-hydration submit and "today" default** (inferred / small) — the form has no `action`/`method`, and the date
  default is the UTC date, not Warsaw.

Settled for the plan: tokens exist; patterns to copy exist in contract views (`bg-muted` fill, `min-h-10`,
`aria-invalid` + `useId` error ids, `NativeSelectOption`, `linkClass`, `scheme-dark` on the container). Open:
how the kitchen sink shows the form's error/pending states, and whether C5 is in scope.

## Charges

### C1 — Missing tokens (literal colours in form, shell and edit page)

Scan hits (pattern from the /10x-ui skill, same as `scripts/check-ui-literals.mjs:24-25`):

| file:line                                   | literal                                                         | token / component that should cover it                                                                  |
| ------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/pages/applications/new.astro:10`       | `border-white/10 bg-white/10 text-white` (+ `backdrop-blur-xl`) | `border-border bg-muted text-foreground` (S-06 card precedent, `ApplicationCard.astro:21`) or `bg-card` |
| `src/pages/applications/[id]/edit.astro:48` | same card shell                                                 | same                                                                                                    |
| `src/pages/applications/[id]/edit.astro:50` | `bg-red-500/20 text-red-200`                                    | `Alert variant="destructive"` (as `[id]/index.astro:92-96`)                                             |
| `src/pages/applications/[id]/edit.astro:51` | `text-blue-100/70`                                              | `text-supporting-foreground` (`global.css:36`)                                                          |
| `ApplicationForm.tsx:11`                    | `bg-white/10 text-white placeholder-white/40`                   | `bg-muted` (`global.css:33`), `placeholder:text-muted-foreground` (in `Input`)                          |
| `ApplicationForm.tsx:12`                    | `text-blue-100/80` (label)                                      | `text-supporting-foreground` (CvPanel label precedent `CvPanel.tsx:162-164`)                            |
| `ApplicationForm.tsx:39, 90, 144`           | `border-white/20 focus:ring-purple-400`                         | `border-input` (`global.css:44`), `ring-ring` (`global.css:46`) — both inside ui components             |
| `ApplicationForm.tsx:180, 184, 192, 196`    | `<option className="text-black">`                               | `NativeSelectOption` (`bg-popover text-popover-foreground`, `native-select.tsx:40`)                     |
| `ApplicationForm.tsx:218`                   | `bg-purple-600 hover:bg-purple-500`                             | `Button` default variant (`bg-primary`, `button.tsx:12`)                                                |
| `ApplicationForm.tsx:224`                   | `text-purple-300`                                               | `text-link` / `buttonVariants({ variant: "link" })` (`Topbar.astro:7` `linkClass`)                      |

User impact: the add/edit screen looks like a different app from the list and details (glass card, a second purple,
a red that is not the `destructive` token), and any token change (focus ring, primary) will not reach the screen the
user uses to enter data — nothing in CI stops the drift because the files are not in `CLEAN_VIEWS`.

### C2 — Missing shared component (hand-built controls) and the 40 px trap

- Hand-built `<input>` (`ApplicationForm.tsx:31-41`), `<textarea>` (`:139-145`), two `<select>` (`:174-188`,
  `:191-200`), `<button>` (`:215-221`), `<label>` (`:27`, `:136`) shadow `Input`, `Textarea`, `NativeSelect` +
  `NativeSelectOption`, `Button`, `Label` in `src/components/ui/`.
- Current heights (computed from classes, not measured): inputs `py-2` + default 16 px/24 px line + 2 px border ≈ 42 px;
  submit `py-2` + 24 px line ≈ 40 px; "Anuluj" link `text-sm` ≈ 20 px tall.
- The ui components are `h-9` = 36 px (`input.tsx:10`, `native-select.tsx:20`, `button.tsx:22`). Swapping them in
  without an override **regresses** tap targets below the CLAUDE.md 40 px rule. The precedent on the contract is
  `min-h-10` (+ `h-auto` to undo `h-9`): `STATUS_PILL_CLASS` (`StatusControl.tsx:12-13`), `FILTER_CHIP_CLASS`
  (`list-classes.ts:4-5`); no contract view uses `h-10`. `Button size="lg"` is `h-10` (`button.tsx:24`).
- `NativeSelect` wrapper is `w-fit` by default (`native-select.tsx:13`); a form field needs `wrapperClassName="w-full"`
  (kitchen sink precedent `dev/ui.astro:283`).
- Fill convention on the contract is `bg-muted` on `Input`/`Textarea`/`NativeSelect` (`NotesPanel.tsx:118-148`,
  `CvPanel.tsx:168-174`, `dev/ui.astro:229`).

User impact: the selects open a native list with black-forced text and no error styling; the "Anuluj" target is
~20 px tall on a phone; and the obvious fix (import the ui components as they are) would make every field 36 px.

### C3 — Error state: invisible on a phone, not associated for assistive tech

- Field error is a bare `<p className="text-destructive mt-1 text-xs">` (`ApplicationForm.tsx:43`) — no id, no
  `role="alert"`; the input gets only a border colour (`:37-40`), no `aria-invalid`, no `aria-describedby`.
- The `Field` wrapper passes `error` to children-less inputs only: the two selects (`:173-201`) never get error styling.
- On a validation-only 400 (`{ errors }`), `serverError` stays `null` (`:77-81`), so **no message appears near the
  submit button**, and focus is not moved (no `.focus()` in the file). The only invalid fields that the schema reports
  with Polish text are `company`, `position`, `posting_url`, `applied_on` (`src/lib/services/applications.ts:19-39`);
  `company` and `position` are the top row (`:103-106`).
- Required fields are marked by `*` in the label text only (`:104-105`); no `required`/`aria-required`, no legend.
- Precedent on the contract: `useId` error ids + `aria-invalid` + `aria-describedby` + `role="alert"` on the error
  `<p>` (`NotesPanel.tsx:71-72, 127-128, 148-149`; S-04 review F4,
  `context/archive/2026-10-05-fast-details-on-phone/reviews/impl-review.md:177-185`). ui components already style
  `aria-invalid:border-destructive` (`input.tsx:12`).
- Max-length violations on the other fields come back with zod's default (English) message — not verified, see Open
  Questions.

User impact: on a 360 px phone the user scrolls to the bottom, taps "Zapisz", the button returns to "Zapisz" and
nothing visible happens — the error sits under "Firma" off-screen; a screen-reader user hears nothing.

### C4 — Accidental architecture: edit entry for unknown id / failed read

- `edit.astro:33-37` sets 404/500 correctly, but `:49-51` render the "Edytuj aplikację" heading over a literal-styled
  sentence ("Nie znaleziono tej aplikacji." / "Nie udało się wczytać aplikacji.") with no way back except the Topbar.
- The details view handles the same cases with an `Alert` for 500 (`[id]/index.astro:92-96`) and a token card with
  "Nie znaleziono", an explanation and a "Wróć do listy" button for 404 (`:97-105`, `data-testid="not-found"`), and a
  page title chosen per case (`:83`). Neither page uses `Astro.rewrite` (no call in `src`).
- Neither new nor edit has `scheme-dark` on its container (`new.astro:8`, `edit.astro:46`); it was deliberately left
  off for this form because of `text-black` options (`context/archive/2026-10-05-fast-details-on-phone/change.md:19`)
  and is set on the details view (`[id]/index.astro:85`).
- Neither page has a back link above the card, unlike details (`[id]/index.astro:88-90`).
- Logged out: both routes are under `PROTECTED_ROUTES` (`src/middleware.ts:8`) and redirect to sign-in with `next`
  — no charge.
- Smoke checks `/applications/abc` → 404 for details only (`scripts/smoke.mjs:526-528`); there is no check for a bad
  edit id.

User impact: someone following a stale or mistyped edit link lands on a page titled "Edytuj aplikację" with one
grey sentence and no button, unlike the same mistake on the details page.

### C5 — Pre-hydration submit and the "today" default (small; candidate for deferral)

- `<form>` has `onSubmit` + `noValidate` but no `action`/`method` (`ApplicationForm.tsx:93-102`). Before `client:load`
  hydrates, a tap on "Zapisz" would do a native GET to the current URL with field values in the query string
  (inferred from HTML semantics, not run). On a slow phone network that window is real; the values would end up in the
  URL (and in access logs, against the "no PII in logs" spirit of CLAUDE.md).
- `applied_on` defaults to `new Date().toISOString().slice(0, 10)` (`:170`) — the UTC date. Between 00:00 and
  01:00/02:00 Warsaw time the form pre-fills yesterday; display rules use `Europe/Warsaw` (`src/lib/format.ts:3`), and
  there is no "today in Warsaw" helper.

User impact: rare, but a late-evening entry gets the wrong date silently, and an early tap can put form data in a URL.

### Disposition (after implementation, 2026-10-10)

- C1–C4: addressed (plan Phases 2–3; guards in Phase 4).
- C5 pre-hydration submit: addressed — submit disabled until hydration (Phase 2).
- C5 "today" default in UTC: **deferred** to S-12 — domain logic (a Warsaw "today" helper) outside this one-view
  change; `ApplicationForm.tsx` still uses `toISOString()`.
- Topbar `break-all` and 20 px links (S-06 follow-up, also visible on this view): **deferred** to S-12 — shared
  component used by every page.
- Details view closed state `line-through opacity-60` (S-06 follow-up): **deferred** to S-12 — another view.

## Detailed Findings

### Tokens and components (source → view)

- Token values and `@theme inline` publication: `src/styles/global.css:11-60`, `:62-101`; one dark theme, `.dark`
  shares `:root` values (`:7-12`). Role → literal record: `context/archive/2026-10-05-fast-details-on-phone/tokens.md`.
- ui components available and unused by the form: `input.tsx`, `textarea.tsx`, `native-select.tsx`, `label.tsx`,
  `button.tsx`, `card.tsx`. Focus inside them: `focus-visible:ring-ring focus-visible:ring-[3px]` (`input.tsx:11`,
  `button.tsx:8`); full-strength `ring`, never `/50` (S-04 review F1,
  `fast-details-on-phone/reviews/impl-review.md:147-155`).
- `Alert` has `role="alert"` (`alert.tsx:22`); the form wraps its message in an extra `<p>` (`ApplicationForm.tsx:207`).

### Patterns already on the contract (to reuse, not reinvent)

- Page shell: `bg-cosmic min-h-screen p-4 scheme-dark sm:p-8` + `text-foreground mx-auto max-w-2xl space-y-4`
  (`[id]/index.astro:85,87`).
- Inline text link: `cn(buttonVariants({ variant: "link" }), "h-auto p-0 font-normal")`, defined locally in
  `Topbar.astro:7` and `[id]/index.astro:77` (duplicated, not exported).
- Primary + cancel pair: `<Button type="submit" size="sm" className="rounded-lg px-4">` and a link-variant `Button`
  (`NotesPanel.tsx:167,171`) — both under 40 px; the form needs its own sizing.
- Shared class constant precedent: `list-classes.ts` added in S-06 so the kitchen sink and the view share classes
  (`context/archive/2026-10-10-phone-friendly-list/reviews/impl-review.md:27-35`).

### Phone layout

- Two-column rows use `grid gap-4 sm:grid-cols-2` / `sm:grid-cols-3` (`ApplicationForm.tsx:103,117,149,165`), so they
  stack below 640 px as CLAUDE.md requires — no charge.
- Card padding `p-6` at 360 px leaves 360 − 2·16 − 2·24 = 280 px of content width (from classes, not measured).
- Actions row `flex items-center gap-3 pt-2` (`:214`) holds two short items; no overflow expected at 360 px.

### Kitchen sink and tests

- `/dev/ui` (`src/pages/dev/ui.astro`) is dev-only (`:28-31`), shows 7 states (`:33`) and already server-renders
  React islands without `client:` (`:476-512`). The form can be rendered there in create and edit mode, but only its
  initial state; error, pending and rate-note states need either initial props (e.g. `initialErrors`) or static
  copies — the trade-off recorded in S-06 review F3 (`phone-friendly-list/reviews/impl-review.md:47-64`).
- Playwright: no phone project; `phone-list.spec.ts` sets `viewport 360×740` per spec (`:8`), creates data through the
  API (`:33-42`), cleans up in `afterEach` (`:13-22`), asserts no horizontal overflow (`:66-70`) and ≥ 40 px heights via
  `boundingBox()` (`:78-88`); no `toHaveScreenshot` in the repo. No e2e spec opens the form.
- Contract the restyle must keep: input `name`s (read by `readApplicationForm`, `applications.ts:45-61`), field ids =
  names (`ApplicationForm.tsx:31-33` etc.), error texts, and the company value present in the SSR edit HTML
  (`scripts/smoke.mjs:446`). Labels, "Zapisz" and "Anuluj" are not referenced by any test.

## Code References

- `src/components/applications/ApplicationForm.tsx:10-12` — literal input/label classes
- `src/components/applications/ApplicationForm.tsx:24-46` — `Field`: error `<p>` without id/aria
- `src/components/applications/ApplicationForm.tsx:74-82` — validation 400 leaves `serverError` null
- `src/components/applications/ApplicationForm.tsx:93-102` — form without action/method
- `src/components/applications/ApplicationForm.tsx:170` — UTC "today"
- `src/components/applications/ApplicationForm.tsx:214-228` — submit button and cancel link
- `src/pages/applications/new.astro:8-13` — shell and glass card
- `src/pages/applications/[id]/edit.astro:33-37, 46-53` — status codes and inline error/not-found
- `src/pages/applications/[id]/index.astro:83-105` — reference shell, Alert and not-found card
- `src/styles/global.css:11-60` — token values
- `src/components/ui/{input,textarea,native-select,button,label}.tsx` — components to adopt
- `src/components/applications/StatusControl.tsx:12-13`, `list-classes.ts:4-5` — `min-h-10` precedent
- `src/components/applications/NotesPanel.tsx:71-72, 127-128, 148-149` — aria error pattern
- `scripts/check-ui-literals.mjs:6-22` — `CLEAN_VIEWS` (form files missing)
- `tests/e2e/phone-list.spec.ts` — template for a `phone-form.spec.ts`

## Architecture Insights

- The contract is complete for this view: every literal has a token, every hand-built control has a ui component. The
  work is adoption plus sizing, not new values — the plan's "token values" phase should be near-empty (possibly a shared
  `form-classes.ts` for the 40 px control/label/link classes, mirroring `list-classes.ts`).
- 40 px is enforced by convention (`min-h-10` per view), not in the ui components themselves. Changing `h-9` inside
  `src/components/ui/` would affect every view; overriding per view keeps this change to one view.
- `scheme-dark` is per-container on purpose; this change removes the reason it was left off the form.

## Historical Context (from prior changes)

- `context/archive/2026-10-05-fast-details-on-phone/plan.md:36` — new/edit pages explicitly out of scope (supported:
  still unmigrated).
- `context/archive/2026-10-05-fast-details-on-phone/change.md:19` — `scheme-dark` not global because of the form's
  `text-black` options (supported: options still `text-black`, `ApplicationForm.tsx:180-196`).
- `context/archive/2026-10-10-phone-friendly-list/plan.md:64` — form is S-07 and should inherit the phone rules
  (supported).
- `context/archive/2026-10-10-phone-friendly-list/follow-ups/review-fixes.md` — leftovers for S-07 or S-12:
  - details closed state `line-through opacity-60` — still present (`[id]/index.astro:112`); other view, out of this
    change's one-view scope.
  - Topbar `break-all` (`Topbar.astro:13`) and 20 px links (`Topbar.astro:15-32`) — still present; Topbar renders on
    this view too, so it is a candidate, but it is shared by every page.

## Related Research

- `context/archive/2026-10-05-fast-details-on-phone/research.md`
- `context/archive/2026-10-10-phone-friendly-list/research.md`

## Open Questions

1. **Kitchen sink for the form's states** — add initial props to `ApplicationForm` (e.g. `initialErrors`,
   `initialServerError`) so `/dev/ui` can server-render error states, or show static copies? S-06 chose shared class
   constants; for a stateful island initial props avoid a second copy of markup.
2. **Card surface** — `bg-muted` (same look as today's glass) or `bg-card` (same as details panels)?
3. **C5 scope** — fix the pre-hydration submit (e.g. render the submit button disabled until hydrated, or add
   `method="post"` with a server fallback) and a Warsaw "today" helper in `src/lib/domain/`, or defer to S-12?
4. **Topbar follow-ups** (`break-all`, 20 px links) — take them here (they are on this view) or leave for S-12?
5. zod v4 default English messages for max-length/enum violations were not verified by running the API.
