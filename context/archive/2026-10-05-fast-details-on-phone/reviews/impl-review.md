<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Application Details on a Phone — UI Contract

- **Plan**: context/changes/fast-details-on-phone/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-05
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Automated criteria re-run 2026-10-05: `npm test` 106 PASS, `npm run lint` PASS (incl. UI contract scan, 8 views, 0 hits), `npx astro check` 0 errors, `npm run build` PASS; production: `/dev/ui` → 404, anonymous `/applications/abc` → 302 `/auth/signin?next=…`. All 23 Progress rows ticked; manual rows confirmed by the owner in-session. Security review: no open redirect found (`safeNextPath` on every sign-in exit; `/%2F%2Fevil.com` and `/.//evil.com` stay same-origin), `next` is escaped in the hidden input, `/dev/ui` renders only `NotFound` in production builds.

## Findings

### F1 — Focus ring below 3:1 on shared components

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ui/button.tsx:8 (also input, textarea, native-select, badge)
- **Detail**: shadcn components use `focus-visible:ring-ring/50` (purple-400 at 50 % over navy ≈ 2.6:1, lower on `bg-muted`), under the 3:1 non-text contrast floor; plain links in `[id]/index.astro` use full `ring-ring`, so focus looks inconsistent. Affects note-kind chips, Edytuj/Usuń, status pill, inputs.
- **Fix**: Use full-strength `ring-ring` (no `/50`) in the shared ui components so every focus ring matches and clears 3:1.
- **Decision**: FIXED

### F2 — Two Radix sources after shadcn add

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ui/badge.tsx:4, label.tsx:3, button.tsx:2, package.json
- **Detail**: New components import from the umbrella `radix-ui` package while `button.tsx` uses `@radix-ui/react-slot`: two Slot implementations and an undocumented runtime dependency (~60 `@radix-ui/*` packages in the lockfile).
- **Fix**: Settle on the umbrella `radix-ui` (what the current shadcn registry generates): switch `button.tsx` to it, remove `@radix-ui/react-slot` if nothing else uses it, and note the dependency in change.md.
- **Decision**: FIXED

### F3 — Selected note-kind chip differs only by colour

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/applications/NotesPanel.tsx:~96
- **Detail**: Selected vs unselected chips differ by border/background colour only; `aria-checked` helps screen readers, not colour-blind users.
- **Fix**: Add a check icon (and medium weight) to the selected chip.
- **Decision**: FIXED

### F4 — Async errors not announced; field errors not linked

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: StatusControl.tsx, CvPanel.tsx, NotesPanel.tsx (error `<p>` elements, note form fields)
- **Detail**: Errors that appear after an async action have no `role="alert"`; NotesPanel field errors are not tied to their inputs (`aria-invalid`, `aria-describedby`), so the components' `aria-invalid` error styling never shows.
- **Fix**: `role="alert"` on async error messages; `aria-invalid` + `aria-describedby` on note fields with errors.
- **Decision**: FIXED

### F5 — Removed-note metadata contrast

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/applications/NotesPanel.tsx:~193
- **Detail**: `opacity-50` over `text-muted-foreground` drops a removed note's timestamp to ≈ 2.5:1; strike-through already marks it as removed.
- **Fix**: Raise to `opacity-70` (≈ 4:1) and keep the strike-through.
- **Decision**: FIXED

### F6 — Token use not fully consistent in generated components

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ui/badge.tsx (link variant), src/components/ui/native-select.tsx:38,46, tokens.md
- **Detail**: Badge `link` variant still uses `text-primary` (too dark on navy; Button's was moved to `text-link`); NativeSelect options use `bg-[Canvas] text-[CanvasText]` (depends on an ancestor `scheme-dark`) while tokens.md says `--popover` covers native options.
- **Fix**: Badge link → `text-link`; options → `bg-popover text-popover-foreground` (works without `scheme-dark`), keeping tokens.md true.
- **Decision**: FIXED

### F7 — Kitchen sink showcases the forbidden destructive variant

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dev/ui.astro (Button section)
- **Detail**: `/dev/ui` shows `variant="destructive"` without comment, while the new CLAUDE.md rule says not to use it as-is.
- **Fix**: Label that row "nie używać (patrz CLAUDE.md)".
- **Decision**: FIXED

### F8 — `dark:` classes in shadcn files are dead code

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/styles/global.css (`:root, .dark`), src/components/ui/*.tsx
- **Detail**: No element gets `.dark`, so generated `dark:` variants never apply; easy to misread as dark-mode support.
- **Fix**: One line in tokens.md: single dark theme lives in `:root`; `dark:` variants in ui/ are inert by design.
- **Decision**: FIXED
