---
change_id: production-error-visibility
title: Production errors reach the owner
status: new
created: 2026-10-06
updated: 2026-10-06
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

Roadmap F-01 (MS-05). Input: `context/audits/observability/2026-10-06_call-time-read-agreement-writes-cv-upload.md` — fix order 1–6 (central 5xx hook + notifier, Auth/session not as "signed out", client `fetchJson` + error boundary + beacon, right status/context on reads, body parsing inside try). Owner reads no logs, so the notifier is mandatory. Agreement-loss guards (audit W5, W6, W8–W10) are a separate change.
