-- Atomic writes: a change and its trace are saved together or not at all
-- (PRD guardrail "no lost agreements"; every change leaves a trace).
-- SECURITY INVOKER: functions run as the calling user, so RLS still applies.
-- Domain rules (allowed transitions, what changed) stay in TypeScript; these only persist.

-- Status change + status_changes row. Returns false if the status changed meanwhile
-- (or the application is not visible to the caller), leaving everything untouched.
create function public.change_application_status(
  p_application_id uuid,
  p_from public.application_status,
  p_to public.application_status,
  p_is_revert boolean
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.applications
     set status = p_to, last_activity_at = now(), updated_at = now()
   where id = p_application_id and status = p_from;
  if not found then
    return false;
  end if;

  insert into public.status_changes (application_id, from_status, to_status, is_revert)
  values (p_application_id, p_from, p_to, p_is_revert);
  return true;
end;
$$;

-- Field edit + one field_changes row per changed field + optional rate-change note.
-- p_expected_updated_at guards against overwriting a concurrent edit; returns false then.
create function public.update_application(
  p_application_id uuid,
  p_expected_updated_at timestamptz,
  p_fields jsonb,
  p_changes jsonb,
  p_note_body text
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.applications
     set company = p_fields ->> 'company',
         position = p_fields ->> 'position',
         posting_url = p_fields ->> 'posting_url',
         salary_range = p_fields ->> 'salary_range',
         quoted_rate = p_fields ->> 'quoted_rate',
         hr_contact_name = p_fields ->> 'hr_contact_name',
         hr_contact_phone = p_fields ->> 'hr_contact_phone',
         applied_on = (p_fields ->> 'applied_on')::date,
         employment_type = (p_fields ->> 'employment_type')::public.employment_type,
         work_mode = (p_fields ->> 'work_mode')::public.work_mode,
         updated_at = now()
   where id = p_application_id and updated_at = p_expected_updated_at;
  if not found then
    return false;
  end if;

  insert into public.field_changes (application_id, field, old_value, new_value)
  select p_application_id, c.field, c.old_value, c.new_value
    from jsonb_to_recordset(p_changes) as c (field text, old_value text, new_value text);

  if p_note_body is not null then
    insert into public.notes (application_id, kind, body) values (p_application_id, 'comment', p_note_body);
    update public.applications set last_activity_at = now() where id = p_application_id;
  end if;
  return true;
end;
$$;

-- New note + bump the application's last activity (it moves up within its stage).
create function public.add_note(
  p_application_id uuid,
  p_kind public.note_kind,
  p_body text,
  p_noted_at timestamptz
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.notes (application_id, kind, body, noted_at)
  values (p_application_id, p_kind, p_body, p_noted_at)
  returning id into v_id;

  update public.applications
     set last_activity_at = now(), updated_at = now()
   where id = p_application_id;
  return v_id;
end;
$$;

-- Note edit: the previous version (read under a row lock) goes to note_revisions first.
-- Returns false if the note is missing, removed, or not visible to the caller.
create function public.edit_note(
  p_note_id uuid,
  p_kind public.note_kind,
  p_body text,
  p_noted_at timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current public.notes;
begin
  select * into v_current from public.notes where id = p_note_id and deleted_at is null for update;
  if not found then
    return false;
  end if;

  insert into public.note_revisions (note_id, previous_kind, previous_body, previous_noted_at)
  values (p_note_id, v_current.kind, v_current.body, v_current.noted_at);

  update public.notes
     set kind = p_kind, body = p_body, noted_at = p_noted_at, updated_at = now()
   where id = p_note_id;
  return true;
end;
$$;

-- Only signed-in users may call these.
revoke execute on function public.change_application_status(uuid, public.application_status, public.application_status, boolean) from public, anon;
revoke execute on function public.update_application(uuid, timestamptz, jsonb, jsonb, text) from public, anon;
revoke execute on function public.add_note(uuid, public.note_kind, text, timestamptz) from public, anon;
revoke execute on function public.edit_note(uuid, public.note_kind, text, timestamptz) from public, anon;
grant execute on function public.change_application_status(uuid, public.application_status, public.application_status, boolean) to authenticated;
grant execute on function public.update_application(uuid, timestamptz, jsonb, jsonb, text) to authenticated;
grant execute on function public.add_note(uuid, public.note_kind, text, timestamptz) to authenticated;
grant execute on function public.edit_note(uuid, public.note_kind, text, timestamptz) to authenticated;
