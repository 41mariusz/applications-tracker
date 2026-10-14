---
name: team-code-review
description: Review code changes against team engineering conventions, testing standards and security expectations. Use when the user asks to "review code", "check this PR", "review my changes" or for a "team code review" — before opening or merging a pull request.
---

# Team Code Review

Review the user's changes against the team conventions in [references/conventions.md](references/conventions.md). Use that document as the standard; do not invent rules of your own. A preference that the conventions do not cover is at most a Suggestion, and you must label it as such.

## 1. Read the standard

Read `references/conventions.md` fully before looking at the code. Pay attention to the **(adapted)** and **(repo rule)** markers: they take precedence over general best practice.

## 2. Find what changed

Review only the change, not the whole codebase:

- **Diff or PR given:** if the user names a diff, PR, branch or files, review exactly those.
- **No argument:** run `git diff` (unstaged), `git diff --cached` (staged), and, when the branch is ahead of its base, `git diff <base>...HEAD`. Review their union.
- **Context:** read the surrounding code of each changed hunk when needed to judge it (callers, the module's existing patterns). Findings must still point at changed lines.
- **Nothing changed:** say so and stop.

## 3. Check each category

Go through the changed code once per category from the conventions:

1. **Naming**: identifiers, files, constants, language of code vs. UI text.
2. **Error handling**:
   - async without handling;
   - empty or bindingless catch;
   - errors that leave no signal (no `logError` / `failureResponse`, a 200 on a failed read);
   - PII in messages.
3. **TypeScript**:
   - `any` without a reason;
   - untyped external data, or no zod at a boundary;
   - optional fields where a union is needed;
   - shared types outside `src/types.ts`.
4. **Function design**:
   - mixed responsibilities;
   - more than 3 parameters;
   - impure queries;
   - business rules outside `src/lib/domain/`;
   - Supabase calls outside `src/lib/services/`.
5. **Security**:
   - secrets in code;
   - the service-role key in app code;
   - unvalidated input;
   - SQL built from strings;
   - a missing `locals.user` check;
   - a new table without RLS;
   - delete policies;
   - open redirects;
   - leaked stack traces.
6. **Testing**:
   - risky logic without tests;
   - vague assertions;
   - missing edge and error cases;
   - smoke or E2E not extended for a user-facing change;
   - non-additive migrations.

Also apply the **UI** section when the change touches views or components.

## 4. Rate severity

- **Critical**: a bug, data loss, a security hole, a broken guarantee ("nothing is deleted", "every change leaves a trace"), a migration that breaks the previous code version, or an error that disappears without a signal.
- **Warning**: a convention violation that will cost later: missing tests for risky code, rules in the wrong layer, `any`, a vague error message.
- **Suggestion**: naming, readability, small simplifications, and preferences the conventions do not cover (label those as preferences).

Do not report formatting that Prettier or ESLint already enforce.

## 5. Report

Use this format, with no findings section left out. Write "none" when a severity has no findings.

```
## Team code review

**Scope:** <what was reviewed — files / diff range>

### Critical
- `path/to/file.ts:42` — <what is wrong> · Convention: <section> · Fix: <one line>

### Warning
- `path/to/file.ts:88` — …

### Suggestion
- `path/to/file.ts:12` — …

**Recommendation:** APPROVE | REQUEST CHANGES | NEEDS DISCUSSION
<one sentence why>
```

- Give every finding a `file:line` reference whenever the line is known; otherwise name the file.
- **Recommendation:**
  - `REQUEST CHANGES` if there is any Critical finding;
  - `NEEDS DISCUSSION` when a finding depends on a product or architecture decision you cannot make;
  - `APPROVE` otherwise. Warnings may remain, but name the ones to fix soon.
- Do not edit files during the review. If the user asks for fixes afterwards, fix only the findings they choose.
