# Token values — phone-friendly-cv-library

Adds one role to the contract in `src/styles/global.css` (the rest is on record in `context/archive/2026-10-05-fast-details-on-phone/tokens.md`). The CV preview draws a document that assumes a white page: the pdf.js canvas and docx-preview's own `color: black`. Paper is for rendered documents only, never UI surfaces.

## New tokens

| Role                                 | Token (class)                                  | Value                  | Literal(s) it replaces             |
| ------------------------------------ | ---------------------------------------------- | ---------------------- | ---------------------------------- |
| Page a rendered document is drawn on | `--paper` (`bg-paper`)                         | `oklch(1 0 0)` (white) | `bg-white` (`CvPreview.tsx:103`)   |
| Text on that page                    | `--paper-foreground` (`text-paper-foreground`) | `oklch(0 0 0)` (black) | `text-black` (`CvPreview.tsx:103`) |

## Literal → token mapping used in this change (research C1)

| Literal                                 | Token                                                            | Where                                                    |
| --------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| `border-white/10 bg-white/10`           | `border-border bg-muted` (list card, `ApplicationCard.astro:21`) | `CvLibrary.tsx:28`                                       |
| `text-purple-300`                       | `text-link`                                                      | `CvLibrary.tsx:32`                                       |
| `text-blue-100/60`, `text-blue-100/50`  | `text-muted-foreground`                                          | `CvLibrary.tsx:35,68,75,102,104,169`; `CvPreview.tsx:87` |
| `text-blue-100/70`, `text-blue-100/80`  | `text-supporting-foreground`                                     | `CvLibrary.tsx:158,167,170,185`                          |
| `bg-purple-600 hover:bg-purple-500`     | `bg-primary` / `hover:bg-primary/90` through `Button`            | `CvLibrary.tsx:46,167`                                   |
| `border-white/20`                       | `border-input`                                                   | `CvLibrary.tsx:53`                                       |
| `bg-white/5`                            | `bg-card`                                                        | `CvLibrary.tsx:157,185`                                  |
| `text-white`                            | `text-foreground`                                                | `cv.astro:39`                                            |
| `bg-red-500/20 … text-red-200` (banner) | `Alert variant="destructive"` (`text-destructive`)               | `cv.astro:41`                                            |
| `bg-white text-black` (preview surface) | `bg-paper text-paper-foreground`                                 | `CvPreview.tsx:103`                                      |
