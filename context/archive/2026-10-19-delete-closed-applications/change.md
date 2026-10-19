---
change_id: delete-closed-applications
title: Permanent delete of crossed-out (Rejected/Withdrawn) applications
status: archived
created: 2026-10-19
updated: 2026-10-19
archived_at: 2026-10-19T14:48:13Z
---

## Notes

Owner decision 2026-10-19 (certification CRUD "D"): applications stay non-deletable by default; once an application is crossed out (status Rejected or Withdrawn) the owner can delete it permanently. A deletion removes the application with its notes, note versions, status and field history (existing `on delete cascade`); CV files stay in the library (FR-013). Changes PRD FR-004 and the CLAUDE.md hard rule "Nothing is deleted"; enforced in the database by an RLS delete policy limited to the closed statuses.
