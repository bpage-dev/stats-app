-- ============================================================================
-- Stats App — RESET (DESTRUCTIVE)
-- Drops every Stats App object and ALL its data. Run this ONLY when you want to
-- wipe and rebuild from scratch, then run 001 -> 002 -> 003 -> 005 again.
--
-- Do NOT run against production. There is no undo.
-- ============================================================================

drop function if exists log_activity(uuid, text);
drop function if exists log_milestone(uuid, text);
drop function if exists create_skill(text, text, text, text, jsonb, jsonb);
drop function if exists run_due_schedules();
drop function if exists sync_due_sessions();
drop function if exists claim_sessions(uuid[]);
drop function if exists skip_session(uuid);

-- cascade also removes each table's policies, indexes, and foreign keys.
drop table if exists scheduled_sessions   cascade;
drop table if exists schedules           cascade;
drop table if exists milestone_log       cascade;
drop table if exists activity_log        cascade;
drop table if exists user_skill_progress cascade;
drop table if exists activities          cascade;
drop table if exists ranks               cascade;
drop table if exists skills              cascade;
drop table if exists level_thresholds    cascade;
drop table if exists xp_templates        cascade;
drop table if exists difficulty_xp       cascade;

drop type if exists difficulty;
drop type if exists recurrence_type;
drop type if exists session_status;
