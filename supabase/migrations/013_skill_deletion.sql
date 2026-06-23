-- ============================================================================
-- Stats App — soft skill deletion with a 7-day grace period
-- "Remove" doesn't delete immediately: it sets skills.delete_after = now() + 7d.
-- Such skills are hidden from the board and listed under "Recently deleted",
-- where they can be restored. purge_expired_skills() hard-deletes the expired
-- ones (cascading to ranks/activities/progress/logs/schedules), called lazily
-- on app open.
-- ============================================================================

alter table skills add column if not exists delete_after timestamptz;
create index if not exists skills_delete_after_idx on skills (delete_after) where delete_after is not null;

-- delete_after is per-user STATE, so allow updating it (structure still frozen).
grant update (delete_after) on skills to authenticated;

-- Request deletion: server sets the 7-day clock so the client can't fudge it.
drop function if exists request_skill_deletion(uuid);
create function request_skill_deletion(p_skill_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_when timestamptz;
begin
  update skills set delete_after = now() + interval '7 days'
  where id = p_skill_id and user_id = auth.uid()
  returning delete_after into v_when;
  if v_when is null then
    raise exception 'skill not found or not yours';
  end if;
  return v_when;
end;
$$;
grant execute on function request_skill_deletion(uuid) to authenticated;

-- Restore a skill that's pending deletion.
drop function if exists cancel_skill_deletion(uuid);
create function cancel_skill_deletion(p_skill_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update skills set delete_after = null
  where id = p_skill_id and user_id = auth.uid();
end;
$$;
grant execute on function cancel_skill_deletion(uuid) to authenticated;

-- Hard-delete skills whose grace period has elapsed (caller's own only).
drop function if exists purge_expired_skills();
create function purge_expired_skills()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  with del as (
    delete from skills
    where user_id = auth.uid() and delete_after is not null and delete_after <= now()
    returning 1
  )
  select count(*) into v_count from del;
  return v_count;
end;
$$;
grant execute on function purge_expired_skills() to authenticated;
