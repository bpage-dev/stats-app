-- ============================================================================
-- Stats App — log_activity RPC
-- Atomically: award XP for an activity, bump the user's progress row (creating
-- it if needed), recompute the level from level_thresholds, and write the log.
--
-- SECURITY INVOKER -> runs as the calling user, so RLS still applies. The
-- function only ever writes rows owned by auth.uid(), which the RLS policies
-- from 001_schema.sql permit.
-- ============================================================================

create or replace function log_activity(p_activity_id uuid, p_notes text default null)
returns table (new_xp integer, new_level integer, xp_awarded integer, leveled_up boolean)
language plpgsql
security invoker
as $$
declare
  v_user       uuid := auth.uid();
  v_skill      uuid;
  v_difficulty difficulty;
  v_template   uuid;
  v_award      integer;
  v_old_level  integer;
  v_new_xp     integer;
  v_new_level  integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select a.skill_id, a.difficulty into v_skill, v_difficulty
  from activities a where a.id = p_activity_id;
  if v_skill is null then
    raise exception 'activity % not found', p_activity_id;
  end if;

  select base_xp into v_award from difficulty_xp where difficulty = v_difficulty;
  select xp_template_id into v_template from skills where id = v_skill;

  insert into user_skill_progress (user_id, skill_id, current_xp, current_level)
  values (v_user, v_skill, 0, 1)
  on conflict (user_id, skill_id) do nothing;

  select current_level into v_old_level
  from user_skill_progress
  where user_id = v_user and skill_id = v_skill;

  update user_skill_progress
  set current_xp = current_xp + v_award
  where user_id = v_user and skill_id = v_skill
  returning current_xp into v_new_xp;

  select coalesce(max(level_number), 1) into v_new_level
  from level_thresholds
  where xp_template_id = v_template and xp_required <= v_new_xp;

  update user_skill_progress
  set current_level = v_new_level
  where user_id = v_user and skill_id = v_skill;

  insert into activity_log (user_id, skill_id, activity_id, xp_awarded, notes)
  values (v_user, v_skill, p_activity_id, v_award, p_notes);

  return query select v_new_xp, v_new_level, v_award, (v_new_level > v_old_level);
end;
$$;

grant execute on function log_activity(uuid, text) to authenticated;
