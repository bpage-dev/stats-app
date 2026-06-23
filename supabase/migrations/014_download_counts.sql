-- ============================================================================
-- Stats App — skill download counts
-- A "download" is a clone, so the count = number of skills whose source_skill_id
-- points at the original. Clones are PRIVATE to each downloader, so a normal
-- client query (bound by RLS) can't see other users' clones and would undercount.
-- This SECURITY DEFINER function counts across all users and returns ONLY the
-- aggregate count per source — no private rows are exposed.
-- ============================================================================

drop function if exists skill_download_counts(uuid[]);
create function skill_download_counts(p_skill_ids uuid[])
returns table (source_id uuid, downloads integer)
language sql
security definer
set search_path = public
stable
as $$
  select s.source_skill_id, count(*)::int
  from skills s
  where s.source_skill_id = any (p_skill_ids)
  group by s.source_skill_id;
$$;
grant execute on function skill_download_counts(uuid[]) to authenticated;
