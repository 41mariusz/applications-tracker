-- Removes everything created by seed-test-data.sql: applications whose company starts with "[TEST] ".
-- Notes, note revisions, status and field history are removed with them (on delete cascade).
-- Run in the Supabase SQL Editor. Your real applications are not touched.

delete from public.applications where company like '[TEST] %';
