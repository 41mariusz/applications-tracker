-- History of status changes (PRD Business Logic: every change leaves a trace;
-- reverting a terminal status is recorded). Rows are append-only: no update/delete policies.

create table public.status_changes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_status public.application_status not null,
  to_status public.application_status not null,
  is_revert boolean not null default false,
  changed_at timestamptz not null default now()
);

create index status_changes_application_id_idx on public.status_changes (application_id, changed_at desc);

alter table public.status_changes enable row level security;

create policy "status_changes_select_own" on public.status_changes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "status_changes_insert_own" on public.status_changes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.applications a
      where a.id = application_id and a.user_id = (select auth.uid())
    )
  );
