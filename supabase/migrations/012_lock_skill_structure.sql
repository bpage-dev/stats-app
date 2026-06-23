-- ============================================================================
-- Stats App — freeze skill structure
-- A skill's structure (its activities and ranks) is immutable once created.
-- Enforced at the DB, not just the UI:
--   * create_skill / clone_skill become SECURITY DEFINER, so they can still
--     write the structure at creation time...
--   * ...while the `authenticated` role loses all direct insert/update/delete on
--     `activities` and `ranks`. The controlled RPCs are the ONLY writers.
--   * `skills` keeps delete (remove a whole skill) but its only mutable column is
--     `is_public` (the share toggle). Name/icon/template/etc. are frozen.
--   * Per-user STATE (progress, logs, milestones, schedules) is untouched.
--
-- SECURITY DEFINER bypasses RLS, so the functions re-check auth.uid() and (for
-- clone) the source skill's visibility themselves. search_path is pinned.
-- ============================================================================

-- ---- create_skill: now SECURITY DEFINER -----------------------------------
drop function if exists create_skill(text, text, text, text, jsonb, jsonb);
create function create_skill(
  p_name          text,
  p_icon          text,
  p_description   text,
  p_template_name text,
  p_activities    jsonb default '[]'::jsonb,
  p_ranks         jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_template uuid;
  v_skill    uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name is required';
  end if;

  select id into v_template from public.xp_templates where name = p_template_name;
  if v_template is null then
    raise exception 'unknown template %', p_template_name;
  end if;

  insert into public.skills (user_id, name, icon, description, xp_template_id, is_public)
  values (v_user, trim(p_name), p_icon, nullif(trim(p_description), ''), v_template, false)
  returning id into v_skill;

  insert into public.activities (skill_id, name, difficulty)
  select v_skill, trim(a->>'name'), (a->>'difficulty')::public.difficulty
  from jsonb_array_elements(coalesce(p_activities, '[]'::jsonb)) a
  where coalesce(trim(a->>'name'), '') <> ''
  on conflict (skill_id, name) do nothing;

  insert into public.ranks (skill_id, label, rank_order, milestone_desc)
  select v_skill, trim(t.r->>'label'), t.ord::int, nullif(trim(t.r->>'milestone_desc'), '')
  from jsonb_array_elements(coalesce(p_ranks, '[]'::jsonb)) with ordinality as t(r, ord)
  where coalesce(trim(t.r->>'label'), '') <> '';

  return v_skill;
end;
$$;
grant execute on function create_skill(text, text, text, text, jsonb, jsonb) to authenticated;

-- ---- clone_skill: now SECURITY DEFINER (re-checks visibility) --------------
drop function if exists clone_skill(uuid);
create function clone_skill(p_source_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_src  public.skills%rowtype;
  v_new  uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  -- Definer bypasses RLS, so replicate the read rule: public, seeded, or own.
  select * into v_src from public.skills
  where id = p_source_id and (is_public or user_id is null or user_id = v_user);
  if v_src.id is null then
    raise exception 'skill not available';
  end if;

  if exists (select 1 from public.skills where user_id = v_user and source_skill_id = p_source_id) then
    raise exception 'You already added this skill.';
  end if;

  insert into public.skills (user_id, name, icon, description, xp_template_id, is_public, source_skill_id)
  values (v_user, v_src.name, v_src.icon, v_src.description, v_src.xp_template_id, false, p_source_id)
  returning id into v_new;

  insert into public.ranks (skill_id, label, rank_order, milestone_desc)
  select v_new, label, rank_order, milestone_desc from public.ranks where skill_id = p_source_id;

  insert into public.activities (skill_id, name, difficulty)
  select v_new, name, difficulty from public.activities where skill_id = p_source_id;

  return v_new;
end;
$$;
grant execute on function clone_skill(uuid) to authenticated;

-- ---- Lock the structure tables --------------------------------------------
-- No direct writes to activities/ranks; the definer RPCs above are the only path.
revoke insert, update, delete on activities from authenticated;
revoke insert, update, delete on ranks      from authenticated;
drop policy if exists "activities write own" on activities;
drop policy if exists "ranks write own"      on ranks;

-- skills: creation is via RPC; only is_public stays editable; delete remains.
revoke insert, update on skills from authenticated;
drop policy if exists "skills insert own" on skills;
grant update (is_public) on skills to authenticated;
