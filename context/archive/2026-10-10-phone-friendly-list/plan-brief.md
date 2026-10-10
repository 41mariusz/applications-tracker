# Application list usable on a 360 px phone (S-06) — Plan Brief

> Full plan: `context/changes/phone-friendly-list/plan.md`
> Research: `context/changes/phone-friendly-list/research.md`

## What & Why

The application list is the first screen during an unexpected HR call, and it is the one main view still built from literal classes instead of the design-system contract. On a 360 px phone, the audit found:

- the status pill sits in a different place on each card;
- a company name without spaces would push the page sideways;
- chips and the pill are 26 px tall, which is small for a thumb;
- the status filter shows no keyboard focus;
- closed applications dim their working status control.

This is roadmap item S-06, the first item of milestone M-2.

## Starting Point

The tokens (`src/styles/global.css`) and components (`src/components/ui/`) exist, and the details view already uses them. `/dashboard` uses none: 13 literal lines, 0 tokens, 0 shared components. No horizontal overflow occurs with realistic data, but the layout and the sizes above were measured in a local production preview.

## Desired End State

`/dashboard` reads only tokens and shared components, and lint keeps it that way. On a phone:

- the status control sits under the title in every card (to the right from 640 px);
- nothing scrolls sideways, even for unbroken names;
- chips and the status control are at least 40 px tall;
- focus is visible on every control;
- closed applications are struck through with muted text and a full-contrast status control.

A kitchen-sink section and a browser test keep it that way.

## Key Decisions Made

| Decision                  | Choice                                                                    | Why (1 sentence)                                                                            | Source   |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| Design-system variant     | Existing system; no new tokens or components                              | Every literal has a token and every control a component already.                            | Research |
| Status control on a phone | Under the title below 640 px, to the right from 640 px                    | A predictable place on the phone; titles keep the full width for long names.                | Plan     |
| Tap targets               | At least 40 px for chips and the status control, also on the details view | Comfortable for a thumb during a call and consistent on both screens.                       | Plan     |
| Closed applications       | Struck-through title and muted text; status control in full contrast      | Still visibly closed (PRD "crossed out"), while the control that reverts it stays readable. | Plan     |
| Order                     | Tokens and components → phone layout → states and gate                    | `/10x-ui` order; each phase keeps the test contracts and deploys alone.                     | Plan     |
| Guard                     | `CLEAN_VIEWS` in lint, a 360 px Playwright spec, a CLAUDE.md rule         | The next views (S-07, S-08) inherit the phone rules, not only the colours.                  | Plan     |

## Scope

**In scope:**

- tokens and components in `src/pages/dashboard.astro`;
- the closed-item treatment;
- the phone header layout and wrapping;
- 40 px chips and status pill (with an alignment option on `StatusControl`);
- the shortened search placeholder;
- `tests/e2e/phone-list.spec.ts`;
- visible focus;
- the `/dev/ui` "Lista aplikacji" section;
- before/after screenshots;
- the CLAUDE.md rule.

**Out of scope:**

- the Topbar (desktop width, 20 px links);
- a larger tap area for the company link;
- the add/edit form (S-07) and the CV library (S-08);
- any behaviour change (search, filters, order, URLs, statuses, texts);
- new tokens or dependencies;
- a CI screenshot baseline.

## Architecture / Approach

1. Change classes and component usage first, so the view looks the same but reads the contract.
2. Change the phone layout and sizes behind a new browser test.
3. Finish keyboard focus, the 7-state kitchen sink and the rule.

The markup contracts that smoke and E2E rely on (`<li>`, `data-status`, `line-through`, the "Szukaj" searchbox, test ids) are kept throughout.

## Phases at a Glance

| Phase                            | What it delivers                                                 | Key risk                                                           |
| -------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. View on tokens and components | 0 literals, shared components, closed-item treatment, lint guard | A subtle look change; before/after screenshots compared            |
| 2. Phone layout and tap targets  | Stable status position, wrapping, 40 px targets, phone E2E spec  | The shared StatusControl changes height on the details view too    |
| 3. States, visual gate and rule  | Visible focus, 7-state kitchen sink, screenshots, CLAUDE.md rule | Focus on chips must be drawn on the label, not the hidden checkbox |

**Prerequisites:** a local Supabase stack for smoke and E2E. No migration.
**Estimated effort:** about one session across 3 phases.

## Open Risks & Assumptions

- The details view's status control grows to 40 px. This was decided, but it changes the details view's look slightly, so its `/dev/ui` screenshots no longer match the archived S-04 set.
- A visual check of "looks as before" is by screenshot comparison, not an automated pixel diff.

## Success Criteria (Summary)

- During a call on the phone, the list reads cleanly: status always in the same place, nothing scrolls sideways, chips and status easy to tap.
- A keyboard user sees focus on every control of the list.
- Lint fails if a literal colour returns to the list, and a browser test fails if the phone layout regresses.
