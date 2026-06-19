-- ============================================================================
-- Stats App — schema
-- Run order: 001_schema.sql, then 002_seed.sql
-- Additive-idempotent: safe to re-run. To wipe and rebuild, run 000_reset.sql.
-- ============================================================================
-- Two decoupled progression axes per skill:
--   * Levels (1-99)  — derived from accumulated XP via level_thresholds
--   * Ranks (words)  — unlocked by logging milestones
-- ============================================================================

-- Difficulty of an activity. XP awarded is looked up from difficulty_xp.
-- (create type has no "if not exists", so guard it.)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'difficulty') then
    create type difficulty as enum ('easy', 'medium', 'hard');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Reference / seeded tables (read-only from the client)
-- ---------------------------------------------------------------------------

-- Base XP per difficulty. Kept in a table so values are tunable without a
-- client release. Defaults: easy 25, medium 75, hard 200.
create table if not exists difficulty_xp (
  difficulty difficulty primary key,
  base_xp    integer not null check (base_xp > 0)
);

-- casual / standard / hardcore. xp_scale_factor scales the level thresholds:
-- a lower factor means less XP needed per level (faster leveling).
create table if not exists xp_templates (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  xp_scale_factor numeric not null check (xp_scale_factor > 0),
  created_at      timestamptz not null default now()
);

-- Pre-computed cumulative XP required to *reach* each level, per template.
-- level_number 1 has xp_required 0.
create table if not exists level_thresholds (
  id              uuid primary key default gen_random_uuid(),
  xp_template_id  uuid not null references xp_templates (id) on delete cascade,
  level_number    integer not null check (level_number between 1 and 99),
  xp_required     integer not null check (xp_required >= 0),
  unique (xp_template_id, level_number)
);

-- ---------------------------------------------------------------------------
-- Skill definitions (seeded rows have user_id null; user-created rows are owned)
-- ---------------------------------------------------------------------------

create table if not exists skills (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete cascade,
  name            text not null,
  icon            text,
  description     text,
  xp_template_id  uuid not null references xp_templates (id),
  is_public       boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Word-based ranks unlocked by milestones, ordered low -> high.
create table if not exists ranks (
  id             uuid primary key default gen_random_uuid(),
  skill_id       uuid not null references skills (id) on delete cascade,
  label          text not null,
  rank_order     integer not null check (rank_order > 0),
  milestone_desc text,
  unique (skill_id, rank_order)
);

-- Loggable activities that award XP. The unique(skill_id, name) index below
-- gives the seed a conflict target and prevents duplicate names within a skill.
-- (Defined as a standalone index, not an inline constraint, so it also gets
-- added to databases created before this constraint existed.)
create table if not exists activities (
  id         uuid primary key default gen_random_uuid(),
  skill_id   uuid not null references skills (id) on delete cascade,
  name       text not null,
  difficulty difficulty not null
);

-- ---------------------------------------------------------------------------
-- Per-user progress and logs
-- ---------------------------------------------------------------------------

create table if not exists user_skill_progress (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  skill_id        uuid not null references skills (id) on delete cascade,
  current_xp      integer not null default 0 check (current_xp >= 0),
  current_level   integer not null default 1 check (current_level between 1 and 99),
  current_rank_id uuid references ranks (id),
  unique (user_id, skill_id)
);

create table if not exists activity_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  skill_id    uuid not null references skills (id) on delete cascade,
  activity_id uuid references activities (id) on delete set null,
  xp_awarded  integer not null check (xp_awarded >= 0),
  notes       text,
  logged_at   timestamptz not null default now()
);

create table if not exists milestone_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  skill_id    uuid not null references skills (id) on delete cascade,
  rank_id     uuid not null references ranks (id) on delete cascade,
  notes       text,
  achieved_at timestamptz not null default now()
);

-- Index names match Postgres's default auto-naming so "if not exists" dedupes
-- against indexes created by the original (pre-idempotent) 001.
create index if not exists skills_user_id_idx                  on skills (user_id);
create index if not exists ranks_skill_id_idx                  on ranks (skill_id);
create index if not exists activities_skill_id_idx             on activities (skill_id);
create index if not exists user_skill_progress_user_id_idx     on user_skill_progress (user_id);
create index if not exists activity_log_user_id_skill_id_idx   on activity_log (user_id, skill_id);
create index if not exists milestone_log_user_id_skill_id_idx  on milestone_log (user_id, skill_id);
create unique index if not exists activities_skill_id_name_idx on activities (skill_id, name);
create unique index if not exists milestone_log_user_id_rank_id_idx on milestone_log (user_id, rank_id);

-- ============================================================================
-- Row-Level Security (enable is idempotent; policies are dropped-then-created)
-- ============================================================================
alter table difficulty_xp        enable row level security;
alter table xp_templates         enable row level security;
alter table level_thresholds     enable row level security;
alter table skills               enable row level security;
alter table ranks                enable row level security;
alter table activities           enable row level security;
alter table user_skill_progress  enable row level security;
alter table activity_log         enable row level security;
alter table milestone_log        enable row level security;

-- Reference data: readable by any authenticated user, writable by no one
-- (seeded via service role / SQL editor, which bypasses RLS).
drop policy if exists "ref readable" on difficulty_xp;
create policy "ref readable" on difficulty_xp
  for select to authenticated using (true);

drop policy if exists "ref readable" on xp_templates;
create policy "ref readable" on xp_templates
  for select to authenticated using (true);

drop policy if exists "ref readable" on level_thresholds;
create policy "ref readable" on level_thresholds
  for select to authenticated using (true);

-- A skill is visible if it is seeded (no owner), public, or owned by the caller.
drop policy if exists "skills readable" on skills;
create policy "skills readable" on skills
  for select to authenticated
  using (user_id is null or is_public or user_id = (select auth.uid()));

drop policy if exists "skills insert own" on skills;
create policy "skills insert own" on skills
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "skills update own" on skills;
create policy "skills update own" on skills
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "skills delete own" on skills;
create policy "skills delete own" on skills
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ranks / activities inherit visibility + ownership from their parent skill.
drop policy if exists "ranks readable" on ranks;
create policy "ranks readable" on ranks
  for select to authenticated
  using (exists (
    select 1 from skills s
    where s.id = ranks.skill_id
      and (s.user_id is null or s.is_public or s.user_id = (select auth.uid()))
  ));

drop policy if exists "ranks write own" on ranks;
create policy "ranks write own" on ranks
  for all to authenticated
  using (exists (
    select 1 from skills s
    where s.id = ranks.skill_id and s.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from skills s
    where s.id = ranks.skill_id and s.user_id = (select auth.uid())
  ));

drop policy if exists "activities readable" on activities;
create policy "activities readable" on activities
  for select to authenticated
  using (exists (
    select 1 from skills s
    where s.id = activities.skill_id
      and (s.user_id is null or s.is_public or s.user_id = (select auth.uid()))
  ));

drop policy if exists "activities write own" on activities;
create policy "activities write own" on activities
  for all to authenticated
  using (exists (
    select 1 from skills s
    where s.id = activities.skill_id and s.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from skills s
    where s.id = activities.skill_id and s.user_id = (select auth.uid())
  ));

-- Per-user rows: caller may only touch their own.
drop policy if exists "progress own" on user_skill_progress;
create policy "progress own" on user_skill_progress
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "activity_log own" on activity_log;
create policy "activity_log own" on activity_log
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "milestone_log own" on milestone_log;
create policy "milestone_log own" on milestone_log
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
