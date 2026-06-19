-- ============================================================================
-- Stats App — scheduled-session RPCs (sync / claim / skip)
-- Output columns are out_* so they never collide with real column names.
-- ============================================================================

-- The old auto-grant function is replaced by this model.
drop function if exists run_due_schedules();

-- ----------------------------------------------------------------------------
-- sync_due_sessions(): queue a pending row for every due date not seen yet.
-- Awards no XP. Returns the user's total pending count after syncing.
-- ----------------------------------------------------------------------------
drop function if exists sync_due_sessions();
create function sync_due_sessions()
returns integer
language plpgsql
security invoker
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  insert into scheduled_sessions (user_id, schedule_id, skill_id, activity_id, occurrence_date)
  select v_user, s.id, s.skill_id, s.activity_id, g::date
  from schedules s
  cross join lateral generate_series(
    s.start_date,
    least(current_date, coalesce(s.end_date, current_date)),
    case when s.recurrence = 'interval'
         then make_interval(days => s.interval_days)
         else interval '1 day' end
  ) as g
  where s.user_id = v_user
    and s.active
    and (s.recurrence = 'interval' or extract(dow from g)::int = any (s.weekdays))
  on conflict (schedule_id, occurrence_date) do nothing;

  select count(*) into v_count
  from scheduled_sessions
  where user_id = v_user and status = 'pending';

  return v_count;
end;
$$;
grant execute on function sync_due_sessions() to authenticated;

-- ----------------------------------------------------------------------------
-- claim_sessions(ids): mark the given pending sessions completed (or ALL pending
-- if ids is null), award their XP into activity_log, recompute level. Returns a
-- per-skill summary with before/after level.
-- ----------------------------------------------------------------------------
drop function if exists claim_sessions(uuid[]);
create function claim_sessions(p_session_ids uuid[] default null)
returns table (
  out_skill_id   uuid,
  out_skill_name text,
  out_sessions   integer,
  out_xp_gained  integer,
  out_old_level  integer,
  out_new_level  integer
)
language plpgsql
security invoker
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  -- Flip pending -> completed, remembering what we claimed.
  create temp table _claimed on commit drop as
  with u as (
    update scheduled_sessions ss
    set status = 'completed', resolved_at = now()
    where ss.user_id = v_user
      and ss.status = 'pending'
      and (p_session_ids is null or ss.id = any (p_session_ids))
    returning ss.schedule_id, ss.skill_id, ss.activity_id, ss.occurrence_date
  )
  select * from u;

  -- Snapshot levels before awarding, for the before/after summary.
  create temp table _pre on commit drop as
  select p.skill_id, p.current_level
  from user_skill_progress p
  where p.user_id = v_user and p.skill_id in (select distinct skill_id from _claimed);

  -- Write the XP-bearing log rows.
  insert into activity_log (user_id, skill_id, activity_id, xp_awarded, schedule_id, scheduled_for, logged_at)
  select v_user, c.skill_id, c.activity_id, dx.base_xp, c.schedule_id, c.occurrence_date, c.occurrence_date::timestamptz
  from _claimed c
  join activities a on a.id = c.activity_id
  join difficulty_xp dx on dx.difficulty = a.difficulty
  -- Partial-index arbiter must repeat the index's WHERE predicate to match it.
  on conflict (schedule_id, scheduled_for) where schedule_id is not null do nothing;

  -- Ensure progress rows, then recompute XP (= sum of logged XP) and level.
  insert into user_skill_progress (user_id, skill_id, current_xp, current_level)
  select distinct v_user, skill_id, 0, 1 from _claimed
  on conflict (user_id, skill_id) do nothing;

  update user_skill_progress p
  set current_xp = agg.xp, current_level = lvl.lev
  from (
    select skill_id, sum(xp_awarded)::int as xp
    from activity_log where user_id = v_user group by skill_id
  ) agg
  join skills sk on sk.id = agg.skill_id
  join lateral (
    select coalesce(max(level_number), 1) as lev
    from level_thresholds lt
    where lt.xp_template_id = sk.xp_template_id and lt.xp_required <= agg.xp
  ) lvl on true
  where p.user_id = v_user and p.skill_id = agg.skill_id;

  return query
  select c.skill_id, sk.name, count(*)::int, sum(dx.base_xp)::int,
         coalesce(pre.current_level, 1), p.current_level
  from _claimed c
  join activities a on a.id = c.activity_id
  join difficulty_xp dx on dx.difficulty = a.difficulty
  join skills sk on sk.id = c.skill_id
  join user_skill_progress p on p.user_id = v_user and p.skill_id = c.skill_id
  left join _pre pre on pre.skill_id = c.skill_id
  group by c.skill_id, sk.name, p.current_level, pre.current_level;
end;
$$;
grant execute on function claim_sessions(uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- skip_session(id): mark one pending session skipped (no XP).
-- ----------------------------------------------------------------------------
drop function if exists skip_session(uuid);
create function skip_session(p_session_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  update scheduled_sessions
  set status = 'skipped', resolved_at = now()
  where user_id = auth.uid() and id = p_session_id and status = 'pending';
end;
$$;
grant execute on function skip_session(uuid) to authenticated;
