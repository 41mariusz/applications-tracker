-- Permanent delete of crossed-out applications (owner decision 2026-10-19, PRD FR-004 update).
-- Applications stay non-deletable by default; only the owner's Rejected or Withdrawn ones can be
-- deleted. The delete cascades to notes, note_revisions, status_changes and field_changes
-- (existing `on delete cascade`); the attached CV stays in cv_files (FR-013: CV files are never deleted).
-- The status condition lives here, in RLS, so it also holds when the app's API is bypassed.
create policy "applications_delete_own_closed" on public.applications
  for delete to authenticated
  using (user_id = (select auth.uid()) and status in ('rejected', 'withdrawn'));
