-- Job applications tracked by their owner (PRD FR-002).
-- Applications are never deleted: removal is the "withdrawn" status (PRD FR-004),
-- so there is intentionally no delete policy.

create type public.application_status as enum (
  'sent',
  'hr_contact',
  'interviews',
  'offer',
  'accepted',
  'rejected',
  'withdrawn'
);

create type public.employment_type as enum ('b2b', 'employment_contract');

create type public.work_mode as enum ('remote', 'hybrid', 'onsite');

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company text not null check (length(trim(company)) > 0),
  position text not null check (length(trim(position)) > 0),
  posting_url text,
  salary_range text,
  quoted_rate text,
  hr_contact_name text,
  hr_contact_phone text,
  applied_on date,
  employment_type public.employment_type,
  work_mode public.work_mode,
  status public.application_status not null default 'sent',
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index applications_user_id_idx on public.applications (user_id);

alter table public.applications enable row level security;

create policy "applications_select_own" on public.applications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "applications_insert_own" on public.applications
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "applications_update_own" on public.applications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
