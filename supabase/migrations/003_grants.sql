-- ============================================================================
-- Stats App — table privileges
-- Run after 001_schema.sql (order vs. 002 doesn't matter).
--
-- Fixes "permission denied for table ..." — that error is a missing table-level
-- GRANT, which is separate from RLS. These grants give the API roles access to
-- the tables; the RLS policies from 001_schema.sql still decide which ROWS each
-- user can actually see or change.
-- ============================================================================

grant usage on schema public to anon, authenticated;

-- Read access. RLS narrows this to seeded/public/own rows.
grant select on all tables in schema public to anon, authenticated;

-- Write access only to tables a signed-in user owns rows in. RLS restricts
-- writes to that user's own rows.
grant insert, update, delete on
  skills,
  ranks,
  activities,
  user_skill_progress,
  activity_log,
  milestone_log
to authenticated;
