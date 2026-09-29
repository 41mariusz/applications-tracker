-- Change log of application fields (PRD FR-003, FR-012): every edit leaves a trace
-- (which field, old value, new value, when). Append-only: no update/delete policies.

create table public.field_changes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);

create index field_changes_application_id_idx on public.field_changes (application_id, changed_at desc);

alter table public.field_changes enable row level security;

create policy "field_changes_select_own" on public.field_changes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "field_changes_insert_own" on public.field_changes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.applications a
      where a.id = application_id and a.user_id = (select auth.uid())
    )
  );
