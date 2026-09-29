-- CV library (PRD FR-013): one CV per application, chosen from the user's library.
-- Files are content-addressed: stored once per user under <user_id>/<sha256>.<ext>, so uploading
-- the same file again (even under another name) reuses it instead of taking more space.
-- Nothing is deleted: no delete policies on the table or the bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cvs',
  'cvs',
  false,
  5242880,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

create table public.cv_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  file_name text not null check (length(trim(file_name)) > 0),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (user_id, sha256)
);

alter table public.cv_files enable row level security;

create policy "cv_files_select_own" on public.cv_files
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "cv_files_insert_own" on public.cv_files
  for insert to authenticated
  with check (user_id = (select auth.uid()) and storage_path like (select auth.uid())::text || '/%');

alter table public.applications
  add column cv_file_id uuid references public.cv_files (id);

create index applications_cv_file_id_idx on public.applications (cv_file_id);

-- Storage: each user reads and uploads only inside their own folder (<user_id>/...).
create policy "cvs_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "cvs_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Attach a CV and log the change in the same transaction (every change leaves a trace).
-- Returns false if the application is not visible to the caller.
create function public.set_application_cv(p_application_id uuid, p_cv_file_id uuid) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_name text;
  v_new_name text;
  v_old_id uuid;
begin
  select a.cv_file_id, f.file_name
    into v_old_id, v_old_name
    from public.applications a
    left join public.cv_files f on f.id = a.cv_file_id
   where a.id = p_application_id
   for update of a;
  if not found then
    return false;
  end if;
  if v_old_id is not distinct from p_cv_file_id then
    return true;
  end if;

  if p_cv_file_id is not null then
    select file_name into v_new_name from public.cv_files where id = p_cv_file_id;
    if not found then
      return false;
    end if;
  end if;

  update public.applications
     set cv_file_id = p_cv_file_id, updated_at = now()
   where id = p_application_id;

  insert into public.field_changes (application_id, field, old_value, new_value)
  values (p_application_id, 'cv', v_old_name, v_new_name);
  return true;
end;
$$;

revoke execute on function public.set_application_cv(uuid, uuid) from public, anon;
grant execute on function public.set_application_cv(uuid, uuid) to authenticated;
