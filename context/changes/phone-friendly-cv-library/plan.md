# CV library usable on a 360 px phone (S-08) Implementation Plan

## Overview

Move the CV library view `/cv` (`src/pages/cv.astro` + island `src/components/applications/CvLibrary.tsx`) onto the repo's UI contract and make it comfortable on a 360 px phone. The contract is the tokens in `src/styles/global.css` and the components in `src/components/ui/`.

The CV actions (Podgląd / Pobierz + boundary-wrapped preview) and the upload box exist twice, in the library and in the details view's `CvPanel.tsx`. Both become one shared component each, so the details view also gets 40 px controls. Two small behaviour fixes are included:

- a failed read keeps the upload box;
- after an upload the page reloads onto the new item, highlights it and confirms it.

The plan ends with a kitchen-sink section, a 360 px Playwright spec, a lint guard and the CLAUDE.md rule. Roadmap M-2, S-08 (MS-01). Charges C1–C5 come from `research.md`.

## Current State Analysis

- **Literals and lint coverage.** Literal scan: `cv.astro` 2 lines, `CvLibrary.tsx` 17, `CvPreview.tsx` 2. None of the three is in `CLEAN_VIEWS` (`scripts/check-ui-literals.mjs:6-22`). Every literal has a token on record (`context/archive/2026-10-05-fast-details-on-phone/tokens.md:7-26`), except the white document surface `bg-white text-black` (`CvPreview.tsx:103`).
- **The off-contract copies (C2).**
  - `CvLibrary.tsx:24,39-72` duplicates `CvPanel.tsx:43,117-153` (toggle, buttons, ErrorBoundary + Suspense + lazy CvPreview).
  - The upload box `CvLibrary.tsx:157-176` duplicates `CvPanel.tsx:188-210`.
  - The panel copies are on the contract, but at about 28 px tall (`h-auto py-1.5 text-xs`). The repo's 40 px pattern is `min-h-10` (`list-classes.ts:4-5`, `StatusControl.tsx:12-13`).
- **Phone layout (C3).**
  - The item header and usage rows are `flex flex-wrap … justify-between` (`CvLibrary.tsx:29,96`), with no `min-w-0` or `wrap-anywhere`.
  - The usage toggle and the application links are text-sized with no focus style (`:78-103`).
  - Closed applications use `line-through opacity-60` (`:100`).
  - The list's pattern is `ApplicationCard.astro:34,37,42`.
- **Behaviour (C4b/c).**
  - A failed read renders a literal banner and skips the whole island (`cv.astro:41-42`).
  - A successful upload calls `window.location.reload()` with no confirmation (`CvLibrary.tsx:143-145`).
- **No guard (C5).** `/dev/ui` has no CV library state. No spec opens `/cv` at 360 px.
- **Contracts tests rely on:**
  - smoke `data-usage-count="1"` and the application id in the `/cv` HTML (`scripts/smoke.mjs:514-519`; the id arrives through the island's serialized props, because the usage list is collapsed during SSR);
  - e2e heading "Biblioteka CV" (`tests/e2e/seed.spec.ts:28,31`);
  - no test uses the "Podgląd"/"Ukryj"/"Pobierz" labels or the `cv-*` test ids (grep over `tests/` and `scripts/`).

## Desired End State

On a 360 px phone `/cv`:

- never scrolls sideways, even with an unbroken file, company or position name;
- puts each CV's actions under its name (to the right from 640 px);
- has every control at least 40 px tall with a visible `ring` focus;
- strikes through closed applications in muted text, with no opacity;
- on a failed read, shows the shared destructive `Alert` with an "Odśwież" link, and the upload box stays.

After an upload, the page lands on the new CV with a highlight and a confirmation line.

The details view's CV panel uses the same actions and upload box, so it gets the same 40 px controls and focus.

`npm run lint` fails on a literal in `cv.astro`, `CvLibrary.tsx`, `CvPreview.tsx`, `CvFileActions.tsx` or `CvUploadBox.tsx`. `tests/e2e/phone-cv.spec.ts` fails if the phone layout regresses. `/dev/ui` shows the library in all 7 states. CLAUDE.md names the new pieces.

Verify:
- `npm run lint && npm test && npx astro check && npm run build`
- `npm run smoke` and `npx playwright test` against the local stack
- before/after screenshots at 1280 and 360 px in `context/changes/phone-friendly-cv-library/screenshots/`

### Key Discoveries:

- `button.tsx:24-31`: only `lg` (`h-10`) reaches 40 px. The repo adds `min-h-10` to `h-auto` controls instead.
- `cv-render.ts:12`: the PDF renderer reads `container.clientWidth` once at start and falls back to 600. Hiding the preview container while it is still empty would make that read 0.
- `CvPreview.tsx:87,101-106`: the empty white container shows under "Wczytywanie podglądu…" because it is only hidden on error.
- `phone-list.spec.ts:13-22,55-99`: own-data filtering, `Promise.allSettled` cleanup and the overflow/height assertions to mirror.
- `src/pages/api/applications/[id]/cv.ts`: `POST` with `cv_file_id` attaches a library CV to an application. This is how the spec gets a usage row.
- `scripts/smoke.mjs:177`: a CV body of `%PDF-1.4 …` is accepted by the upload checks, so a fixed text fixture works.
- Content dedup per user (`(user_id, sha256)` unique): re-uploading the same bytes returns the stored row (200, `reused`) and keeps its first name.

## What We're NOT Doing

- **Download/open failures shown as raw JSON (C4a).** Deferred to S-12 (audit-findings-closed). The `/api/cv/[id]` route is unchanged.
- **Latent `if (supabase)` silent-empty path in `cv.astro` and `dashboard.astro` (C4d).** Deferred to S-12.
- **Renderer choice and docx-preview options.** That includes the narrow DOCX column on a phone. All of `cv-render.ts` and the dispatch at `CvPreview.tsx:61-77` belong to S-09 (cv-preview-by-type). Only class edits inside `CvPreview.tsx:86-106` happen here.
- **The upload request logic** (`checkCvFile` → `apiRequest("/api/cv")` → `reused`). It stays in each island because S-10 changes reuse detection. Only the upload box's markup is shared.
- **Topbar** (20 px links, `break-all`, desktop width). Already deferred by S-06 (F8 → S-07/S-12).
- **Other screens.** The add/edit form (S-07) and any change to `/dashboard`.
- **Deleting CVs**, including in tests (no cleanup helper for `cv_files`).
- **A CI pixel baseline** (`toHaveScreenshot`). The gate is `/dev/ui` plus PNGs, as in S-06.
- **New dependencies.**

## Implementation Approach

The `/10x-ui` order:

1. **Shared pieces and token values.** The `paper` token and the two shared components, adopted by the on-contract `CvPanel` first, so the details view proves them.
2. **The one view.** `/cv` on tokens, on the shared pieces and on the phone layout, behind a new 360 px spec.
3. **The two behaviour fixes.**
4. **States, visual gate and rule.**

Each phase keeps the smoke and E2E markup contracts and can deploy alone. No migration.

## Critical Implementation Details

- **Preview container while loading.** Hide the empty bar with a padding/visibility change that keeps the container's width, for example `empty:p-0` on the paper surface. Do not use `hidden` or `display:none`: `renderPdf` measures `clientWidth` once at start (`cv-render.ts:12`), and a hidden container would render the PDF bitmap at the 600 px fallback.
- **Anchor after upload.** A hash change alone does not reload. Set the hash with `history.replaceState`, then call `location.reload()`. The browser keeps the hash and scrolls to the SSR-rendered `id="cv-<id>"`, and `:target` applies the highlight. The confirmation is read from the hash in an effect after hydration, not during render, so there is no hydration mismatch. After reading it, drop the hash with `replaceState`, so a manual refresh does not repeat the message. `:target` is not re-evaluated by `replaceState`, so the highlight stays until the next navigation.
- **Smoke contract.** Keep `data-usage-count` on the usage toggle. Keep the applications (with ids) in the island's props. Do not render the collapsed usage list server-side in a way that drops the ids.

## Phase 1: Paper token and shared CV pieces

### Overview

Name the document surface as a token. Build `CvFileActions` and `CvUploadBox` on the contract with 40 px controls, and adopt both in `CvPanel` (details view). `CvPreview`'s classes move to tokens. Charges C1 (preview part), C2, C5 (paper, loading bar).

### Changes Required:

#### 1. Paper token

**File**: `src/styles/global.css`

**Intent**: Add a role for "a document drawn for white paper" so the preview stops being a literal. The pdf.js canvas and docx-preview's own `color: black` assume a white page.

**Contract**:
- Add `--paper` (white) and `--paper-foreground` (black) in `:root`, each with a one-line role comment.
- Publish them as `--color-paper` / `--color-paper-foreground` in `@theme inline`, giving the classes `bg-paper` / `text-paper-foreground`.
- Note in the comment that they are for rendered documents only, never UI surfaces.

#### 2. Token record

**File**: `context/changes/phone-friendly-cv-library/tokens.md` (new)

**Intent**: Deposit the new values and the literals they replace, as the earlier `tokens.md` did, so the next session does not reinvent them.

**Contract**: A table of `--paper`/`--paper-foreground` → value → replaced literal (`bg-white`, `text-black` at `CvPreview.tsx:103`), plus the literal → token mapping used in this change (research C1).

#### 3. CvPreview on tokens

**File**: `src/components/applications/CvPreview.tsx`

**Intent**: Class-only edits in the render block (`:86-106`).
- The loading line becomes `text-muted-foreground`.
- The container becomes `bg-paper text-paper-foreground`.
- The empty container no longer shows as a white bar while loading.

The effect, the dispatch and the test ids stay untouched.

**Contract**:
- `data-testid="cv-preview"` and `"cv-preview-error"` are kept.
- `max-h-[75vh]` is allowed by the lint (not px/rem) and stays.
- No change above line 85.

#### 4. Shared actions + preview

**File**: `src/components/applications/CvFileActions.tsx` (new)

**Intent**: One component for "file info + Podgląd/Ukryj podgląd + Pobierz + lazy preview in ErrorBoundary/Suspense", lifted from `CvPanel.tsx:117-153`.
- Controls are at least 40 px tall.
- Focus uses the `Button` ring, and the download is a `Button asChild` link.
- Below 640 px the actions stack under the info; from 640 px they sit to the right (`ApplicationCard.astro:34` pattern).

**Contract**:
- `CvFileActions({ cvId, mimeType, children })`. `children` is the file-info block, wrapped in `min-w-0`. The component owns the preview toggle state.
- The hide label is "Ukryj podgląd" in both views.
- Keep `op="cv.preview"`, `entityId`, `PreviewFallback` and `cvFileUrl(id, { download: true })` exactly as today.

#### 5. Shared upload box

**File**: `src/components/applications/CvUploadBox.tsx` (new)

**Intent**: The presentational part of the file upload: label, file input, pending/info/error lines. It is lifted from `CvPanel.tsx:188-210` so both islands render the same markup.
- The picker button and the input are at least 40 px tall.
- Focus uses the `ring` token.

The request logic stays in each island (S-10).

**Contract**:
- `CvUploadBox({ id, label, pending, message, error, onFile })`.
- `error` is a `ClientMessage` rendered with `ErrorText` in `role="alert" text-destructive`.
- The info line is `role="status"`.
- The input is disabled while `pending`.
- The ids passed in keep `cv-library-upload` for the library.

#### 6. CvPanel adopts both

**File**: `src/components/applications/CvPanel.tsx`

**Intent**: Replace the inline actions/preview block and the inline upload markup with `CvFileActions` and `CvUploadBox`, so the details view proves the shared pieces before `/cv` uses them. The file name moves from `break-words` to `min-w-0 wrap-anywhere`.

**Contract**:
- The attach/upload behaviour and the wrapper busy state (`pointer-events-none opacity-60`, `:159`) are unchanged.
- The visible texts are unchanged except "Ukryj podgląd", which is already the panel's label.

#### 7. Lint guard

**File**: `scripts/check-ui-literals.mjs`

**Intent**: Guard the shared pieces from now on (S-06 F7: shared files go in too).

**Contract**: Add `src/components/applications/CvPreview.tsx`, `CvFileActions.tsx` and `CvUploadBox.tsx` to `CLEAN_VIEWS`. Remove the duplicate `StatusControl.tsx` entry while there.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes, with the three new entries in `CLEAN_VIEWS`
- `npm test` and `npx astro check` pass
- The hardcoded-value scan on `CvPreview.tsx`, `CvFileActions.tsx`, `CvUploadBox.tsx` and `CvPanel.tsx` returns 0 lines
- `npm run build` succeeds, and `npm run smoke` passes against the local stack

#### Manual Verification:

- On the details view at 360 px, "Podgląd", "Pobierz" and the file picker are at least 40 px tall, and keyboard focus shows the ring on each
- Opening a PDF preview shows the document on white with no empty white bar under "Wczytywanie podglądu…", and the page fits the width
- Before/after screenshots of the details view's CV panel at 1280 and 360 px are saved in `screenshots/`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: /cv on the contract and on the phone

### Overview

The view itself: tokens, the shared pieces, the list card pattern, and a 360 px spec. Charges C1 (view part) and C3.

### Changes Required:

#### 1. Page

**File**: `src/pages/cv.astro`

**Intent**: Use `text-foreground` on the content column (as `dashboard.astro:49`) and the shared destructive `Alert` for the load error (as `dashboard.astro:57-61`).

**Contract**:
- The heading "Biblioteka CV" (h1) is kept.
- The paused redirect, `logError` and status 500 are unchanged.

#### 2. Island

**File**: `src/components/applications/CvLibrary.tsx`

**Intent**:
- `CvItem` uses the list card surface (`border-border bg-muted`, `ApplicationCard.astro:21`) and wraps its header in `CvFileActions`. The file name uses `text-link` for the icon and `min-w-0 wrap-anywhere`; size and date use `text-muted-foreground`.
- The usage toggle is at least 40 px tall with ring focus.
- Each usage row stacks below 640 px, with `wrap-anywhere` on company and position. Each application link is at least 40 px tall with ring focus. Closed applications are `text-muted-foreground line-through` with no opacity.
- The empty state copies `dashboard.astro:64`.
- `UploadToLibrary` renders `CvUploadBox`.
- `CvItem` is exported for `/dev/ui`, with an optional `initialListOpen` prop (default `false`).

**Contract**:
- Kept: `data-cv-id`, `data-testid="cv-library"`, `data-testid="cv-usage"` and `data-usage-count` on the toggle, `aria-expanded`, and the `CvLibraryEntry` props (including application ids).
- New: each item gets `id={"cv-" + file.id}`.

#### 3. Lint guard

**File**: `scripts/check-ui-literals.mjs`

**Intent**: The view is clean, so guard it.

**Contract**: Add `src/pages/cv.astro` and `src/components/applications/CvLibrary.tsx` to `CLEAN_VIEWS`.

#### 4. Phone spec

**File**: `tests/e2e/phone-cv.spec.ts` (new)

**Intent**: Prove the phone layout on the test's own data, mirroring `phone-list.spec.ts`.

**Contract**:
- Viewport 360×740.
- **Fixture.** Upload one fixed fixture through `POST /api/cv` (with an `Origin` header). Name: `CV_E2E_Bardzodluganazwaplikubezzadnychspacjiwcalejdlugosci.pdf`. Bytes: a constant `%PDF-1.4 …` string.
  - Accept 201 (new) or 200 (`reused`). Dedup keeps at most one such row for the E2E user, so there is no cleanup; a header comment says why.
- **Applications.** Create one application with an unbroken company name and a random tag, and move it to `rejected`. Create a second application that stays open. Attach the CV to both through `POST /api/applications/<id>/cv`. Delete both applications in `afterEach` with `deleteApplication`, using `Promise.allSettled`.
- **On `/cv`, measure only the card `[data-cv-id="<id>"]`:**
  - document `scrollWidth <= clientWidth`;
  - the actions' top is below the file name's bottom;
  - "Podgląd", "Pobierz", the usage toggle and the file input are each at least 40 px tall;
  - after expanding, both own application links are at least 40 px tall and the rejected one has `text-decoration-line: line-through` and no ancestor with opacity < 1;
  - no sideways scroll still holds after expanding.
- **Not opened:** the preview. The fixture is not a renderable PDF, and rendering per type is S-09.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes, with `cv.astro` and `CvLibrary.tsx` in `CLEAN_VIEWS`
- The hardcoded-value scan on `cv.astro` and `CvLibrary.tsx` returns 0 lines
- `npm test`, `npx astro check` and `npm run build` pass
- `npm run smoke` passes (`data-usage-count="1"` and the application id are still in the `/cv` HTML)
- `npx playwright test` passes, including the new `phone-cv.spec.ts`, `seed.spec.ts` and `phone-list.spec.ts`

#### Manual Verification:

- At 360 px, `/cv` with a long file name and an expanded usage list has no sideways scroll, and the actions sit under the name; at 1280 px they sit to the right
- Keyboard Tab through `/cv` shows the ring on the upload input, each "Podgląd"/"Pobierz", the usage toggle and each application link
- Before/after screenshots of `/cv` at 1280 and 360 px are saved in `screenshots/`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Upload confirmation and failed-read state

### Overview

The two decided behaviour fixes (C4b, C4c). Both are visible on a phone, where the list is long and the screen is small.

### Changes Required:

#### 1. Anchor helpers

**File**: `src/lib/domain/cv.ts` (+ `src/lib/domain/cv.test.ts`)

**Intent**: Pure functions for the anchor, so the island stays thin and the rule is tested.

**Contract**:
- `cvAnchorId(id: string): string` returns `cv-<id>`.
- `uploadedCvIdFromHash(hash: string): string | null` accepts only `#cv-<uuid>` (via `isUuid`) and returns null for anything else.
- Tests cover a valid hash, a missing `#`, a non-uuid, an empty string and an extra suffix.

#### 2. Island behaviour

**File**: `src/components/applications/CvLibrary.tsx`

**Intent**:
- **New file stored.** On a successful upload, set the hash to the new CV's anchor and reload (see Critical Implementation Details).
- **On mount.** If the hash names an entry, show `Wgrano plik „<name>”.` as the upload box's info line. If the list could not be read, show `Plik został wgrany, ale nie udało się wczytać listy.`. Then drop the hash. The item is highlighted with `target:` ring-token classes and `scroll-mt-4`.
- **Duplicate (`reused`).** Unchanged: message, no reload.
- **Failed read.** `entries` may be `null`. The island then renders the upload box only: no list, no empty-state text.

**Contract**:
- `CvLibrary({ entries: CvLibraryEntry[] | null })`.
- The confirmation goes through `CvUploadBox`'s `role="status"` line.
- The highlight uses tokens only (`target:ring-2 target:ring-ring`).

#### 3. Page failed-read state

**File**: `src/pages/cv.astro`

**Intent**: On a failed read, keep the destructive `Alert`, add an "Odśwież" link back to `/cv` (`text-link`, ring focus), and still render the island with `entries={null}`, so the upload stays possible.

**Contract**: The status stays 500 and `logError` stays one line. The island renders in both the success and the failure state.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including the new `cvAnchorId` / `uploadedCvIdFromHash` cases
- `npm run lint`, `npx astro check` and `npm run build` pass
- `npm run smoke` and `npx playwright test` pass

#### Manual Verification:

- Uploading a new file on `/cv` (360 px, list longer than the screen) reloads onto the new item, highlighted, with "Wgrano plik „…”." above. A manual refresh afterwards shows no message.
- Uploading an identical file shows the existing "Ten plik jest już w bibliotece…" message without a reload
- With the read forced to fail locally (e.g. a temporary throw in the page's try block, reverted afterwards): the `Alert` with "Odśwież" shows, the upload box is usable, and an upload ends on the "wgrany, ale nie udało się wczytać listy" line

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: States, visual gate and rule

### Overview

The 7-state matrix in the kitchen sink, the screenshot gate, the CLAUDE.md rule and the hand-overs. Charge C5.

### Changes Required:

#### 1. Kitchen sink

**File**: `src/pages/dev/ui.astro`

**Intent**: A "Biblioteka CV (/cv)" section (`id="ks-cv-library"`, with a working anchor, S-06 F5). It renders the real exported pieces statically, with no copied markup (S-06 F1/F3), and shows every optional variant (S-06 F6):
- a CV with a long unbroken name and no usage;
- a CV with usage expanded (`initialListOpen`), including a closed application;
- the empty library (`entries={[]}`);
- the failed read (`Alert` + island with `entries={null}`);
- `CvUploadBox` in the default, pending (disabled), info and error states;
- a link "Pokaż wyróżnienie po wgraniu" to `#cv-<sample id>`, which applies the real `:target` highlight.

The existing preview-loading line (`:373`) uses the same class as `CvPreview`.

**Contract**: 7-state matrix, each cell shown or N/A with a reason:
- **default, disabled, error, empty:** shown.
- **hover / focus-visible:** `data-ks="hover-target"` / `"focus-target"` markers on a "Podgląd" button, the usage toggle and an application link.
- **loading:** the upload pending line and the preview-loading line are shown. The list itself is N/A, because it is server-rendered with no client loading.

#### 2. Screenshots

**File**: `context/changes/phone-friendly-cv-library/screenshots/`

**Intent**: The visual gate, as in S-06: before/after PNGs of `/cv` and `/dev/ui#ks-cv-library` at 1280 and 360 px. Each visual delta is explained in the phase's commit or the review.

**Contract**: The file names say the view, width and before/after.

#### 3. Agent rule

**File**: `CLAUDE.md`

**Intent**: Keep the next agent on the contract for CV UI.
- The UI contract block names the `paper` token as the only surface for rendered documents.
- CV actions and uploads come from `CvFileActions` / `CvUploadBox`; check them before building CV controls.
- `/dev/ui` also shows the CV library.
- The phone rules are guarded for `/cv` by `tests/e2e/phone-cv.spec.ts`.

The `/dev/ui` line in "Pages" mentions the CV library.

**Contract**: Edit the existing "UI contract (design tokens)" and "Pages" paragraphs, outside any `<!-- BEGIN @przeprogramowani/10x-cli -->` block. No new section.

#### 4. Hand-overs

**File**: `context/changes/phone-friendly-cv-library/follow-ups/hand-overs.md` (new)

**Intent**: Record the deferred charges where the owning slices will find them.
- **S-12:** raw JSON on download/open failures (C4a, `src/pages/api/cv/[id].ts:10-31`), and the silent `if (supabase)` path in `cv.astro`/`dashboard.astro` (C4d).
- **S-09:** the narrow DOCX column and the clipped tables (docx-preview margins and `overflow:hidden`; research "Deferred candidates"), and that `CvPreview` now reads `bg-paper`/`text-paper-foreground` and is in `CLEAN_VIEWS`.

**Contract**: Each item has file:line, user effect and target slice.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm test`, `npx astro check` and `npm run build` pass
- The hardcoded-value scan on `cv.astro`, `CvLibrary.tsx`, `CvPreview.tsx`, `CvFileActions.tsx` and `CvUploadBox.tsx` returns 0 lines
- `npx playwright test` and `npm run smoke` pass

#### Manual Verification:

- `/dev/ui#ks-cv-library` shows every cell of the 7-state matrix, or its N/A reason, at 1280 and 360 px, and the highlight link works
- Screenshots of `/cv` and `/dev/ui#ks-cv-library` at both widths are in `screenshots/`, with visual deltas explained
- The CLAUDE.md rule and `follow-ups/hand-overs.md` read correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `cvAnchorId` / `uploadedCvIdFromHash` in `src/lib/domain/cv.test.ts`: valid hash, no `#`, a non-uuid, an empty string and a trailing suffix.

### Integration Tests:

- `tests/e2e/phone-cv.spec.ts` (360 px): no sideways scroll, actions under the name, 40 px controls, the closed application struck through without opacity. Own data only; fixed CV fixture deduplicated by content.
- The existing `seed.spec.ts` (heading), `phone-list.spec.ts` and smoke (`/cv` usage count and application id, sign-in redirect, data isolation) must stay green.

### Manual Testing Steps:

1. At 360 px, open `/cv` with a long-named CV used by an open and a closed application. Expand the usage list and check that nothing scrolls sideways and every control is thumb-sized.
2. Upload a new CV and check that the page lands on it, highlighted, with the confirmation. Upload it again and check for the "już w bibliotece" message.
3. Tab through `/cv` and the details view's CV panel and check that the ring is visible on every control.
4. Open a PDF preview on both screens and check for white paper with no empty bar while loading.

## Performance Considerations

None. The preview stays lazy-loaded, and the reload after upload already exists. The anchor only adds a hash.

## Migration Notes

No database change. Each phase deploys alone; rollback is a `wrangler rollback` of the code.

S-09 must start after this change, because `CvPreview.tsx` render classes change here.

## References

- Research and charges: `context/changes/phone-friendly-cv-library/research.md`
- Previous UI change: `context/archive/2026-10-10-phone-friendly-list/plan.md`, `reviews/impl-review.md` (F1–F8)
- Token record: `context/archive/2026-10-05-fast-details-on-phone/tokens.md`
- Card pattern: `src/components/applications/ApplicationCard.astro:21-58`
- On-contract twin: `src/components/applications/CvPanel.tsx:106-210`
- Phone spec to mirror: `tests/e2e/phone-list.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Paper token and shared CV pieces

#### Automated

- [x] 1.1 `npm run lint` passes, with the three new entries in `CLEAN_VIEWS` — 4db4407
- [x] 1.2 `npm test` and `npx astro check` pass — 4db4407
- [x] 1.3 The hardcoded-value scan on `CvPreview.tsx`, `CvFileActions.tsx`, `CvUploadBox.tsx` and `CvPanel.tsx` returns 0 lines — 4db4407
- [x] 1.4 `npm run build` succeeds, and `npm run smoke` passes against the local stack — 4db4407

#### Manual

- [x] 1.5 On the details view at 360 px, "Podgląd", "Pobierz" and the file picker are at least 40 px tall, and keyboard focus shows the ring on each — 4db4407
- [x] 1.6 Opening a PDF preview shows the document on white with no empty white bar under "Wczytywanie podglądu…", and the page fits the width — 4db4407
- [x] 1.7 Before/after screenshots of the details view's CV panel at 1280 and 360 px are saved in `screenshots/` — 4db4407

### Phase 2: /cv on the contract and on the phone

#### Automated

- [x] 2.1 `npm run lint` passes, with `cv.astro` and `CvLibrary.tsx` in `CLEAN_VIEWS`
- [x] 2.2 The hardcoded-value scan on `cv.astro` and `CvLibrary.tsx` returns 0 lines
- [x] 2.3 `npm test`, `npx astro check` and `npm run build` pass
- [x] 2.4 `npm run smoke` passes (`data-usage-count="1"` and the application id are still in the `/cv` HTML)
- [x] 2.5 `npx playwright test` passes, including the new `phone-cv.spec.ts`, `seed.spec.ts` and `phone-list.spec.ts`

#### Manual

- [x] 2.6 At 360 px, `/cv` with a long file name and an expanded usage list has no sideways scroll, and the actions sit under the name; at 1280 px they sit to the right
- [x] 2.7 Keyboard Tab through `/cv` shows the ring on the upload input, each "Podgląd"/"Pobierz", the usage toggle and each application link
- [x] 2.8 Before/after screenshots of `/cv` at 1280 and 360 px are saved in `screenshots/`

### Phase 3: Upload confirmation and failed-read state

#### Automated

- [ ] 3.1 `npm test` passes, including the new `cvAnchorId` / `uploadedCvIdFromHash` cases
- [ ] 3.2 `npm run lint`, `npx astro check` and `npm run build` pass
- [ ] 3.3 `npm run smoke` and `npx playwright test` pass

#### Manual

- [ ] 3.4 Uploading a new file on `/cv` (360 px, list longer than the screen) reloads onto the new item, highlighted, with "Wgrano plik „…”." above. A manual refresh afterwards shows no message.
- [ ] 3.5 Uploading an identical file shows the existing "Ten plik jest już w bibliotece…" message without a reload
- [ ] 3.6 With the read forced to fail locally (e.g. a temporary throw in the page's try block, reverted afterwards): the `Alert` with "Odśwież" shows, the upload box is usable, and an upload ends on the "wgrany, ale nie udało się wczytać listy" line

### Phase 4: States, visual gate and rule

#### Automated

- [ ] 4.1 `npm run lint`, `npm test`, `npx astro check` and `npm run build` pass
- [ ] 4.2 The hardcoded-value scan on `cv.astro`, `CvLibrary.tsx`, `CvPreview.tsx`, `CvFileActions.tsx` and `CvUploadBox.tsx` returns 0 lines
- [ ] 4.3 `npx playwright test` and `npm run smoke` pass

#### Manual

- [ ] 4.4 `/dev/ui#ks-cv-library` shows every cell of the 7-state matrix, or its N/A reason, at 1280 and 360 px, and the highlight link works
- [ ] 4.5 Screenshots of `/cv` and `/dev/ui#ks-cv-library` at both widths are in `screenshots/`, with visual deltas explained
- [ ] 4.6 The CLAUDE.md rule and `follow-ups/hand-overs.md` read correctly
