---
project: "Applications Tracker"
context_type: greenfield
created: 2026-09-29
updated: 2026-09-29
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-11-04
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "why the spreadsheet fails"
      decision: "slow to find the right offer; notes from successive calls don't fit; unclear what stage each application is at"
    - topic: "devices"
      decision: "phone and desktop both needed for quick lookup"
    - topic: "auth strategy"
      decision: "email + password"
    - topic: "user model"
      decision: "no self sign-up (revised in Socrates round for FR-001); flat, no roles; each account sees only its own data"
    - topic: "application edit history"
      decision: "every edit to an application leaves a trace in a change log (from Socrates round for FR-003)"
    - topic: "status list"
      decision: "Sent → HR contact → Interviews → Offer → Accepted; terminal: Rejected, Withdrawn"
    - topic: "allowed transitions"
      decision: "forward (skipping allowed); any active → Rejected/Withdrawn; terminal can be reverted only with confirmation, logged"
    - topic: "list ordering"
      decision: "by stage (Accepted, Offer, Interviews, HR contact, Sent), then most recent activity first; Rejected/Withdrawn crossed out at the bottom"
    - topic: "MVP timeline"
      decision: "3 weeks after-hours; user confirmed the first flow fits"
    - topic: "notes model"
      decision: "single dated timeline of notes per application, each with a type (comment / phone call)"
  frs_drafted: 12
  quality_check_status: accepted
---

# Shape Notes

## Seed idea (verbatim)

Pomysł (moje decyzje): Aplikacja dla jednej osoby (mnie) do śledzenia własnych aplikacji o pracę — „ATS dla kandydata". Nowy projekt. Dodaję aplikacje (firma, stanowisko, link, stawka/widełki), zmieniam ich status, dopisuję komentarze i ustalenia z rozmów telefonicznych. Dostęp po zalogowaniu.

Propozycje do sprawdzenia (jeszcze niezatwierdzone):

- Reguła biznesowa: jedna z trzech: (a) follow-up: aplikacja bez odpowiedzi od X dni oznaczana „wymaga kontaktu"; (b) dozwolone przejścia statusów + historia zmian; (c) ocena ofert względem moich oczekiwań.
- Komentarze i ustalenia z rozmów jako jedna encja „notatka" z typem.
- Pierwszy działający przepływ: logowanie → dodanie aplikacji → zmiana statusu.
- Poza pierwszą wersją: import ogłoszeń, integracja z pocztą, dopasowanie CV przez AI, synchronizacja z kalendarzem.
- Test z perspektywy użytkownika dla głównego przepływu.

Otwarte pytania: którą regułę wybrać jako rdzeń; lista statusów; próg dni dla follow-upu (jeśli (a)).

## Vision & Problem Statement

A candidate applying to many job postings at once runs parallel recruitment processes, each with a different rate and different agreements. When HR calls unexpectedly, the candidate must instantly know which offer the call is about, what rate they quoted, and what was already agreed. Today this lives in a spreadsheet: finding the right offer is slow, notes from successive calls don't fit, and it's hard to tell which stage each application is at.

Insight: a spreadsheet stores the data but doesn't quickly answer "what do I know about this company?" in the middle of a call — on either the phone or the computer.

## User & Persona

Primary persona: the author themself — a single candidate running many recruitment processes in parallel. Reaches for the product at the moment an unexpected HR call comes in (lookup), and after each call or application (recording). Uses both phone and desktop.

Scale note: at 100x the data (hundreds of active processes) the user judges stage + recent-activity ordering still sufficient.

Scope flexibility: the user is willing to cut requirements if the scope turns out too large for the 2026-11-04 deadline.

## Access Control

- Sign-in with email + password.
- No self sign-up: accounts are provisioned by the owner (revised during the Socrates round for FR-001). Flat user model, no roles.
- Each user sees and edits only their own applications and notes; no sharing between accounts.
- An unauthenticated visitor sees only the sign-in screen; any other route redirects to sign-in.

## MVP first flow

1. User signs in.
2. Right after applying to a posting, user adds the application: link to the posting, company, position, salary range from the posting (+ other fields — see FR-002).
3. Later, HR calls unexpectedly → user searches for the application (by company / position).
4. User opens its details: salary range, previous agreements, current status.
5. User appends what was agreed during the call.
6. User changes the application's status.

Value appears at step 2 (single place for all data); steps 3–4 solve the core pain (the unexpected call).

## Success Criteria

### Primary

- During an unexpected HR call, the user finds the right application and sees its salary range and agreements in < 10 seconds, on both phone and desktop.

### Secondary

- The user sees at a glance which applications are waiting for a response, without opening each one.

### Guardrails

- Privacy: rates and agreements are visible only to the account owner.
- No lost agreements: a saved note never disappears, including after a status change.
- Phone usability: search and reading details work one-handed on a small screen.

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
- FR-008: User can filter the application list by status. Priority: nice-to-have
  > Socrates: Counter-argument considered: "duplicates importance ordering — if important applications are already on top, a filter may be unnecessary in the MVP." Resolution: accepted; demoted to nice-to-have.

### Notes & status

- FR-009: User can add a dated note to an application, typed as comment or phone call; the date defaults to now and can be changed. Priority: must-have
  > Socrates: Counter-argument considered: "writing during a call is hard — notes are usually added afterwards, e.g., for yesterday's call." Resolution: accepted; editable note date, defaulting to now.
- FR-010: User can edit a note, and remove it after confirming; both leave a trace — edits go to the change log, a removed note stays visible as crossed out. Priority: must-have
  > Socrates: Counter-argument considered: "note edits/deletes must also leave a trace, consistent with FR-003/FR-004." Resolution: accepted.
- FR-011: User can change an application's status, limited to allowed transitions. Priority: must-have
  > Socrates: Counter-argument considered: "arbitrary status changes corrupt data — e.g., 'rejected' back to 'sent' by mistake." Resolution: accepted; allowed transitions to be defined in Business Logic (phase 5).
- FR-012: User can view an application's change log: which field changed, from what value to what value, and when. When changing the quoted rate, user can optionally attach a note explaining why. Priority: must-have
  > Socrates: Counter-argument considered: "a rate change without context (why?) says little — the change log can't replace notes about negotiation." Resolution: accepted; optional note attached to a quoted-rate change.

## User Stories

### US-01: Candidate checks an offer during an unexpected HR call

- **Given** a signed-in user with several saved applications
- **When** they answer an HR call and type the company name, the recruiter's name, or the phone number into search
- **Then** within 10 seconds they see the right application's details: salary range, the rate they quoted, status, and the notes timeline, and can immediately add a "phone call" note and change the status

## Business Logic

The application orders the user's recruitment processes by stage and, within a stage, by most recent activity, while allowing status changes only forward or to a closed state and recording every change.

**Statuses.** Active: Sent → HR contact → Interviews → Offer. Terminal: Accepted, Rejected (the company declined), Withdrawn (the user resigned — this is also how an application is "removed", see FR-004).

**Transitions.** Forward moves are allowed, including skipping stages (e.g., Sent → Interviews when HR invites straight away). From any active status the user can move to Rejected or Withdrawn. A terminal status can be reverted only after explicit confirmation (e.g., a company comes back after a month), and the revert is recorded in the change log. Any other move (e.g., Offer → Sent) is refused.

**Ordering.** Inputs: each application's status and the date of its most recent activity (latest note or status change). Output: the application list the user sees on opening the app — Accepted on top (until the user starts a new job), then Offer, Interviews, HR contact, Sent; within a stage, the most recently active first. Rejected and Withdrawn sit at the bottom, crossed out.

## Non-Functional Requirements

- Search results appear in < 1 second from typing the query, with several hundred applications stored — so the < 10 s primary success criterion holds during a call.
- Rates, agreements, and all other application data are never accessible without signing in, and never travel over the network unencrypted.
- Every MVP capability is usable on a phone screen 360 px wide without horizontal scrolling, on the latest versions of the mainstream phone and desktop browsers.
- No saved information is lost: a saved note, field change, or status change is durable and visible after signing in again on a different device.

## Non-Goals

- No posting import or integrations (email, calendar) — all data is entered manually; keeps the MVP free of external dependencies.
- No AI features (CV matching, suggestions) — the domain rule works without AI; may be revisited in a later version.
- No reminders or notifications (email / push) — importance is expressed only through list ordering.
- No offline mode and no native app — requires an internet connection; runs in the browser on phone and desktop.
- No self sign-up — a single account provisioned by the owner (FR-001).
- Filtering the list by status (FR-008) is nice-to-have, outside the MVP — importance ordering covers the need.

## Open Questions

1. **How is the owner's account provisioned without self sign-up?** — Resolved 2026-09-29: created once, outside the app, no sign-up screen; mechanism decided during implementation planning.
2. **Contingency cut order** — Resolved 2026-09-29: see prd.md Open Questions 2.
