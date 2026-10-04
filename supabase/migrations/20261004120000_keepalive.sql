-- Keepalive heartbeat: the Worker's Cron Trigger calls keepalive_ping() every 6 hours so the
-- free-tier Supabase project sees real database activity and is not paused after an idle week.
-- keepalive_status() lets a health check read when the last ping happened.

create table public.keepalive (
  id smallint primary key default 1 check (id = 1),
  pinged_at timestamptz not null
);

insert into public.keepalive (id, pinged_at) values (1, now());

-- Deliberately RLS with NO policies and no table privileges for anon/authenticated: unlike the
-- other tables (granular per-operation policies), keepalive is reachable only through the two
-- security definer functions below. Direct access fails with "permission denied".
alter table public.keepalive enable row level security;
revoke all on table public.keepalive from anon, authenticated;

create function public.keepalive_ping() returns timestamptz
language sql
security definer
set search_path = ''
as $$
  update public.keepalive set pinged_at = now() where id = 1 returning pinged_at;
$$;

create function public.keepalive_status() returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select pinged_at from public.keepalive where id = 1;
$$;

revoke execute on function public.keepalive_ping() from public;
revoke execute on function public.keepalive_status() from public;
grant execute on function public.keepalive_ping() to anon, authenticated;
grant execute on function public.keepalive_status() to anon, authenticated;
