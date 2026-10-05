---
project: "Applications Tracker"
version: 1
status: draft
created: 2026-09-29
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-11-04
  after_hours_only: true
---

# Applications Tracker — PRD

## Vision & Problem Statement

A candidate applying to many job postings at once runs parallel recruitment processes, each with a different rate and different agreements. When HR calls unexpectedly, the candidate must instantly know which offer the call is about, what rate they quoted, and what was already agreed. Today this lives in a spreadsheet: finding the right offer is slow, notes from successive calls don't fit, and it's hard to tell which stage each application is at.

Insight: a spreadsheet stores the data but doesn't quickly answer "what do I know about this company?" in the middle of a call — on either the phone or the computer.

Scale note: at 100x the data (hundreds of active processes) the user judges stage + recent-activity ordering still sufficient.

## User & Persona

Primary persona: the author themself — a single candidate running many recruitment processes in parallel. Reaches for the product at the moment an unexpected HR call comes in (lookup), and after each call or application (recording). Uses both phone and desktop.

## Success Criteria

### Primary

- During an unexpected HR call, the user finds the right application and sees its salary range and agreements in < 10 seconds, on both phone and desktop.

### Secondary

- The user sees at a glance which applications are waiting for a response, without opening each one.

### Guardrails

- Privacy: rates and agreements are visible only to the account owner.
- No lost agreements: a saved note never disappears, including after a status change.
- Phone usability: search and reading details work one-handed on a small screen.

## User Stories

### US-01: Candidate checks an offer during an unexpected HR call

- **Given** a signed-in user with several saved applications
- **When** they answer an HR call and type the company name, the recruiter's name, or the phone number into search
- **Then** within 10 seconds they see the right application's details: salary range, the rate they quoted, status, and the notes timeline, and can immediately add a "phone call" note and change the status

## Functional Requirements

### Authentication

- FR-001: User can sign in with email and password. Priority: must-have
  > Socrates: Counter-argument considered: "open sign-up is unnecessary work — only the author uses the app at the start; a single provisioned account means less code and less risk." Resolution: accepted; self sign-up dropped, account provisioned by the owner.

### Applications

- FR-002: User can add an application with: link to the posting, company, position, salary range from the posting, the rate the user quoted, HR contact (name + phone), application date, employment type (B2B / employment contract), work mode (remote / hybrid / on-site). Only company and position are required; all other fields are optional. Priority: must-have
  > Socrates: Counter-arguments considered: "too many required fields make adding slower than in a spreadsheet" and "the HR contact is often unknown at application time — it appears only at the first call." Resolution: accepted both; only company + position required, the rest (incl. HR contact) can be filled in later via FR-003.
- FR-003: User can edit an application; every edit leaves a trace in the application's change log. Priority: must-have
  > Socrates: Counter-argument considered: "editing overwrites the quoted rate without a trace — after negotiation you lose what you said earlier." Resolution (user's words): "musi zostawać ślad w jakimś changelog" — edits must be recorded in a change log; see FR-012.
- FR-004: User can remove an application from active tracking; it is never deleted without a trace — at most it stays on the list crossed out, with an appropriate status. Priority: must-have
  > Socrates: Counter-argument considered: "permanent removal wipes the agreements and the change log, contradicting the 'no lost agreements' guardrail." Resolution (user's words): "nie usuwa bez śladu, co najwyżej jest skreślona na liście z odpowiednim statusem" — nothing is ever permanently removed; removed applications appear crossed out with the Withdrawn status (see Business Logic).

### Lookup

- FR-005: User can search applications by company, position, HR contact name, or HR contact phone. Phone search matches regardless of formatting (spaces, country prefix). When several applications match (e.g., same company, different positions, or an agency recruiting for many clients), results distinguish them by position and application date. Priority: must-have
  > Socrates: Counter-arguments considered: "phone numbers come in different formats (+48 600 100 200 vs 600100200) — search would miss the offer at the key moment" and "one company = several applications." Resolution: accepted both; format-insensitive phone matching and disambiguated results.
- FR-006: User can view an application's details: all fields, current status, and the notes timeline. What is needed during a call — salary range, the quoted rate, status, and the most recent agreement — is visible first, without scrolling, on a phone screen. Priority: must-have
  > Socrates: Counter-argument considered: "all fields + notes timeline + change log on a phone means long scrolling during a call." Resolution: accepted; call-critical information shown first.
- FR-007: User can see a list of all their applications with each one's status, ordered with the most important applications at the top and less important ones at the bottom. Priority: must-have
  > Socrates: Counter-argument considered: "closed processes clutter the list — after a few weeks most entries are rejections." Resolution (user's words): "najważniejsze aplikacje na górze, mniej ważne na dole" — the list is ordered by importance. What makes an application "important" is the domain rule — defined in Business Logic (phase 5).
- FR-008: User can filter the application list by one or more statuses, combined with search. Priority: must-have
  > Socrates: Counter-argument considered: "duplicates importance ordering — if important applications are already on top, a filter may be unnecessary in the MVP." Resolution: accepted; demoted to nice-to-have.
  > Update 2026-10-01: promoted to must-have after hands-on testing with ~300 applications — the user asked for it ("przydałoby się sortowanie po statusach"; clarified as a multi-select status filter).

### Notes & status

- FR-009: User can add a dated note to an application, typed as comment or phone call; the date defaults to now and can be changed. Priority: must-have
  > Socrates: Counter-argument considered: "writing during a call is hard — notes are usually added afterwards, e.g., for yesterday's call." Resolution: accepted; editable note date, defaulting to now.
- FR-010: User can edit a note, and remove it after confirming; both leave a trace — edits go to the change log, a removed note stays visible as crossed out. Priority: must-have
  > Socrates: Counter-argument considered: "note edits/deletes must also leave a trace, consistent with FR-003/FR-004." Resolution: accepted.
- FR-011: User can change an application's status, limited to allowed transitions. Priority: must-have
  > Socrates: Counter-argument considered: "arbitrary status changes corrupt data — e.g., 'rejected' back to 'sent' by mistake." Resolution: accepted; allowed transitions to be defined in Business Logic (phase 5).
- FR-012: User can view an application's change log: which field changed, from what value to what value, and when. When changing the quoted rate, user can optionally attach a note explaining why. Priority: must-have
  > Socrates: Counter-argument considered: "a rate change without context (why?) says little — the change log can't replace notes about negotiation." Resolution: accepted; optional note attached to a quoted-rate change.

### CV

- FR-013: User can attach one CV (PDF or DOCX, up to 5 MB) to an application — uploading a new file or choosing one already in their CV library — preview it in the page (on phones too, without downloading) and download it on demand. Identical files (same content, any file name) are stored only once. Changing the attached CV is recorded in the change log; CV files are never deleted. Priority: must-have
  > Added 2026-10-01 at the user's request ("opcja dołączenia CV do aplikacji … żeby nie duplikowały się CV … szkoda miejsca na dysku"). Decisions: one CV per application, chosen from a personal library; PDF + DOCX up to 5 MB. Update 2026-10-01: "podgląd CV powinien być na poziomie www bez potrzeby ściągania (ale powinna być taka możliwość)" — in-page preview added, download kept. Update 2026-10-01: a CV library page lists each CV and the applications it is attached to (user request).

## Non-Functional Requirements

- Search results appear in < 1 second from typing the query, with several hundred applications stored — so the < 10 s primary success criterion holds during a call.
- Rates, agreements, and all other application data are never accessible without signing in, and never travel over the network unencrypted.
- Every MVP capability is usable on a phone screen 360 px wide without horizontal scrolling, on the latest versions of the mainstream phone and desktop browsers.
- No saved information is lost: a saved note, field change, or status change is durable and visible after signing in again on a different device.

## Business Logic

The application orders the user's recruitment processes by stage and, within a stage, by most recent activity, while allowing status changes only forward or to a closed state and recording every change.

**Statuses.** Active: Sent → HR contact → Interviews → Offer. Terminal: Accepted, Rejected (the company declined), Withdrawn (the user resigned — this is also how an application is "removed", see FR-004).

**Transitions.** Forward moves are allowed, including skipping stages (e.g., Sent → Interviews when HR invites straight away). From any active status the user can move to Rejected or Withdrawn. A terminal status can be reverted — to any other status the user picks, including another terminal one (e.g., Accepted → Withdrawn) — only after explicit confirmation (e.g., a company comes back after a month), and the revert is recorded in the change log. Any other move (e.g., Offer → Sent) is refused.

> Update 2026-10-05: Accepted is reachable as a forward move from any active status (e.g., Sent → Accepted), without confirmation.

**Ordering.** Inputs: each application's status and the date of its most recent activity (latest note or status change). Output: the application list the user sees on opening the app — Accepted on top (until the user starts a new job), then Offer, Interviews, HR contact, Sent; within a stage, the most recently active first. Rejected and Withdrawn sit at the bottom, crossed out.

> Update 2026-10-05: "Most recent activity" is the moment a note or status change is saved. Editing fields, notes or the CV does not change it (a quoted-rate change saved with a note counts, because a note is saved), and removing a note does not lower it. Rejected and Withdrawn interleave by activity, and ties go to the newer application.

## Access Control

- Sign-in with email + password.
- No self sign-up: a single owner account is created once, outside the app (revised during the Socrates round for FR-001; see Open Questions 1). Flat user model, no roles.
- Each user sees and edits only their own applications and notes; no sharing between accounts.
- An unauthenticated visitor sees only the sign-in screen; any other route redirects to sign-in.

## Non-Goals

- No posting import or integrations (email, calendar) — all data is entered manually; keeps the MVP free of external dependencies.
- No AI features (CV matching, suggestions) — the domain rule works without AI; may be revisited in a later version.
- No reminders or notifications (email / push) — importance is expressed only through list ordering.
- No offline mode and no native app — requires an internet connection; runs in the browser on phone and desktop.
- No self sign-up — a single account provisioned by the owner (FR-001).

## Open Questions

Resolved on 2026-09-29:

1. **How is the owner's account provisioned without self sign-up?** — Resolved: the owner's single account is created once, outside the app, with no sign-up screen. The provisioning mechanism is decided during implementation planning.
2. **Which requirements are cut first if the scope turns out too large for the 2026-11-04 deadline?** — Resolved: contingency cut order (applied only if needed, in this order):
   1. Optional note attached to a quoted-rate change (part of FR-012) — the reason can still be recorded as a regular note.
   2. Note edit/remove (FR-010) — notes become add-only; a correction is a new note, so nothing is lost.
   3. Reverting a terminal status — when a company comes back, the user adds a new application.
   4. Change log narrowed to quoted rate and status only, instead of every field (FR-012).

   Never cut: sign-in, adding and editing applications, search (incl. by phone), application details, importance ordering, allowed status transitions.

3. **What are the expected request rate and data volume?** — Resolved: `qps: low`, `data_volume: small` (a single user, several hundred applications).
