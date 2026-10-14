## Team rules (@41mariusz/ai-toolkit)

- Before opening or merging a pull request, run the `team-code-review` skill ("review my changes") and resolve its Critical findings.
- The review standard is `.claude/skills/team-code-review/references/conventions.md`; follow it while writing code, not only when reviewing.
- **Errors leave a signal:**
  - never write an empty catch;
  - never answer a failed read with 200 or an empty list;
  - log with the operation and entity id.
- **Validate at boundaries:** use zod for request bodies and external data, and type unknown data as `unknown` until it is checked.
- **No secrets in code and no personal data in logs:** user id only, no e-mail, no query string, no form values.
- **Tests proportional to risk:** business rules get unit tests, user-facing changes extend the end-to-end checks, and migrations stay additive.
- This block is managed by `@41mariusz/ai-toolkit`. Edit the package, not this block: local changes are overwritten on the next install.
