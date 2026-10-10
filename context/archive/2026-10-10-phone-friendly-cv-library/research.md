---
date: 2026-10-10T09:32:24+00:00
researcher: Claude (Opus 5.5) for Mariusz Michalak
git_commit: c45c2d7d9df102edcbd4d9bc13ae6d2f615e1554
branch: phone-friendly-cv-library
repository: 41mariusz/applications-tracker
topic: "/10x-ui audit of the CV library view (/cv) — charges for a 360 px phone and the UI token contract (S-08)"
tags: [research, ui, design-tokens, phone, cv-library, CvLibrary, CvPreview]
status: complete
last_updated: 2026-10-10
last_updated_by: Claude (Opus 5.5)
---

# Research: /10x-ui audit of the CV library view (/cv)

**Date**: 2026-10-10T09:32:24+00:00
**Researcher**: Claude (Opus 5.5) for Mariusz Michalak
**Git Commit**: c45c2d7d9df102edcbd4d9bc13ae6d2f615e1554
**Branch**: phone-friendly-cv-library
**Repository**: 41mariusz/applications-tracker

## Research Question

Two-way audit (source → view, view → source) of `/cv` — `src/pages/cv.astro` and its island `src/components/applications/CvLibrary.tsx` (plus the lazy `CvPreview.tsx` it renders) — against the existing design system (tokens in `src/styles/global.css` `:root`, components in `src/components/ui/`). Output: 3–5 charges with file, line and user effect, for roadmap S-08 ("use the CV library and its preview comfortably on a 360 px phone", MS-01). Also: what happens when the view is reached logged out, empty, after a failed read, or from a link.

## Summary

- **Contract variant: existing design system, view not reading it.** Hardcoded-value scan (the `/10x-ui` regex) on 2026-10-10: `cv.astro` 2 lines, `CvLibrary.tsx` 17 lines, `CvPreview.tsx` 2 lines. Token classes: 0 / 1 / 1. Imports from `src/components/ui/`: 0 / 0 / 1. None of the three files is in `CLEAN_VIEWS` (`scripts/check-ui-literals.mjs:6-22`), so `npm run lint` does not guard them. Every literal found has a token on record in `context/archive/2026-10-05-fast-details-on-phone/tokens.md:7-26`. The one exception is the white "paper" behind the rendered document (`CvPreview.tsx:103`), for which `:root` has no token.
- **The twin already on the contract is `CvPanel.tsx`** (details view). It renders the same preview toggle, download link, ErrorBoundary/Suspense/CvPreview block and file input with token classes. CvLibrary copied that block in literal form, so the fix is reuse, not new design. Neither copy meets the 40 px phone rule today: both use `Button size="sm"` + `h-auto py-1.5 text-xs`, about 28 px estimated from the classes, not measured.
- **Phone layout:** CvLibrary has no `wrap-anywhere` or `min-w-0` anywhere, and it uses `flex flex-wrap … justify-between` at `:29` and `:96`. That is the pattern S-06 replaced with stacking below 640 px (`ApplicationCard.astro:34`).
- **Entry paths are sound** (middleware guards `/cv`, a paused project goes to `/paused`, a failed read gives a logged 500), with two exceptions:
  - The download link is a plain navigation, so its failures show raw JSON.
  - The failed-read state hides the upload form.
- **Tests that pin the view today:**
  - smoke: `data-usage-count="1"` and the application id in the `/cv` HTML (`scripts/smoke.mjs:514-519`)
  - e2e: the "Biblioteka CV" heading (`tests/e2e/seed.spec.ts:28`)
  - Nothing measures `/cv` at 360 px, and `/dev/ui` has no CV library state.

## Charges

Each charge: category, evidence (file:line), effect on the user, and the fix the evidence points to. Pixel heights are estimated from Tailwind classes (sm button `h-8` overridden by `h-auto py-1.5 text-xs` ≈ 28 px), not measured in a browser.

### C1 — Missing tokens: the page and island are painted with literals (21 scan hits across 3 files)

- **Evidence:**
  - `src/pages/cv.astro:39`: `text-white`.
  - `src/pages/cv.astro:41`: the load-error banner is `bg-red-500/20 … text-red-200`.
  - `src/components/applications/CvLibrary.tsx` has 17 lines with literals. Each, with the token it maps to (`tokens.md:7-26`):
    - `:28` `border-white/10 bg-white/10` → `border-border bg-muted`, the list card's choice (`ApplicationCard.astro:21`).
    - `:32` `text-purple-300` → `text-link`.
    - `:35`, `:68`, `:102`, `:104`, `:169` `text-blue-100/60` → `text-muted-foreground`.
    - `:75` `text-blue-100/50` → `text-muted-foreground`.
    - `:158`, `:170`, `:185` `text-blue-100/70` and `:167` `/80` → `text-supporting-foreground`.
    - `:46`, `:167` `bg-purple-600 hover:bg-purple-500` → `bg-primary` through `Button`.
    - `:53` `border-white/20` → `border-input`.
    - `:157`, `:185` `bg-white/5` → `bg-card`.
  - `CvPreview.tsx:87` `text-blue-100/60` (loading line) → `text-muted-foreground`.
  - Four opacity steps of one "muted text" role (`/50`, `/60`, `/70`, `/80`) where the contract has two tokens.
- **Effect on the user:** `/cv` looks like a different app from the list and the details view right next to it in the Topbar. Its error banner is pink-on-pink, while the dashboard's is the shared destructive `Alert` (`dashboard.astro:57-61`). Because none of the files is in `CLEAN_VIEWS`, the next edit can add literals without lint noticing.
- **Fix the evidence points to:**
  - Swap each literal for the mapped token.
  - Replace the banner with `<Alert variant="destructive"><AlertDescription>` as on the dashboard.
  - Add `cv.astro`, `CvLibrary.tsx` and any shared class/component file to `CLEAN_VIEWS` (impl-review F7 of S-06: shared class files go in too).
  - `CvPreview.tsx`: see C5 and the Open Questions.

### C2 — Missing shared component: the CV actions + preview block exists twice, the library copy off-contract

- **Evidence:**
  - `CvLibrary.tsx:24,39-72` (preview toggle state, hand-built `<button>` "Podgląd/Ukryj", hand-built `<a>` "Pobierz", ErrorBoundary + Suspense + lazy CvPreview) duplicates `CvPanel.tsx:43,117-153`, which builds the same thing from `Button` / `Button asChild variant="outline"`.
  - The file input `CvLibrary.tsx:157-176` duplicates `CvPanel.tsx:188-210`; the panel copy uses `Label` and token classes.
  - The disabled state differs: `disabled:opacity-60` on the input at `CvLibrary.tsx:167`, versus `pointer-events-none opacity-60` on the wrapper at `CvPanel.tsx:159`.
  - The two copies have already drifted:
    - The library labels the hide action "Ukryj", the panel "Ukryj podgląd".
    - The library's download `<a>` (`:51-57`) has no focus style, while `Button` brings `focus-visible:ring-ring` (`button.tsx:13`).
- **Effect on the user:**
  - On a phone, "Podgląd", "Pobierz" and the file picker button are about 28 px tall, below the 40 px rule (CLAUDE.md "Phone rules"), on both screens.
  - A keyboard user cannot see focus on "Pobierz" in the library.
  - Any fix made to one copy (40 px, focus, wording) silently misses the other.
- **Fix the evidence points to:**
  - Extract the actions + boundary-wrapped preview into one component in `src/components/applications/` used by both islands.
  - Optionally extract the file-input markup/classes too.
  - Give the controls `min-h-10`. That is the repo's 40 px pattern: `FILTER_CHIP_CLASS` in `list-classes.ts:4-5` and `STATUS_PILL_CLASS` in `StatusControl.tsx:12-13`. No `Button` size except `lg` (`h-10`, `button.tsx:24`) reaches 40 px.
  - Keep the upload request logic out of it: it overlaps S-10, see Deferred.

### C3 — Missing shared pattern: the item layout breaks the phone rules S-06 established

- **Evidence:**
  - The item header `CvLibrary.tsx:29` is `flex flex-wrap items-start justify-between gap-2`.
    - Its text block (`:30`) has no `min-w-0`.
    - The file name (`:31-34`) has no `wrap-anywhere`.
  - Usage rows `:96` use the same `flex flex-wrap … justify-between` and no wrapping on company/position (`:101-103`).
  - The usage toggle (`:78-90`) and the application links (`:98-103`) are text-sized and have no focus style.
  - Closed applications use `line-through opacity-60` (`:100`), which S-06 review F4 removed from the list in favour of `text-muted-foreground line-through` (`ApplicationCard.astro:37`).
  - The list's answer is `flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between` (`ApplicationCard.astro:34`) plus `min-w-0 wrap-anywhere` on text.
- **Effect on the user:**
  - At 360 px, the usable width inside the card is about 296 px (page `p-4` plus card `p-4`).
  - A long unbroken file name (e.g. `CV_Jan_Kowalski_Senior_Frontend_2026_final_v3.pdf`) runs out of the card instead of wrapping.
  - The two buttons jump below the name or stay beside it depending on the name's length.
  - The "Podpięte do aplikacji: N" toggle and the application links are hard to hit with a thumb.
- **Fix the evidence points to:**
  - Mirror `ApplicationCard`: stack below `sm`, `min-w-0 wrap-anywhere` on name/company/position, `min-h-10` on the toggle.
  - Use the ring-token focus style from `ApplicationCard.astro:42` on links.
  - Use `text-muted-foreground line-through` for closed applications.

### C4 — Accidental architecture: entry and exit paths that strand the user

- **Evidence:**
  - **(a) Download failures show raw JSON.** "Pobierz" is a navigation to `GET /api/cv/[id]?download=1` (`CvLibrary.tsx:51-57`, `src/lib/cv-urls.ts:4-7`). On an expired session, an unknown id, a paused project or a failed read, the route answers JSON (401 at `src/pages/api/cv/[id].ts:10-12`, 404 via `routeId` at `src/lib/http.ts:15-18`, 503/500 via `failureResponse`). The browser shows that JSON as a page. Same for the "Otwórz plik w nowej karcie" links (`CvPreview.tsx:93`, `ErrorBoundary.tsx` PreviewFallback).
  - **(b) A failed read hides the upload form.** On a failed read `cv.astro:27-31` logs and sets 500, then renders the banner and skips the whole island (`:41-42`). There is no retry action.
  - **(c) No confirmation after upload.** A successful upload does `window.location.reload()` (`CvLibrary.tsx:143-145`). There is no success message and no highlight of the new item. If the reload's read fails, the user sees (b) with no word that the file was saved.
  - **(d) Not reachable today:** the `if (supabase)` false branch (`cv.astro:14`) would render an empty library with 200 and no log. The middleware already redirects protected pages to `/500` when config is missing (`src/middleware.ts:66-79`; `supabase` is null only without `SUPABASE_URL`/`SUPABASE_KEY`, `src/lib/supabase.ts:7-9`). The same pattern is in `dashboard.astro:19`.
  - **Verified fine:**
    - Logged out: `/cv` and `/cv?…` are in `PROTECTED_ROUTES` (`middleware.ts:8,62`) and redirect to sign-in with `next`. Proven by smoke (`smoke.mjs:578`) and e2e (`seed.spec.ts:13-31`).
    - A paused project redirects to `/paused` (`middleware.ts:90-95`, `cv.astro:28`).
- **Effect on the user:**
  - (a) On a phone with an expired session, tapping "Pobierz" swaps the app for `{"error":…}` and the back button is the only way out.
  - (b) After a transient read failure, the user cannot even retry the upload.
  - (c) After uploading into a long list, the user does not see where the file landed.
- **Fix the evidence points to:**
  - (b) and (c) are in this view: keep the upload box rendered when the list failed and add a reload link; show a success line or anchor the new item, e.g. reload with `#cv-<id>` and `data-cv-id`.
  - (a) is an API-route behaviour shared with the details view and the preview fallbacks. That is the plan's call: in scope, or deferred to S-12 (audit-findings-closed).
  - (d) is a latent silent-failure path shared with the dashboard. Defer it with a note, or harden both with `logError` + 500, as `lessons.md` "Errors must leave a signal" asks.

### C5 — Accidental architecture: no visual gate or guard for /cv, and the preview surface is unresolved

- **Evidence:**
  - **Kitchen sink:** `/dev/ui` (`src/pages/dev/ui.astro`) shows `CvPanel` with and without a library (`:503-508`), `PreviewFallback` (`:360`) and the preview loading text (`:373`). It shows no CvLibrary state: no item, empty library, usage expanded, closed application, long file name, upload pending or error.
  - **Phone guard:** no Playwright spec opens `/cv` at 360 px. `tests/e2e/phone-list.spec.ts` covers `/dashboard` only.
  - **Preview surface:**
    - The rendered document sits on `bg-white … text-black` inside `max-h-[75vh]` (`CvPreview.tsx:103`). There is no comment and no token.
    - The white surface is almost certainly intentional: pdf.js canvases and docx-preview's own `.docx { color: black }` assume a white page. That is inferred from the code and the first preview commit `4a902a7`, not from a comment.
  - **Preview loading:**
    - The empty white container shows under "Wczytywanie podglądu…" while loading (`CvPreview.tsx:87,101-106`; only `hidden` on error).
    - The Suspense fallback (`CvLibrary.tsx:68`) has no container.
    - The result is a small jump when the chunk arrives, and another when the text disappears after the last PDF page.
- **Effect on the user:** none directly visible today. Without a kitchen-sink section and a 360 px spec, the phone fixes from C2–C4 can regress unnoticed, as the list could before S-06. A white flash of an empty bar under the loading text looks like a broken frame on a phone.
- **Fix the evidence points to:**
  - Add a "Biblioteka CV" section to `/dev/ui` that renders the real CvLibrary item component, not copied markup (S-06 review F1/F3/F6).
  - Add a 360 px spec mirroring `phone-list.spec.ts`: no horizontal scroll, controls ≥ 40 px, long names wrap.
  - Decide the paper surface: a token such as `--paper`/`--paper-foreground`, or a documented exception. Hide the container while loading. These are class-only edits in `CvPreview.tsx:86-106`, inside S-09's file; see Open Questions.

### Deferred candidates (keep listed, decide in the plan)

- **Narrow DOCX column on a phone.**
  - docx-preview 0.4.1 keeps Word page margins as section padding even with `ignoreWidth: true` (`node_modules/docx-preview/dist/docx-preview.mjs:3102-3109`), and `section.docx { overflow: hidden }` clips wide tables and images (`:3291`).
  - With options from `cv-render.ts:31-37` and ~280 px inside the preview, a 2.5 cm margin leaves a text column of roughly 90 px. That figure is estimated from typical Word defaults, not measured.
  - PDF fits: the canvas is drawn at container width with CSS `width:100%` (`cv-render.ts:10-28`).
  - Renderer options belong to S-09 (cv-preview-by-type). Hand it over there.
- **Shared upload helper** (`checkCvFile` → `apiRequest("/api/cv")` → `reused`) duplicated in `CvLibrary.tsx:120-148` and `CvPanel.tsx:67-101`. It overlaps S-10, which changes how reuse is detected. Leave it to S-10.
- **Topbar links ≈ 20 px and `break-all`** (`Topbar.astro:7`). These were already deferred by S-06 (`context/archive/2026-10-10-phone-friendly-list/follow-ups/review-fixes.md`, F8 → S-07/S-12). The Topbar sits on `/cv` too, so a 360 px spec here must measure the view's own controls, as `phone-list.spec.ts` does.

## Detailed Findings

### Tokens and components (source → view)

- `:root` in `src/styles/global.css:11-60` defines these tokens:
  - surfaces: `background`, `card`, `popover`, `muted`
  - text: `foreground`, `muted-foreground` (60%), `supporting-foreground` (70%), `link`, `destructive` (text on dark only), `warning`
  - actions: `primary`/`-foreground`, `secondary`, `accent`
  - lines: `border`, `input`, `ring`
  - shape: `radius`
- `@theme inline` (`:62-101`) publishes them as `--color-*`. `bg-cosmic` is an `@utility` (`:103`).
- No token exists for a white document surface.
- `src/components/ui/` contains alert, badge, button, card, input, label, native-select, textarea and LibBadge. The `/cv` view imports none of them directly. `CvPreview.tsx` imports `Alert`.
- `Button` sizes (`button.tsx:26-31`): default `h-9`, sm `h-8`, lg `h-10`, icon `size-9`. CLAUDE.md forbids the `destructive` variant as-is.

### View → source (what covers each literal)

The mapping in C1 comes from `tokens.md:7-26` and agrees with how the already-migrated views use them:

- `dashboard.astro:49` content column `text-foreground`.
- `dashboard.astro:64` empty state `border-border bg-card text-supporting-foreground rounded-xl border p-6 text-center`, which is a one-to-one replacement for `CvLibrary.tsx:185`.
- `ApplicationCard.astro:21` card `border-border bg-muted rounded-xl border p-4 backdrop-blur-xl`.
- `CvPanel.tsx:110-116,188-210` file line and file input.

### States as they exist today (input to the 7-state matrix)

| State | /cv today | Source |
|---|---|---|
| default | literal colours | C1 |
| hover | `hover:bg-purple-500`, `hover:bg-white/10`, `hover:underline` — literal | `CvLibrary.tsx:46,53,84,100` |
| focus-visible | none on the download `<a>`, the usage toggle or the application links; the file input has none (`CvPanel.tsx:194-201` has `focus-visible:ring-ring`) | `CvLibrary.tsx:51-57,78-103,167` |
| disabled | input `disabled` + `disabled:opacity-60` while uploading | `CvLibrary.tsx:164,167` |
| error | upload error `role="alert" text-destructive` (on contract); load error literal banner; preview error `Alert` (on contract) | `CvLibrary.tsx:171-175`, `cv.astro:41`, `CvPreview.tsx:88-100` |
| empty | centred paragraph, literal colours; no `data-testid` | `CvLibrary.tsx:184-187` |
| loading | upload "Wgrywanie…" text; preview Suspense text, then text + empty white bar | `CvLibrary.tsx:68,169`, `CvPreview.tsx:87,101-106` |

### Test-pinned markup a restyle must keep

- The `data-usage-count` attribute on the usage toggle (`CvLibrary.tsx:86`) is asserted by smoke (`scripts/smoke.mjs:514-518`).
- Smoke also asserts that the `/cv` HTML contains the application id (`smoke.mjs:519`).
  - The usage list is collapsed during SSR (`listOpen` starts `false`, `CvLibrary.tsx:25`), so no `/applications/<id>` `<a>` is rendered then.
  - The id therefore reaches the HTML only through the island's serialized props (`client:load`, `cv.astro:42`). That is inferred from the code, not observed in the HTML.
  - Any change that stops passing application ids to the island as props, or that renders the list server-side without the ids, would break this smoke step.
- The heading "Biblioteka CV" (`cv.astro:40`) is asserted by `tests/e2e/seed.spec.ts:28,31`.
- No inspected test uses `data-testid="cv-library"`, `data-testid="cv-usage"`, `data-cv-id` or `cv-library-upload` (grep over `tests/` and `scripts/`). They are cheap to keep.
- `data-testid="cv-preview"` and `cv-preview-error` (`CvPreview.tsx:89,105`) are unused by tests today. They are the likely hooks for S-09's browser test, so keep them.

### Agent rules

- CLAUDE.md "UI contract" already forbids literal colours and arbitrary values, names the tokens and `src/components/ui/`, lists the phone rules and points to `/dev/ui`.
- No rule invites one-off values.
- The only rule work for this change is mechanical: add the cleaned files to `CLEAN_VIEWS`, and mention the CV kitchen-sink section if CLAUDE.md lists them.

## Code References

- `src/pages/cv.astro:14-32` — data read, paused redirect, logged 500.
- `src/pages/cv.astro:37-44` — layout, literal banner, island.
- `src/components/applications/CvLibrary.tsx:22-111` — `CvItem` (header, actions, preview, usage list).
- `src/components/applications/CvLibrary.tsx:113-178` — `UploadToLibrary`.
- `src/components/applications/CvLibrary.tsx:180-195` — empty state / list.
- `src/components/applications/CvPanel.tsx:106-153,159,188-210` — the on-contract twin.
- `src/components/applications/CvPreview.tsx:61-77` — renderer dispatch (S-09 territory).
- `src/components/applications/CvPreview.tsx:85-106` — loading line, error Alert, white container.
- `src/components/applications/cv-render.ts:10-37` — PDF fit-to-width, DOCX options.
- `src/components/applications/ApplicationCard.astro:21-58` — the list's phone pattern.
- `src/components/applications/list-classes.ts:1-5` — shared `min-h-10` chip class, shared with `/dev/ui`.
- `scripts/check-ui-literals.mjs:6-25` — `CLEAN_VIEWS` and the `LITERAL` regex. It ignores opacity utilities and arbitrary values in units other than px/rem, such as `max-h-[75vh]`.
- `tests/e2e/phone-list.spec.ts:8,55-99` — 360 px viewport, own-data filter, overflow and 40 px assertions.
- `src/pages/dev/ui.astro:360,373,378-474,503-508` — existing CV pieces and the list section to model on.

## Architecture Insights

- S-06 set the reusable shape for a phone pass on this repo:
  - token swap by `tokens.md`
  - stack below `sm` and `min-w-0 wrap-anywhere`
  - `min-h-10` controls via a shared class constant imported by both the view and `/dev/ui`
  - a 360 px Playwright spec that measures only the test's own data
  - before/after PNGs in the change folder instead of pixel baselines (no `toHaveScreenshot` in the repo; S-06 ruled CI baselines out)
- **CV E2E data constraint:** CVs are never deleted (CLAUDE.md), and `tests/e2e/support/local-admin.ts` deletes applications only. Storage dedups by content per user (`(user_id, sha256)` unique), so a spec that always uploads the same fixture bytes adds at most one `cv_files` row to the shared E2E user. Its displayed name is the first upload's name. That bounds leftovers without a new cleanup helper. This is an inference from the dedup rule; it is not tested.

## Historical Context (from prior changes)

- `context/archive/2026-10-05-fast-details-on-phone/tokens.md:7-26`: literal → token table, which still matches `global.css` (supported).
- `context/archive/2026-10-10-phone-friendly-list/plan.md`:
  - It put "the CV library (S-08)" explicitly out of scope (supported).
  - Topbar 20 px links were deferred (F8 → S-07/S-12), so they are still open (supported).
- `context/archive/2026-10-10-phone-friendly-list/reviews/impl-review.md` gives the rules this change should apply from the start:
  - F1: share classes with `/dev/ui`, no hand copies.
  - F2: E2E measures its own data.
  - F4: no `opacity-*` for muted text.
  - F6: show every optional variant in `/dev/ui`.
  - F7: shared class files go in `CLEAN_VIEWS`.
- `context/archive/2026-10-06-refactor-opportunities/research.md:157-166` (K6): renderer-per-type is S-09's change, so S-08 leaves the dispatch at `CvPreview.tsx:71-73` and `cv-render.ts` alone.
- `context/foundation/roadmap.md` S-08 risk: it touches the same preview component as S-09, so run them one after the other.

## Related Research

- `context/archive/2026-10-10-phone-friendly-list/research.md` — the list's charges (same method).
- `context/archive/2026-10-06-cv-flow-analysis/research.md` — CV flow gaps (K3, K6, K8).

## Open Questions

1. **Paper surface for the preview.** Add `--paper`/`--paper-foreground` tokens and put `CvPreview.tsx` into `CLEAN_VIEWS`? Or keep `bg-white text-black` as a commented exception and leave CvPreview out of the list until S-09? Either way the edit is class-only and inside S-09's file, so it needs agreed sequencing.
2. **Download/open failures as raw JSON (C4a).** Fix in S-08, which touches the API route shared with the details view, or defer to S-12?
3. **Shared CV actions component (C2).** It also moves the details view's `CvPanel` buttons to 40 px. That is in the spirit of MS-01 but outside "one view". Accept the ride-along, or extract it now and restyle only `/cv`?
4. **Latent `if (supabase)` silent-empty path (C4d).** Fix it in both pages here, or record it for S-12?
