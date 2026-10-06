# Sources: documents

- documents: 2 requirements, 10 narrative (+ roadmap), 4 reference, 5 engineering

## Domain documents

| path                                                                                       | kind         | what it is about                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context/foundation/prd.md`                                                                | requirements | product requirements: vision, persona, success criteria, user stories, functional requirements, business logic, access control, non-goals, open questions (with dated updates)                                        |
| `context/foundation/shape-notes.md`                                                        | requirements | discovery notes that preceded the PRD                                                                                                                                                                                 |
| `context/foundation/roadmap.md`                                                            | narrative    | milestone, slices and foundations with outcomes and status                                                                                                                                                            |
| `context/archive/*/` (10 folders: change.md, research.md, plan.md, plan-brief.md, reviews) | narrative    | planned changes 2026-10-04..06: availability after idle, CV upload size, fast details on phone, testing phases (call scenario, status rules, safe migrations, quality gates), E2E guards, production error visibility |
| `CLAUDE.md`                                                                                | reference    | agent instructions: hard rules, architecture, domain and data section, conventions                                                                                                                                    |
| `AGENTS.md`                                                                                | reference    | agent onboarding guide                                                                                                                                                                                                |
| `README.md`                                                                                | reference    | project readme                                                                                                                                                                                                        |
| `context/archive/2026-10-05-fast-details-on-phone/tokens.md`                               | reference    | UI tokens (design, not domain)                                                                                                                                                                                        |
| `context/foundation/test-plan.md`                                                          | engineering  | risk map and test rollout — read for rules only                                                                                                                                                                       |
| `context/foundation/infrastructure.md`                                                     | engineering  | platform, runbook, risk register                                                                                                                                                                                      |
| `context/foundation/tech-stack.md`                                                         | engineering  | stack decision                                                                                                                                                                                                        |
| `context/foundation/test-stack.md`                                                         | engineering  | test tooling                                                                                                                                                                                                          |
| `context/foundation/lessons.md`                                                            | engineering  | team rules                                                                                                                                                                                                            |

Seed/example data with business words: `scripts/demo-data.mjs` (code, excluded from code scope; may be quoted for sample values).

## Product goals

- Vision: "When HR calls unexpectedly, the candidate must instantly know which offer the call is about, what rate they quoted, and what was already agreed." — `context/foundation/prd.md:22`
- Insight: "a spreadsheet stores the data but doesn't quickly answer \"what do I know about this company?\" in the middle of a call" — `context/foundation/prd.md:24`
- Persona: "the author themself — a single candidate running many recruitment processes in parallel." — `context/foundation/prd.md:30`
- Primary success: "During an unexpected HR call, the user finds the right application and sees its salary range and agreements in < 10 seconds, on both phone and desktop." — `context/foundation/prd.md:36`
- Secondary: "The user sees at a glance which applications are waiting for a response, without opening each one." — `context/foundation/prd.md:40`
- Guardrails: privacy (owner only), "No lost agreements: a saved note never disappears, including after a status change.", phone usability — `context/foundation/prd.md:42-46`
- Non-goals: no import/integrations, no AI features, no reminders/notifications, no offline/native app, no self sign-up — `context/foundation/prd.md:128-134`

## Change goals

Each `context/archive/*/change.md` and `plan-brief.md` states the goal of one change (e.g. availability after an idle week, 5 MB CV upload in production, call-critical details on a phone, error visibility). Not used to judge the Core.

## Limitations

- One author, 8 days of history; documents and code were written in the same week, mostly with an AI agent — agreement between them may reflect one shared source rather than independent confirmation.
- The PRD carries dated updates from manual testing (2026-10-01); later changes live only in change folders.
