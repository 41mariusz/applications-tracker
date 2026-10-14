# Mom Test Validation Plan

Course lesson M5L1 (`/10x-mom-test`), 2026-10-14. Docs are in English (repo rule); the interview and survey questions are in Polish because the people to ask are Polish-speaking job seekers.

## Input Idea

The idea is a **follow-up rule** for Applications Tracker. An application that has waited for the company's move longer than N days, with no contact, is marked "wymaga kontaktu" (needs contact). This is option (a) in `context/foundation/shape-notes.md:51`, deferred when the core rule became "allowed status transitions + history". It conflicts with the PRD non-goal "No reminders or notifications" (`context/foundation/prd.md:138`). The idea is therefore a candidate for a later PRD change, not a planned feature.

## Hypotheses

- **User/role:**
  - The owner, who is a job seeker.
  - By extension, other people running several applications at once, especially IT contractors who talk to agencies and recruiters.
- **Friction:**
  - Applications go quiet, and the job seeker forgets which ones to chase.
  - They follow up too late, or not at all.
  - Or they chase the same company twice.
- **Current workaround (assumed):**
  - memory;
  - searching the mailbox and LinkedIn;
  - a spreadsheet with dates;
  - calendar reminders.
  - Inside the app today: the "waiting for a response" filter (`/dashboard?status=sent,hr_contact,interviews`, `prd.md:41`) and the list ordering by importance and activity.
- **Proposed solution:** a per-row "wymaga kontaktu" marker after N days without activity, with no e-mail or push notifications.
- **Risky assumptions:**
  1. People actually _do_ follow up. Many never chase, so a marker would solve a non-problem.
  2. Forgetting is the bottleneck. It may instead be not knowing _whether_ chasing is appropriate, which is an essential and social constraint, not an accidental one.
  3. One N fits all. Agencies, direct employers and interview stages may need different waits.
  4. The existing filter and ordering are not already enough.
  5. A marker in an app you must open beats a calendar reminder that comes to you.
- **Evidence already present:**
  - **Weak.** The owner listed it as a candidate rule while shaping (`shape-notes.md:51`, threshold left open, `:57`).
  - There is no usage data yet: production holds only `[TEST]` data until the switch to real data.
  - No interviews have been done. The PRD's "waiting for a response" criterion (`prd.md:40`) shows the need to _see_ waiting applications. It does not show a need to be _told when to chase_.

## Critique

- **Solution vs. problem.** "A marker after N days" is a solution. The problem to verify is that people miss follow-ups they intended to make, and that this costs them something: a lost lead, or an awkward double contact.
- **Future intent vs. past behaviour.** "I'd like to be reminded" is future intent, and worthless. Ask instead when they last chased an application, how they knew it was time, and what happened.
- **What would kill it:**
  - Most people say they never chase.
  - Or they chase on a fixed habit (for example, Friday e-mail review) that already works.
  - Or silence is the answer (essential friction: a reminder cannot change the company's move).
- **Good-enough alternatives:**
  - a calendar reminder set when applying;
  - Gmail "snooze" / "nudges";
  - LinkedIn's application tracker;
  - a spreadsheet column "follow-up on".
  - For the owner alone: the existing waiting filter sorted by last activity may already answer "who went quiet".
- **Strong evidence to proceed:** repeated, unprompted stories of a _missed_ or _late_ follow-up with a concrete cost, from people who track 5+ applications at a time, _and_ the owner's own app data later showing waiting applications untouched for long stretches.

## Interview Guide

Plan 20–30 minutes with 3–5 people who are job hunting now or were in the last 6 months. Good places to find them: fellow 10xDevs participants, former colleagues, contractors between contracts. Do not mention the app or the marker until the closing ask.

1. **Kontekst:** Ile procesów rekrutacyjnych prowadziłeś równolegle w ostatnim szukaniu pracy? Przez jakie kanały: agencje, bezpośrednio, LinkedIn?
2. **Ostatnia historia:** Opowiedz o ostatniej sytuacji, w której firma przestała się odzywać po wysłaniu CV albo po rozmowie. Co się działo potem?
   - _Follow-up:_ Po ilu dniach to zauważyłeś? Jak to zauważyłeś?
3. **Ostatni follow-up:** Kiedy ostatnio sam odezwałeś się do firmy albo rekrutera, żeby dopytać o status? Co skłoniło Cię do tego właśnie wtedy?
4. **Obecne obejście:** Skąd wiesz, do kogo i kiedy się odezwać? Pokaż albo opisz, gdzie to trzymasz: pamięć, mail, arkusz, kalendarz, notatki.
   - _Follow-up:_ Ile czasu w tygodniu zajmuje Ci sprawdzanie, co się dzieje z procesami?
5. **Koszt:** Czy zdarzyło Ci się odezwać za późno, w ogóle zapomnieć albo napisać do kogoś dwa razy? Co z tego wynikło?
   - _Follow-up:_ Czy przez to straciłeś jakąś ofertę albo rozmowę? Skąd wiesz?
6. **Ograniczenia:** Czy są firmy albo etapy, w których świadomie _nie_ dopytujesz? Dlaczego?
   - Ten punkt sprawdza, czy tarcie jest istotne, czyli wynika z norm społecznych, a nie z zapominania.
7. **Alternatywy:** Czego próbowałeś, żeby to ogarnąć: przypomnienia w kalendarzu, „odłóż” w Gmailu, tracker LinkedIn, arkusz? Co z tego zostało, a co porzuciłeś i dlaczego?
8. **Rytm:** Jak często przeglądasz wszystkie swoje procesy naraz? Kiedy robiłeś to ostatnio?
9. **Sygnał decyzji:** Co musiałoby się stać, żebyś zmienił obecny sposób? Kiedy ostatnio coś zmieniłeś w tym, jak śledzisz rekrutacje?
10. **Prośba na koniec:** Czy mogę zobaczyć (zanonimizowany) arkusz albo notatki, w których to śledzisz? Czy mogę wrócić z jednym pytaniem za tydzień?

Owner self-check, to run alongside the interviews. Once real applications are in the app (after the `[TEST]` wipe), look back after 2–3 weeks: how many applications in Sent / HR contact / Interviews had no activity for 7+ days, and how many of those did you actually chase?

## Survey

This is for a course channel or a job-seekers' group. Keep it under 3 minutes.

1. **Screener:** Czy w ciągu ostatnich 6 miesięcy aktywnie szukałeś pracy lub kontraktu IT? _(tak / nie: przy „nie” zakończ ankietę)_
2. W ilu procesach rekrutacyjnych brałeś udział równolegle w szczytowym momencie? _(1–2 / 3–5 / 6–10 / ponad 10)_
3. Jak często po wysłaniu CV lub po rozmowie sam odzywałeś się z pytaniem o status? _(nigdy / rzadko / w mniej więcej połowie przypadków / prawie zawsze)_
4. Skąd wiedziałeś, kiedy się odezwać? _(z pamięci / ustawiam przypomnienie w kalendarzu / funkcje skrzynki mailowej / arkusz lub notatki / narzędzie, jakie: ___ / nie odzywam się)_
5. W ostatnim szukaniu pracy: ile razy odezwałeś się za późno albo zapomniałeś, choć chciałeś? _(ani razu / 1–2 / 3–5 / ponad 5 / nie wiem)_
6. Ile czasu tygodniowo zajmowało Ci sprawdzanie, na jakim etapie są Twoje procesy? _(poniżej 15 min / 15–60 min / 1–3 h / ponad 3 h)_
7. **Otwarte:** Opisz ostatnią sytuację, w której firma przestała się odzywać. Co zrobiłeś i po ilu dniach?
8. **Otwarte:** Czego próbowałeś, żeby nie gubić follow-upów, i czy to nadal stosujesz?

## Decision Criteria

- **Proceed (PRD update + roadmap slice):**
  - At least 3 of 5 interviewees describe a recent _missed or late_ follow-up with a concrete cost, unprompted.
  - **And** at least 40% of screened survey respondents report 1+ missed follow-ups, with 3+ parallel processes.
  - **And** the owner's own data shows waiting applications untouched for 7+ days that were not chased.
- **Narrow scope:**
  - Pain exists but only for one channel (for example, agencies) or one stage (after interviews).
  - Then try a per-status threshold, or just a "days since last activity" column on the waiting filter, instead of a marker.
- **Do not build yet:**
  - Most people never chase, or say silence _is_ the answer (essential friction).
  - Or misses happen less than once per search.
  - Keep the PRD non-goal.
- **Try existing tool/process first:**
  - Interviewees are satisfied with a calendar reminder set at application time, Gmail nudges or a weekly review habit.
  - For the owner: the existing waiting filter (`/dashboard?status=sent,hr_contact,interviews`) plus a weekly review ritual, measured for 2–3 weeks before writing any code.
