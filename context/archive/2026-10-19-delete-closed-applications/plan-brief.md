# Delete Crossed-out Applications — Plan Brief

> Full plan: `context/changes/delete-closed-applications/plan.md`

## What & Why

The certification asks for CRUD, and the app had no real Delete: "removing" meant the status Withdrawn. The owner decided (2026-10-19) that applications stay non-deletable by default, but a crossed-out one (Rejected or Withdrawn) can be deleted permanently. Active applications keep the "no lost agreements" guarantee.

## Key Decisions Made

| Decision            | Choice                                                 | Why                                                          | Source |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------------------ | ------ |
| What can be deleted | Rejected and Withdrawn (`CLOSED_STATUSES`)             | Exactly what the list shows crossed out                      | Owner  |
| What remains        | Nothing; CV files stay in the library                  | A real delete; FR-013 keeps CV files                         | Owner  |
| Guard               | RLS delete policy limited to closed statuses           | Holds even when the API is bypassed; additive migration      | Plan   |
| Where in the UI     | Details page only, `window.confirm` naming the company | Matches the StatusControl pattern; no accidental bulk delete | Plan   |

## Phases at a Glance

| Phase                 | What it delivers                                              | Key risk                                                         |
| --------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1. Database guard     | Delete policy + pgTAP (cascades, refusals, CV kept)           | Policy too broad; pinned by tests                                |
| 2. Rule, service, API | `canDelete`, `deleteApplication`, `DELETE` 204/404/409, smoke | Status changing between read and delete; RLS still refuses (409) |
| 3. UI, E2E, docs      | "Usuń trwale" on crossed-out details, E2E, PRD/CLAUDE.md      | Misleading docs; the hard rule is rewritten in the same change   |

**Prerequisites:** local Supabase running.

**Release:** the owner runs `npx supabase db push` before `git push`.
