-- ============================================================================
-- Stats App — schedules (recurring auto-logged activities)
-- A schedule says "log this activity on these days". Occurrences are
-- materialized into activity_log lazily by run_due_schedules() (009).
-- Self-contained + additive-idempotent.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'recurrence_type') then
    create type recurrence_type as enum ('weekly', 'interval');
  end if;
end $$;

create table if not exists schedules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  skill_id    uuid not null references skills (id) on delete cascade,
  activity_id uuid not null references activities (id) on delete cascade,
  recurrence  recurrence_type not null,
  weekdays    integer[] not null default '{}',  -- weekly: 0=Sun .. 6=Sat
  interval_days integer,                          -- interval: every N days
  start_date  date not null default current_date,
  end_date    date,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (
    (recurrence = 'weekly'   and array_length(weekdays, 1) >= 1) or
    (recurrence = 'interval' and interval_days >= 1)
  )
);

-- Link auto-logged sessions back to their schedule + intended date.
alter table activity_log add column if not exists schedule_id uuid references schedules (id) on delete set null;
alter table activity_log add column if not exists scheduled_for date;

create index if not exists schedules_user_id_idx on schedules (user_id);

-- One log per (schedule, date) — the idempotency guard for catch-up. Partial so
-- it only constrains scheduled rows; manual logs (null schedule_id) are exempt.
create unique index if not exists activity_log_schedule_occurrence_idx
  on activity_log (schedule_id, scheduled_for)
  where schedule_id is not null;

alter table schedules enable row level security;

drop policy if exists "schedules own" on schedules;
create policy "schedules own" on schedules
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on schedules to authenticated;
