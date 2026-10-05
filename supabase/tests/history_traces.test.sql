-- History traces: each trace function writes its exact history row, moves last_activity_at
-- only where decided, and shuts another user out.
-- Run with `npx supabase test db` (local Supabase). Everything is rolled back at the end.
-- The whole file is one transaction, so now() is constant: before every activity assertion
-- last_activity_at is set to a fixed past timestamp, then compared with now() (bump) or with
-- that timestamp (no bump).
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- Two users; act as the first one through RLS.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.com');

set local role authenticated;

-- A CV in the second user's library (inserted as that user, under their own folder).
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
insert into public.cv_files (id, sha256, file_name, mime_type, size_bytes, storage_path)
values (
  'cccccccc-0000-0000-0000-000000000003',
  repeat('3', 64),
  'cudze-cv.pdf',
  'application/pdf',
  1000,
  '22222222-2222-2222-2222-222222222222/' || repeat('3', 64) || '.pdf'
);

set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

insert into public.applications (id, company, position, quoted_rate)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme', 'Dev', '22k');

-- Two CVs in the owner's library, stored under <uid>/ as the insert policy requires.
insert into public.cv_files (id, sha256, file_name, mime_type, size_bytes, storage_path) values
  ('cccccccc-0000-0000-0000-000000000001', repeat('1', 64), 'cv-2026.pdf', 'application/pdf', 1000,
   '11111111-1111-1111-1111-111111111111/' || repeat('1', 64) || '.pdf'),
  ('cccccccc-0000-0000-0000-000000000002', repeat('2', 64), 'cv-2026-v2.pdf', 'application/pdf', 1000,
   '11111111-1111-1111-1111-111111111111/' || repeat('2', 64) || '.pdf');

-- change_application_status: from/to as given, is_revert stored as passed, activity bumped.
update public.applications set last_activity_at = '2000-01-01T00:00:00Z' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select ok(
  public.change_application_status('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sent', 'hr_contact', false),
  'status change sent -> hr_contact succeeds'
);
select is(
  (select count(*)::int from public.status_changes
    where from_status = 'sent' and to_status = 'hr_contact' and not is_revert),
  1,
  'status change writes from/to and is_revert = false as passed'
);
select is(
  (select last_activity_at from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  now(),
  'status change bumps last_activity_at'
);
select ok(
  public.change_application_status('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hr_contact', 'rejected', false),
  'status change hr_contact -> rejected succeeds'
);
update public.applications set last_activity_at = '2000-01-01T00:00:00Z' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select ok(
  public.change_application_status('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'rejected', 'hr_contact', true),
  'revert rejected -> hr_contact succeeds'
);
select is(
  (select is_revert from public.status_changes where from_status = 'rejected' and to_status = 'hr_contact'),
  true,
  'revert stores is_revert = true as passed'
);
select is(
  (select last_activity_at from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  now(),
  'revert bumps last_activity_at'
);

-- add_note: inserts the note and bumps activity.
update public.applications set last_activity_at = '2000-01-01T00:00:00Z' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select isnt(
  public.add_note('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'comment', 'Pierwszy kontakt', '2026-10-01T10:00:00Z'),
  null,
  'add_note returns the new note id'
);
select is(
  (select count(*)::int from public.notes
    where application_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and kind = 'comment' and body = 'Pierwszy kontakt' and noted_at = '2026-10-01T10:00:00Z'
      and deleted_at is null),
  1,
  'add_note inserts the note with its kind, body and noted_at'
);
select is(
  (select last_activity_at from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  now(),
  'add_note bumps last_activity_at'
);

-- update_application: no bump without a rate note; bump with one, and the note exists.
update public.applications set last_activity_at = '2000-01-01T00:00:00Z' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select ok(
  public.update_application(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select updated_at from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    '{"company": "Acme", "position": "Dev", "quoted_rate": "22k", "salary_range": "20-25k"}'::jsonb,
    '[{"field": "salary_range", "old_value": null, "new_value": "20-25k"}]'::jsonb,
    null),
  'edit without a rate note succeeds'
);
select is(
  (select last_activity_at from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '2000-01-01T00:00:00Z'::timestamptz,
  'edit without a rate note does not bump last_activity_at'
);
select ok(
  public.update_application(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select updated_at from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    '{"company": "Acme", "position": "Dev", "quoted_rate": "24k", "salary_range": "20-25k"}'::jsonb,
    '[{"field": "quoted_rate", "old_value": "22k", "new_value": "24k"}]'::jsonb,
    'Zmiana stawki: 22k → 24k.'),
  'edit with a rate note succeeds'
);
select is(
  (select last_activity_at from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  now(),
  'edit with a rate note bumps last_activity_at'
);
select is(
  (select count(*)::int from public.notes
    where application_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and kind = 'comment' and body = 'Zmiana stawki: 22k → 24k.'),
  1,
  'edit with a rate note saves the note'
);

-- edit_note: one revision with the previous version, the note holds the new one, no bump.
update public.applications set last_activity_at = '2000-01-01T00:00:00Z' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select ok(
  public.edit_note(
    (select id from public.notes where body = 'Pierwszy kontakt'),
    'phone_call', 'Rozmowa z HR', '2026-10-02T09:00:00Z'),
  'note edit succeeds'
);
select is(
  (select count(*)::int from public.note_revisions
    where note_id = (select id from public.notes where body = 'Rozmowa z HR')),
  1,
  'note edit writes one revision'
);
select results_eq(
  $$ select previous_kind::text, previous_body, previous_noted_at from public.note_revisions
      where note_id = (select id from public.notes where body = 'Rozmowa z HR') $$,
  $$ values ('comment'::text, 'Pierwszy kontakt'::text, '2026-10-01T10:00:00Z'::timestamptz) $$,
  'the revision holds the previous kind, body and noted_at'
);
select results_eq(
  $$ select kind::text, noted_at from public.notes where body = 'Rozmowa z HR' $$,
  $$ values ('phone_call'::text, '2026-10-02T09:00:00Z'::timestamptz) $$,
  'the note holds the new kind, body and noted_at'
);
select is(
  (select last_activity_at from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '2000-01-01T00:00:00Z'::timestamptz,
  'note edit does not bump last_activity_at'
);

-- Note removal (the app's path: a direct update setting deleted_at): body kept, no bump.
update public.applications set last_activity_at = '2000-01-01T00:00:00Z' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select lives_ok(
  $$ update public.notes set deleted_at = now(), updated_at = now()
      where id = (select id from public.notes where body = 'Rozmowa z HR') $$,
  'owner can remove a note'
);
select is(
  (select count(*)::int from public.notes where body = 'Rozmowa z HR' and deleted_at is not null),
  1,
  'removed note keeps its body and is marked deleted_at'
);
select is(
  (select last_activity_at from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '2000-01-01T00:00:00Z'::timestamptz,
  'note removal does not bump last_activity_at'
);
select ok(
  not public.edit_note(
    (select id from public.notes where body = 'Rozmowa z HR'),
    'comment', 'Po usunięciu', now()),
  'a removed note cannot be edited'
);
select is(
  (select count(*)::int from public.note_revisions),
  1,
  'refused edit of a removed note writes no revision'
);

-- set_application_cv: 'cv' trace with old/new file names; same CV is a no-op;
-- unknown or foreign CV is refused; activity is not bumped.
update public.applications set last_activity_at = '2000-01-01T00:00:00Z' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select ok(
  public.set_application_cv('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0000-0000-0000-000000000001'),
  'first CV attach succeeds'
);
select results_eq(
  $$ select old_value, new_value from public.field_changes where field = 'cv' and new_value = 'cv-2026.pdf' $$,
  $$ values (null::text, 'cv-2026.pdf'::text) $$,
  'first CV attach logs field cv with no old name and the new name'
);
select ok(
  public.set_application_cv('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0000-0000-0000-000000000002'),
  'CV replacement succeeds'
);
select results_eq(
  $$ select old_value, new_value from public.field_changes where field = 'cv' and new_value = 'cv-2026-v2.pdf' $$,
  $$ values ('cv-2026.pdf'::text, 'cv-2026-v2.pdf'::text) $$,
  'CV replacement logs both the old and the new name'
);
select ok(
  public.set_application_cv('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0000-0000-0000-000000000002'),
  'attaching the same CV again returns true'
);
select is(
  (select count(*)::int from public.field_changes where field = 'cv'),
  2,
  'attaching the same CV again writes no trace'
);
select ok(
  not public.set_application_cv('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  'an unknown CV id is refused'
);
select ok(
  not public.set_application_cv('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0000-0000-0000-000000000003'),
  'another user''s CV is refused'
);
select is(
  (select count(*)::int from public.field_changes where field = 'cv'),
  2,
  'refused CV attaches write no trace'
);
select is(
  (select cv_file_id from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'cccccccc-0000-0000-0000-000000000002'::uuid,
  'refused CV attaches leave the attached CV untouched'
);
select is(
  (select last_activity_at from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '2000-01-01T00:00:00Z'::timestamptz,
  'CV attach does not bump last_activity_at'
);

-- Another user: the owner's rows are invisible, so the trace functions write nothing.
-- updated_at is now() for the owner's application, so update_application would match if visible.
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select throws_ok(
  $$ select public.add_note('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'comment', 'Cudza notatka', now()) $$,
  '42501',
  null,
  'another user cannot add a note (RLS rejects the insert)'
);
select ok(
  not public.edit_note(
    (select id from public.notes where body = 'Zmiana stawki: 22k → 24k.'), 'comment', 'Cudza edycja', now()),
  'another user cannot edit the owner''s note'
);
select ok(
  not public.update_application(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    now(),
    '{"company": "Overwritten", "position": "Dev"}'::jsonb,
    '[{"field": "company", "old_value": "Acme", "new_value": "Overwritten"}]'::jsonb,
    'Cudza notatka'),
  'another user cannot edit the owner''s application'
);
select ok(
  not public.set_application_cv('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0000-0000-0000-000000000003'),
  'another user cannot attach a CV to the owner''s application'
);
select is((select count(*)::int from public.status_changes), 0, 'another user sees no status_changes');
select is((select count(*)::int from public.field_changes), 0, 'another user sees no field_changes');
select is((select count(*)::int from public.note_revisions), 0, 'another user sees no note_revisions');

-- Back as the owner: the other user's calls left no trace and no change.
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select results_eq(
  $$ select (select count(*)::int from public.status_changes),
            (select count(*)::int from public.field_changes),
            (select count(*)::int from public.note_revisions),
            (select count(*)::int from public.notes) $$,
  $$ values (3, 4, 1, 2) $$,
  'another user''s calls wrote no history rows and no notes'
);
select results_eq(
  $$ select company, quoted_rate, cv_file_id from public.applications
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  $$ values ('Acme'::text, '24k'::text, 'cccccccc-0000-0000-0000-000000000002'::uuid) $$,
  'another user''s calls left the owner''s application unchanged'
);
select is(
  (select body from public.notes where body like 'Zmiana stawki%'),
  'Zmiana stawki: 22k → 24k.',
  'another user''s calls left the owner''s note unchanged'
);

select * from finish();
rollback;
