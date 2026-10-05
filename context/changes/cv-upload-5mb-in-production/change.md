---
change_id: cv-upload-5mb-in-production
title: Verify and fix 5 MB CV upload in production
status: implemented
created: 2026-10-04
updated: 2026-10-05
archived_at: null
---

## Notes

Roadmap S-02 (milestone M-1 "Ready for real use"); risk "CV upload exceeds the free-plan CPU limit" in `context/foundation/infrastructure.md`. Prerequisite in the roadmap: F-01 `production-error-visibility`.

Addendum 2026-10-05: during manual testing the "already in the library" message in `CvPanel` vanished immediately because the page reloaded right after it was set (pre-existing bug, found while testing step 1.4). Fixed in this change at the owner's request: the reload waits 3 s when that message is shown.
