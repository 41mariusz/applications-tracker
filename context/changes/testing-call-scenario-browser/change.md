---
change_id: testing-call-scenario-browser
title: Test the call scenario in a real browser (phone search, sign-in)
status: implemented
created: 2026-10-05
updated: 2026-10-05
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Call scenario in the browser". Risks covered: #1 (phone search during a call misses the offer because of number format or live in-browser search), #6 (sign-in/routing locks the owner out). Test types planned: unit (phone-format matrix) + e2e (Playwright). Risk response intent: #1 — typing a phone number in a different format than stored (+48 / spaces / dashes / no prefix) shows the right application live in a real browser and opening it shows salary range and quoted rate; #6 — signing in from a protected link works, survives a reload, and lands on the page the user asked for. After creating the folder, follow the downstream continuation rule.
