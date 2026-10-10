# CV library usable on a 360 px phone (S-08) — Plan Brief

> Full plan: `context/changes/phone-friendly-cv-library/plan.md`
> Research: `context/changes/phone-friendly-cv-library/research.md`

## What & Why

The CV library (`/cv`) is the last main view still painted with literal colours instead of the design-system contract. On a 360 px phone:

- a long file name runs out of the card;
- the buttons are about 28 px tall;
- three controls show no keyboard focus;
- a failed read also hides the upload box;
- after an upload the page reloads without saying where the file went.

This is roadmap item S-08 (milestone M-2, MS-01).

## Starting Point

The tokens (`src/styles/global.css`) and components (`src/components/ui/`) exist. The list, the details view and its `CvPanel` already use them.

`/cv` has 21 literal lines across `cv.astro`, `CvLibrary.tsx` and `CvPreview.tsx`, and no lint guard. Its actions and upload box are an off-contract copy of `CvPanel`'s.

## Desired End State

On a 360 px phone, `/cv` never scrolls sideways:

- the actions sit under each CV's name;
- every control is at least 40 px with a visible focus ring;
- closed applications are struck through in muted text.

A failed read shows the shared error `Alert` with "Odśwież", and the upload box stays. After an upload the page lands on the new CV, highlighted and confirmed.

The details view's CV panel shares the same actions and upload box. Lint, a 360 px browser test, `/dev/ui` and a CLAUDE.md rule keep both views this way.

## Key Decisions Made

| Decision                      | Choice                                                                        | Why (1 sentence)                                                                                    | Source   |
| ----------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------- |
| Design-system variant         | Existing system; one new token pair `paper`/`paper-foreground`                | Every UI literal has a token; only the white document surface had no role.                          | Research |
| Preview surface               | `bg-paper text-paper-foreground`, `CvPreview` under lint (class-only edits)   | The whole view is guarded; S-09 inherits a named surface instead of a literal.                      | Plan     |
| Duplicated CV actions/upload  | Shared `CvFileActions` and `CvUploadBox`, used by `/cv` and the details view  | One fix for both screens; the details view's buttons grow to 40 px as the status pill did in S-06. | Plan     |
| Upload confirmation           | Reload onto `#cv-<id>` with a `:target` highlight and a confirmation line     | On a long phone list the user sees where the file landed.                                           | Plan     |
| Failed read                   | `Alert` + "Odśwież", upload box still rendered                                | A transient read failure no longer blocks uploading.                                                | Plan     |
| Raw JSON on download failure  | Deferred to S-12                                                              | It is an API-route behaviour shared with the details view, not a view change.                       | Plan     |
| Silent `if (supabase)` path   | Deferred to S-12                                                              | Unreachable today (middleware), and also present in the dashboard.                                  | Plan     |
| E2E data                      | A fixed CV fixture deduplicated by content, own applications deleted          | No CV-deleting code; at most one test CV ever stays in the local E2E user.                         | Plan     |
| Guard                         | `CLEAN_VIEWS`, `phone-cv.spec.ts`, `/dev/ui` section, CLAUDE.md rule          | Same guard set as S-06, so the next CV work stays on the contract.                                  | Plan     |

## Scope

**In scope:**

- the `paper` token;
- `CvPreview` classes, including the empty loading bar;
- `CvFileActions` and `CvUploadBox`, adopted in `CvPanel` and `CvLibrary`;
- `/cv` on tokens with the phone layout:
  - stacked actions;
  - `wrap-anywhere`;
  - 40 px controls;
  - ring focus;
  - closed applications without opacity;
- the upload anchor and confirmation;
- the failed-read state with the upload box;
- `phone-cv.spec.ts`;
- the `/dev/ui` "Biblioteka CV" section;
- screenshots;
- the CLAUDE.md rule;
- hand-over notes for S-09 and S-12.

**Out of scope:**

- the `/api/cv/[id]` raw JSON (S-12);
- the silent `supabase` path (S-12);
- renderer choice and the narrow DOCX column (S-09);
- the shared upload request logic (S-10);
- the Topbar;
- the add/edit form (S-07);
- deleting CVs;
- a CI pixel baseline;
- new dependencies;
- any migration.

## Architecture / Approach

The `/10x-ui` order:

1. **Shared pieces first.** Build the token and the two shared components, and prove them on the already-clean `CvPanel`.
2. **Then the view.** Move `/cv` onto them with the list card's phone pattern, behind a 360 px spec.
3. **Then the two small behaviour fixes.** Pure anchor helpers live in `src/lib/domain/cv.ts` with unit tests.
4. **Last, the gate.** The kitchen sink, screenshots and the rule.

Markup that smoke and E2E rely on stays in place throughout: `data-usage-count`, application ids in the island props, and the "Biblioteka CV" heading.

## Phases at a Glance

| Phase                                     | What it delivers                                                           | Key risk                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1. Paper token and shared CV pieces       | `--paper`, `CvFileActions`, `CvUploadBox`, `CvPanel` on them, lint guard   | Hiding the empty preview must keep its width (pdf.js measures it once)         |
| 2. /cv on the contract and on the phone   | 0 literals, list-card layout, 40 px, focus, `phone-cv.spec.ts`             | Smoke reads the application id from island props; the props must keep it      |
| 3. Upload confirmation and failed read    | Anchor + highlight + message; `Alert` + upload box on a failed read        | A hash change alone does not reload; set it, then reload                      |
| 4. States, visual gate and rule           | `/dev/ui` 7-state section, screenshots, CLAUDE.md rule, hand-overs        | States that need interaction must come from real components, not copies       |

**Prerequisites:** a local Supabase stack for smoke and E2E. S-09 has not started, and it must start after this change.
**Estimated effort:** about one to two sessions across 4 phases.

## Open Risks & Assumptions

- The details view's CV buttons and upload picker grow to 40 px, and its actions move to the right from 640 px. That was decided, but it changes the details view's look, so it needs before/after screenshots.
- The E2E fixture leaves one CV in the local E2E user's library for good. It is accepted because CVs are never deleted, and dedup caps it at one.
- "Looks as before" for the token swap is checked by screenshot comparison, not by an automated pixel diff.

## Success Criteria (Summary)

- On a phone, the CV library reads and taps comfortably: nothing scrolls sideways, every control is thumb-sized, and focus is visible.
- After an upload, the owner sees the new CV at once. A failed list read still lets them upload.
- Lint fails on a returning literal, and the 360 px browser test fails on a layout regression.
