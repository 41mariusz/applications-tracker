# Application form usable on a 360 px phone (S-07) — Plan Brief

> Full plan: `context/changes/phone-friendly-form/plan.md`
> Research: `context/changes/phone-friendly-form/research.md`

## What & Why

The add/edit form is the last core-flow screen still built from literal colours and hand-made controls. It looks like
a different app from the list and details, CI does not guard it, and on a phone a failed save gives no visible signal —
the error sits under "Firma", off-screen. This change puts the form on the existing design-system contract and makes it
comfortable on a 360 px phone (roadmap S-07).

## Starting Point

`ApplicationForm.tsx` (shared by `new.astro` and `[id]/edit.astro`) has 15 scan hits across the three files, imports
only `Alert` from `src/components/ui/`, has no `aria-invalid`/`aria-describedby`, and the edit page renders a grey
sentence for an unknown id instead of the details view's "Nie znaleziono" card. Every token and component it needs
already exists.

## Desired End State

Both pages use the details-view shell and ui components; every control is at least 40 px tall at 360 px. An empty or
invalid submit moves focus to the first bad field and shows "Popraw zaznaczone pola." above "Zapisz". A bad edit link
shows the same "Nie znaleziono" card as the details view. `/dev/ui` shows the real form in all 7 states, and lint, smoke
and a Playwright spec keep it that way.

## Key Decisions Made

| Decision                      | Choice                                                           | Why (1 sentence)                                                                                      | Source   |
| ----------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| Contract variant              | Existing design system, no new values                            | Every literal maps to an existing token/component.                                                    | Research |
| 40 px controls                | `min-h-10` via shared `form-classes.ts`, ui components untouched | Same per-view convention as `StatusControl` / `list-classes.ts`; editing `h-9` would move every view. | Research |
| Validation failure UX         | Focus first invalid field + Alert above buttons                  | On a phone the user is at "Zapisz" when the error appears at the top.                                 | Plan     |
| Kitchen-sink states           | Optional initial props on the real component                     | One copy of markup; `/dev/ui` cannot drift from the form.                                             | Plan     |
| Card surface                  | `bg-card` card + details-view shell                              | Same look as details; `bg-muted` fields stand out on it.                                              | Plan     |
| Pre-hydration submit          | Submit disabled until hydrated                                   | Prevents a native GET putting form data in the URL.                                                   | Plan     |
| Over-length errors            | `maxLength` from exported schema limits                          | Zod's default English message becomes unreachable from the form.                                      | Plan     |
| Edit unknown id / failed read | Reuse details view's not-found card / `Alert`                    | One behaviour for the same mistake on both pages.                                                     | Research |
| E2E scope                     | Layout + error focus + create + edit not-found                   | First test that actually drives the form.                                                             | Plan     |
| Warsaw "today", Topbar fixes  | Deferred to S-12                                                 | Domain logic and a shared component are outside one view.                                             | Plan     |

## Scope

**In scope:**

- `ApplicationForm.tsx`, `new.astro`, `[id]/edit.astro`, new `form-classes.ts`, exported field limits
- Error/busy/required accessibility, pre-hydration submit
- `/dev/ui` form section (7 states), `phone-form.spec.ts`, smoke step, `CLEAN_VIEWS`, CLAUDE.md rule

**Out of scope:**

- New tokens or edits to `src/components/ui/*`
- Warsaw "today" default, Topbar (`break-all`, 20 px links), details closed state
- Polish zod messages, server fallback for no-JS submit, screenshot baselines

## Architecture / Approach

Shared classes first (no visual change), then the view rebuilt on `Label`/`Input`/`Textarea`/`NativeSelect`/`Button`
with those classes, then the stateful behaviour plus initial props that let `/dev/ui` server-render every state, then
guards. No API or database change; field `name`s, ids, texts and status codes stay as they are.

## Phases at a Glance

| Phase                                   | What it delivers                                                                 | Key risk                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Shared form classes and field limits | `form-classes.ts`, exported max lengths                                          | Extracting limits changes schema behaviour (covered by existing tests) |
| 2. The view on tokens and ui components | 0 literals, ≥ 40 px controls, edit not-found card, submit disabled pre-hydration | Plain ui swap drops controls to 36 px                                  |
| 3. States — error, busy, kitchen sink   | Focus + Alert on validation, aria wiring, 7 states in `/dev/ui`                  | Focus before React renders errors; disabling inputs empties FormData   |
| 4. Guards                               | Playwright phone spec, smoke step, `CLEAN_VIEWS`, CLAUDE.md                      | Flaky create/cleanup in e2e                                            |

**Prerequisites:** local Supabase running (`npx supabase start`) and `.dev.vars.e2e` for Playwright.
**Estimated effort:** ~2 sessions across 4 phases.

## Open Risks & Assumptions

- The pre-hydration GET leak is inferred from markup, not reproduced; the fix is cheap either way.
- Native `<option>` styling varies by browser; verified in Chromium only.

## Success Criteria (Summary)

- On a 360 px phone the owner can add and edit an application without sideways scrolling or tiny targets.
- A failed save always shows where the problem is and puts the cursor there.
- `npm run lint` fails if a literal colour returns to the form.
