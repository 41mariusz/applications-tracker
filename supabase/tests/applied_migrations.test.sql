-- Applied migrations: anon reads the version list only through applied_migrations().
-- Run with `npx supabase test db` (local Supabase). Everything is rolled back at the end.
-- The expected versions are not hard-coded (that would break on every new migration): the result
-- must equal the table contents, contain the last pre-gate migration and this function's own
-- migration, and so hold at least 8 versions.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

set local role anon;

-- Keep what anon sees for the comparison with the table, which only the owner can read.
select set_config('test.anon_versions', public.applied_migrations()::text, true);

select ok('20261004120000' = any(public.applied_migrations()), 'anon sees the keepalive migration');
select ok('20261006120000' = any(public.applied_migrations()), 'anon sees the migration that adds the function');
select ok(cardinality(public.applied_migrations()) >= 8, 'anon sees at least the 8 versions in the repo today');

select throws_ok(
  $$ select version from supabase_migrations.schema_migrations $$,
  '42501',
  null,
  'anon cannot select the migrations table directly'
);

reset role;

select is(
  current_setting('test.anon_versions')::text[],
  (select array_agg(version order by version) from supabase_migrations.schema_migrations),
  'the result equals the applied versions, sorted'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.applied_migrations()'::regprocedure),
  'the function is security definer'
);
select is(
  (select proconfig from pg_proc where oid = 'public.applied_migrations()'::regprocedure),
  array['search_path=""'],
  'the function runs with an empty search_path'
);

select * from finish();
rollback;
