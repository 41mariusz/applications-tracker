-- Applied migrations: the CI deploy gate calls applied_migrations() with the publishable key to
-- check that the cloud database already has every repo migration before `wrangler deploy`, so new
-- code never runs on an older schema (test-plan risk #2). It discloses only the version strings
-- (no names, no statements) and never writes.

-- supabase_migrations.schema_migrations stays unreadable for anon/authenticated (PostgREST does
-- not expose that schema either): like keepalive_status(), this security definer function is the
-- only way in.
create function public.applied_migrations() returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(version order by version), '{}') from supabase_migrations.schema_migrations;
$$;

revoke execute on function public.applied_migrations() from public;
grant execute on function public.applied_migrations() to anon, authenticated;
