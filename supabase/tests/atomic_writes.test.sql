-- Atomic writes: a change and its trace are saved together or not at all.
-- Run with `npx supabase test db` (local Supabase). Everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Two users; act as the first one through RLS.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

insert into public.applications (id, company, position, quoted_rate)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme', 'Dev', '22k');

-- Status change: saved together with its history row.
select ok(
  public.change_application_status('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sent', 'interviews', false),
  'status change succeeds when the expected status matches'
);
select is((select count(*)::int from public.status_changes), 1, 'status change writes one history row');

select ok(
  not public.change_application_status('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sent', 'offer', false),
  'stale expected status is refused'
);
select is(
  (select status::text from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'interviews',
  'refused status change leaves the status untouched'
);
select is((select count(*)::int from public.status_changes), 1, 'refused status change writes no history');

-- Field edit whose change-log insert fails (field is NOT NULL): nothing may be saved.
select throws_ok(
  $$ select public.update_application(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       (select updated_at from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
       '{"company": "Acme", "position": "Dev", "quoted_rate": "30k"}'::jsonb,
       '[{"field": null, "old_value": "22k", "new_value": "30k"}]'::jsonb,
       null) $$,
  '23502',
  null,
  'a failing change-log insert aborts the edit'
);
select is(
  (select quoted_rate from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '22k',
  'the field is not changed without its trace'
);

-- Successful edit with a rate note: fields, log and note together.
select ok(
  public.update_application(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select updated_at from public.applications where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    '{"company": "Acme", "position": "Dev", "quoted_rate": "24k"}'::jsonb,
    '[{"field": "quoted_rate", "old_value": "22k", "new_value": "24k"}]'::jsonb,
    'Zmiana stawki: 22k → 24k. test'),
  'edit succeeds'
);
select is(
  (select count(*)::int from public.field_changes where field = 'quoted_rate' and new_value = '24k'),
  1,
  'edit writes its change-log row'
);
select ok(
  not public.update_application(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '2000-01-01T00:00:00Z',
    '{"company": "Overwritten", "position": "Dev"}'::jsonb,
    '[]'::jsonb,
    null),
  'edit based on an outdated version is refused'
);

-- Note edit keeps the previous version.
select public.add_note('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'phone_call', 'Stawka 24k OK', now());
select ok(
  public.edit_note((select id from public.notes where body = 'Stawka 24k OK'), 'phone_call', 'Stawka 25k OK', now()),
  'note edit succeeds'
);

-- Another user cannot change the owner's data through the functions (RLS still applies).
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select ok(
  not public.change_application_status('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'interviews', 'offer', false),
  'another user cannot change the status'
);

select * from finish();
rollback;
