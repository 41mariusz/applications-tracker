-- The "cvs" bucket enforces its own copy of the CV limits. These values must match the app's
-- rules in src/lib/domain/cv.ts: MAX_CV_BYTES (5 MB) and the MIME keys of CV_TYPES.
-- A limit change needs a new migration with `update storage.buckets`, plus this test.
-- Run with `npx supabase test db` (local Supabase). Everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select ok(exists (select 1 from storage.buckets where id = 'cvs'), 'the cvs bucket exists');

select is((select public from storage.buckets where id = 'cvs'), false, 'the cvs bucket is private');

select is(
  (select file_size_limit from storage.buckets where id = 'cvs'),
  5242880::bigint,
  'file_size_limit equals MAX_CV_BYTES (5 MB)'
);

select set_eq(
  $$ select unnest(allowed_mime_types) from storage.buckets where id = 'cvs' $$,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  'allowed_mime_types equal the MIME types of CV_TYPES'
);

select * from finish();
rollback;
