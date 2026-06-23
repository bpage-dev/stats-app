-- ============================================================================
-- Stats App — skill sharing / discovery
-- Skills already have is_public + RLS that lets anyone read public skills and
-- their ranks/activities. This adds:
--   * skills.source_skill_id — lineage of a cloned skill (dedup + "already added")
--   * clone_skill(source) — copy a public skill (+ ranks + activities) to the
--     caller as their own private skill, in one transaction.
-- ============================================================================

alter table skills add column if not exists source_skill_id uuid references skills (id) on delete set null;
create index if not exists skills_source_skill_id_idx on skills (source_skill_id);

drop function if exists clone_skill(uuid);
create function clone_skill(p_source_id uuid)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user uuid := auth.uid();
  v_src  skills%rowtype;
  v_new  uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  -- RLS restricts this select to skills the caller may read (public/seeded/own).
  select * into v_src from skills where id = p_source_id;
  if v_src.id is null then
    raise exception 'skill not available';
  end if;

  if exists (select 1 from skills where user_id = v_user and source_skill_id = p_source_id) then
    raise exception 'You already added this skill.';
  end if;

  insert into skills (user_id, name, icon, description, xp_template_id, is_public, source_skill_id)
  values (v_user, v_src.name, v_src.icon, v_src.description, v_src.xp_template_id, false, p_source_id)
  returning id into v_new;

  insert into ranks (skill_id, label, rank_order, milestone_desc)
  select v_new, label, rank_order, milestone_desc from ranks where skill_id = p_source_id;

  insert into activities (skill_id, name, difficulty)
  select v_new, name, difficulty from activities where skill_id = p_source_id;

  return v_new;
end;
$$;
grant execute on function clone_skill(uuid) to authenticated;
