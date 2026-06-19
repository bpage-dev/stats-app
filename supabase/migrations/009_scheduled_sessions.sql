-- ============================================================================
-- Stats App — scheduled_sessions (pending / completed / skipped occurrences)
-- A schedule expands into one row per due date. The user resolves each:
--   pending  -> claim (awards XP, writes activity_log)  or  skip (no XP).
-- This replaces the old auto-grant model (run_due_schedules).
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'session_status') then
    create type session_status as enum ('pending', 'completed', 'skipped');
  end if;
end $$;

create table if not exists scheduled_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  schedule_id     uuid not null references schedules (id) on delete cascade,
  skill_id        uuid not null references skills (id) on delete cascade,
  activity_id     uuid not null references activities (id) on delete cascade,
  occurrence_date date not null,
  status          session_status not null default 'pending',
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (schedule_id, occurrence_date)
);

create index if not exists scheduled_sessions_user_status_idx on scheduled_sessions (user_id, status);
create index if not exists scheduled_sessions_user_date_idx   on scheduled_sessions (user_id, occurrence_date);

alter table scheduled_sessions enable row level security;

drop policy if exists "scheduled_sessions own" on scheduled_sessions;
create policy "scheduled_sessions own" on scheduled_sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on scheduled_sessions to authenticated;
