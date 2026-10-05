# Application Details on a Phone — Plan Brief

> Full plan: `context/changes/fast-details-on-phone/plan.md`
> Research: `context/changes/fast-details-on-phone/research.md`

## What & Why

The application details page is the screen opened while a recruiter is on the line. It works and is fast (P50 223 ms), but it is glued together from 72 literal colour classes with no shared components, keyboard focus is invisible, a mistyped link shows a misleading error, signing in from a link loses the target, and the top bar does not fit a 360 px phone. Roadmap S-04, done through `/10x-ui` (course M2L5).

## Starting Point

`src/styles/global.css` holds the stock shadcn white/grey tokens that the app never shows; the real dark navy/purple look lives in literal classes. `src/components/ui/button.tsx` exists but this view does not use it. Speed was measured in production and is not the problem.

## Desired End State

The details page looks essentially the same but is built from semantic tokens and shared components, shows focus and "saving" feedback, gives a real 404 for bad links, returns to the application after sign-in, and fits a phone. A dev-only kitchen sink proves all 7 states, and a rule plus a lint check keep the next agent from bringing literals back. Other pages are untouched.

## Key Decisions Made

| Decision    | Choice                                                                        | Why (1 sentence)                                                                            | Source   |
| ----------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| Theme       | One dark theme; tokens take today's colours                                   | The app only ever shows the dark look; no light mode is wanted.                             | Research |
| Scope       | Only `/applications/[id]` (+ shared `Topbar`) moves to the contract           | `/10x-ui` rule: one view per change; other pages migrate later and stay visually unchanged. | Research |
| Speed       | Not optimised (C5 deferred)                                                   | Measured P50 223 ms / P90 672 ms — far inside the "< 10 s during a call" goal.              | Research |
| Visual gate | Dev-only kitchen sink `/dev/ui` + headless screenshots (1280/360 px)          | One screen proves all 7 states without adding a test dependency.                            | Plan     |
| Return path | `?next=` after sign-in, in-app paths only                                     | A link from the phone should open the offer directly; open redirects are refused.           | Plan     |
| Guard       | CLAUDE.md UI rule + dependency-free literal scan in `npm run lint`            | A failing check beats a forgotten rule — the rule alone is how 72 literals happened.        | Plan     |
| Components  | shadcn `card`, `badge`, `input`, `textarea`, `label`, `alert` + native select | Covers every hand-built element the audit found in this view.                               | Plan     |

## Scope

**In scope:** shadcn components; token values; page, Topbar and three islands on tokens/components; 360 px layout; 404/500 for the view; return after sign-in; focus-visible and pending states; `client:idle` for the CV panel; kitchen sink; smoke steps; CLAUDE.md rule; lint scan.

**Out of scope:** other pages' migration; light mode or new colours; data-loading optimisation; Playwright in the repo (lesson M3L4).

## Architecture / Approach

Contract before pixels: components and dark native controls → token values equal to today's look (screenshot diff proves other pages did not move) → the view rebuilt from tokens/components → entry fixes and the 7 states, shown in `/dev/ui` → rule and lint check.

## Phases at a Glance

| Phase                               | What it delivers                                           | Key risk                                                     |
| ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Components and theme environment | shadcn components, native select, `color-scheme: dark`     | Generated components clash with existing `button.tsx` styles |
| 2. Token values = today's look      | Tokens carry the real colours; values on record            | A token value drifts and other pages change slightly         |
| 3. Details view on the contract     | 0 literals in 6 files; fits 360 px                         | Behaviour regression in an island while re-marking it        |
| 4. Entry and the 7 states           | 404/500, return after sign-in, focus/pending, kitchen sink | Open redirect if `next` is not validated                     |
| 5. Guard                            | CLAUDE.md UI rule; literal scan in `npm run lint`          | Scan too broad (false positives) or too narrow               |

**Prerequisites:** local Supabase for smoke tests (previews use `.dev.vars` only — never swap `.env`); headless Chromium in the scratchpad for screenshots.
**Estimated effort:** ~2–3 sessions across 5 phases.

## Open Risks & Assumptions

- Token values are chosen to match current literals; tiny shade differences (opacity blends) may show — Phase 2's ≤ 0.1 % pixel diff catches them.
- `Topbar` is shared by every page; its markup changes everywhere, its look should not.

## Success Criteria (Summary)

- During a call on a phone, the details page shows the offer first, fits the screen, and gives clear feedback when saving.
- A mistyped or shared link leads to a clear "not found" or, after sign-in, straight to the application.
- The next change to this view uses tokens and shared components because the rule and the lint check say so.
