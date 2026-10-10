# Hand-overs from S-08 (phone-friendly-cv-library)

Source: `research.md` charge C4 (a, d) and "Deferred candidates"; decided in `plan.md` (out of scope for S-08). Anchors checked against the code on 2026-10-10.

## S-12 (audit-findings-closed)

- **Download/open failures show raw JSON (C4a).**
  - Where: `src/pages/api/cv/[id].ts:10-34` answers JSON on every failure: 401 (`:10-12`), 404 for a malformed id via `routeId` (`src/lib/http.ts:15-18`), 500 without config (`:16-18`), 404 for an unknown file (`:21`), 503/500 via `failureResponse` (`:32-34`). The callers are plain navigations: "Pobierz" (`src/components/applications/CvFileActions.tsx:52`), "Otwórz plik w nowej karcie" (`src/components/applications/CvPreview.tsx:93`) and "Otwórz plik" in `PreviewFallback` (`src/components/ErrorBoundary.tsx:60-67`).
  - User effect: on a phone with an expired session, a paused project or a removed file, tapping "Pobierz" replaces the app with `{"error":…}`; the back button is the only way out. Shared by `/cv` and the details view.
- **Silent `if (supabase)` path (C4d).**
  - Where: `src/pages/cv.astro:16-36` and `src/pages/dashboard.astro:19-29`. When `Astro.locals.supabase` is null, both pages skip the read and render an empty library / empty list with 200 and no log line.
  - User effect: none today (the middleware already sends protected pages to `/500` when config is missing, `src/middleware.ts:66-79`), but a future change to that guard would show "Biblioteka jest pusta" / "Nie masz jeszcze żadnych aplikacji" instead of an error, with no signal (lessons: "Errors must leave a signal"). Fix: `logError` + 500 in the false branch of both pages.

## S-09 (cv-preview-by-type)

- **Narrow DOCX column and clipped tables on a phone.**
  - Where: options in `src/components/applications/cv-render.ts:31-37` (`ignoreWidth: true`). docx-preview 0.4.1 still turns Word page margins into section padding (`node_modules/docx-preview/dist/docx-preview.mjs:3102-3108`), and `section.docx { overflow: hidden }` (`:3290`) clips wide tables and images.
  - User effect: at 360 px the DOCX text runs in a column of roughly 90 px (estimated from typical 2.5 cm Word margins, not measured), and wide tables or images are cut off with no way to scroll to them. PDF is not affected (fit to width, `cv-render.ts:10-28`).
- **Starting state of `CvPreview` after S-08.**
  - Where: `src/components/applications/CvPreview.tsx:101-108` — the rendered document sits on `bg-paper text-paper-foreground` (tokens `--paper` / `--paper-foreground`, `src/styles/global.css:49-51`, rendered documents only), and drops its padding while empty (`empty:p-0`) instead of being hidden, because `renderPdf` measures its width once. `CvPreview.tsx` is in `CLEAN_VIEWS` (`scripts/check-ui-literals.mjs:19`).
  - User effect: none; this is the baseline. S-09 must start from it: keep the paper tokens (no `bg-white` / `text-black` back, `npm run lint` fails on them) and keep the container visible during loading.
