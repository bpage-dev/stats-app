-- ============================================================================
-- Stats App — log_milestone RPC (the rank / milestone progression axis)
-- Atomically: record that the user achieved a rank's milestone, then set the
-- skill's current rank to the highest-order rank they've achieved.
--
-- SECURITY INVOKER -> runs as the caller, so RLS applies; only ever writes rows
-- owned by auth.uid().
-- ============================================================================

-- One milestone per rank per user. Also the conflict target that makes claiming
-- the same rank twice a harmless no-op. (Added here as a standalone index so it
-- applies to databases created before this migration; 001 also defines it for
-- fresh installs.)
create unique index if not exists milestone_log_user_id_rank_id_idx
  on milestone_log (user_id, rank_id);

-- Dropped first because create-or-replace cannot change a function's return
-- type, and the OUT-parameter names changed (see below).
drop function if exists log_milestone(uuid, text);

-- Output columns are prefixed (out_*) so they don't collide with real column
-- names like rank_id inside the function body (e.g. the on-conflict target),
-- which would otherwise raise "column reference is ambiguous".
create function log_milestone(p_rank_id uuid, p_notes text default null)
returns table (out_rank_id uuid, out_rank_label text, out_became_current boolean)
language plpgsql
security invoker
as $$
declare
  v_user        uuid := auth.uid();
  v_skill       uuid;
  v_label       text;
  v_old_current uuid;
  v_top_rank    uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select r.skill_id, r.label into v_skill, v_label
  from ranks r where r.id = p_rank_id;
  if v_skill is null then
    raise exception 'rank % not found', p_rank_id;
  end if;

  insert into user_skill_progress (user_id, skill_id, current_xp, current_level)
  values (v_user, v_skill, 0, 1)
  on conflict (user_id, skill_id) do nothing;

  select current_rank_id into v_old_current
  from user_skill_progress
  where user_id = v_user and skill_id = v_skill;

  insert into milestone_log (user_id, skill_id, rank_id, notes)
  values (v_user, v_skill, p_rank_id, p_notes)
  on conflict (user_id, rank_id) do nothing;

  -- Current rank = the highest-order rank the user has achieved for this skill.
  select ml.rank_id into v_top_rank
  from milestone_log ml
  join ranks r on r.id = ml.rank_id
  where ml.user_id = v_user and ml.skill_id = v_skill
  order by r.rank_order desc
  limit 1;

  update user_skill_progress
  set current_rank_id = v_top_rank
  where user_id = v_user and skill_id = v_skill;

  return query select p_rank_id, v_label, (v_top_rank is distinct from v_old_current);
end;
$$;

grant execute on function log_milestone(uuid, text) to authenticated;
