-- Dated, typed notes on an application (PRD FR-009, FR-010).
-- Nothing is lost: edits keep the previous version in note_revisions, and "removing" a note
-- sets deleted_at (the note stays visible, crossed out). No delete policies on purpose.

create type public.note_kind as enum ('comment', 'phone_call');

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.note_kind not null,
  body text not null check (length(trim(body)) > 0),
  noted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index notes_application_id_idx on public.notes (application_id, noted_at desc);

alter table public.notes enable row level security;

create policy "notes_select_own" on public.notes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notes_insert_own" on public.notes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.applications a
      where a.id = application_id and a.user_id = (select auth.uid())
    )
  );

create policy "notes_update_own" on public.notes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table public.note_revisions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  previous_kind public.note_kind not null,
  previous_body text not null,
  previous_noted_at timestamptz not null,
  changed_at timestamptz not null default now()
);

create index note_revisions_note_id_idx on public.note_revisions (note_id, changed_at desc);

alter table public.note_revisions enable row level security;

create policy "note_revisions_select_own" on public.note_revisions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "note_revisions_insert_own" on public.note_revisions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.notes n
      where n.id = note_id and n.user_id = (select auth.uid())
    )
  );
