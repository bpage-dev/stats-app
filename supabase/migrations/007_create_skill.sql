-- ============================================================================
-- Stats App — create_skill RPC
-- Creates a user-owned skill plus its activities and ranks in one transaction,
-- so a skill is never left half-created.
--
-- SECURITY INVOKER -> runs as the caller; RLS permits writing the new skill and
-- its children because they're all owned by auth.uid().
--
-- p_activities jsonb: [{"name": "...", "difficulty": "easy|medium|hard"}, ...]
-- p_ranks      jsonb: [{"label": "...", "milestone_desc": "..."}, ...]  (in order)
-- ============================================================================

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
security invoker
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

  select id into v_template from xp_templates where name = p_template_name;
  if v_template is null then
    raise exception 'unknown template %', p_template_name;
  end if;

  insert into skills (user_id, name, icon, description, xp_template_id, is_public)
  values (v_user, trim(p_name), p_icon, nullif(trim(p_description), ''), v_template, false)
  returning id into v_skill;

  insert into activities (skill_id, name, difficulty)
  select v_skill, trim(a->>'name'), (a->>'difficulty')::difficulty
  from jsonb_array_elements(coalesce(p_activities, '[]'::jsonb)) a
  where coalesce(trim(a->>'name'), '') <> ''
  on conflict (skill_id, name) do nothing;

  insert into ranks (skill_id, label, rank_order, milestone_desc)
  select v_skill, trim(t.r->>'label'), t.ord::int, nullif(trim(t.r->>'milestone_desc'), '')
  from jsonb_array_elements(coalesce(p_ranks, '[]'::jsonb)) with ordinality as t(r, ord)
  where coalesce(trim(t.r->>'label'), '') <> '';

  return v_skill;
end;
$$;

grant execute on function create_skill(text, text, text, text, jsonb, jsonb) to authenticated;
