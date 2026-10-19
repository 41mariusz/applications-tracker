-- Permanent delete: only the owner's crossed-out (Rejected/Withdrawn) applications can be deleted;
-- the delete takes notes, note versions, status and field history with it; the CV file stays.
-- Run with `npx supabase test db` (local Supabase). Everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.com');

-- Fixtures inserted as the table owner (RLS does not apply), then the deletes run as users.
insert into public.cv_files (id, user_id, sha256, file_name, mime_type, size_bytes, storage_path) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', repeat('1', 64),
   'cv.pdf', 'application/pdf', 1000, '11111111-1111-1111-1111-111111111111/' || repeat('1', 64) || '.pdf');

insert into public.applications (id, user_id, company, position, status, cv_file_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Withdrawn Co', 'Dev',
   'withdrawn', 'cccccccc-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Rejected Co', 'Dev',
   'rejected', null),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Active Co', 'Dev',
   'sent', null),
  ('aaaaaaaa-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'Other Withdrawn Co', 'Dev',
   'withdrawn', null);

insert into public.notes (id, application_id, user_id, kind, body) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'phone_call', 'Stawka 22k uzgodniona');
insert into public.note_revisions (note_id, user_id, previous_kind, previous_body, previous_noted_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'comment', 'Stawka 20k', now());
insert into public.status_changes (application_id, user_id, from_status, to_status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'sent', 'withdrawn');
insert into public.field_changes (application_id, user_id, field, old_value, new_value) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'quoted_rate', '20k', '22k');

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

-- Withdrawn: deleted, with everything that hangs on it.
with d as (delete from public.applications where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning id)
select is((select count(*)::int from d), 1, 'owner deletes a withdrawn application');
-- Rejected: deleted too.
with d as (delete from public.applications where id = 'aaaaaaaa-0000-0000-0000-000000000002' returning id)
select is((select count(*)::int from d), 1, 'owner deletes a rejected application');
-- Active: refused by RLS (0 rows, no error).
with d as (delete from public.applications where id = 'aaaaaaaa-0000-0000-0000-000000000003' returning id)
select is((select count(*)::int from d), 0, 'an active application is not deleted');
-- Another user's withdrawn application: refused.
with d as (delete from public.applications where id = 'aaaaaaaa-0000-0000-0000-000000000004' returning id)
select is((select count(*)::int from d), 0, 'another user''s withdrawn application is not deleted');

reset role;

select is((select count(*)::int from public.applications where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'the withdrawn application is gone');
select is((select count(*)::int from public.applications where id = 'aaaaaaaa-0000-0000-0000-000000000002'), 0,
  'the rejected application is gone');
select is((select count(*)::int from public.applications where id = 'aaaaaaaa-0000-0000-0000-000000000003'), 1,
  'the active application stays');
select is((select count(*)::int from public.applications where id = 'aaaaaaaa-0000-0000-0000-000000000004'), 1,
  'the other user''s application stays');
select is((select count(*)::int from public.notes where application_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'its notes are deleted');
select is((select count(*)::int from public.note_revisions where note_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 0,
  'its note versions are deleted');
select is((select count(*)::int from public.status_changes where application_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'its status history is deleted');
select is((select count(*)::int from public.field_changes where application_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'its field history is deleted');
select is((select count(*)::int from public.cv_files where id = 'cccccccc-0000-0000-0000-000000000001'), 1,
  'the attached CV file stays in the library');

select * from finish();
rollback;
