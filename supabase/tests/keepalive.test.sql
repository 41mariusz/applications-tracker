-- Keepalive heartbeat: reachable only through its functions.
-- Run with `npx supabase test db` (local Supabase). Everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Start from a known old value (now() is constant inside one transaction).
update public.keepalive set pinged_at = '2000-01-01T00:00:00Z' where id = 1;

set local role anon;

select is(public.keepalive_status(), '2000-01-01T00:00:00Z'::timestamptz, 'anon can read the last ping time');

select throws_ok(
  $$ select pinged_at from public.keepalive $$,
  '42501',
  null,
  'anon cannot select the table directly'
);
select throws_ok(
  $$ update public.keepalive set pinged_at = now() $$,
  '42501',
  null,
  'anon cannot update the table directly'
);

select ok(public.keepalive_ping() > '2000-01-01T00:00:00Z'::timestamptz, 'anon can ping');
select ok(public.keepalive_status() > '2000-01-01T00:00:00Z'::timestamptz, 'a ping moves pinged_at forward');

reset role;
select is((select count(*)::int from public.keepalive), 1, 'the table holds exactly one row');

select * from finish();
rollback;
