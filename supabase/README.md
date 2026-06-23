# Supabase

Database schema and seed data for the Stats app.

## Running the migrations

Easiest path (no CLI): open your project in the Supabase dashboard → **SQL Editor**,
then paste and run each file **in order**:

1. `migrations/001_schema.sql` — tables, enums, indexes, and Row-Level Security
2. `migrations/002_seed.sql` — reference data, the level curve, and 3 starter skills
3. `migrations/003_grants.sql` — table privileges for the `anon` / `authenticated`
   API roles. Without these you get `permission denied for table ...` even though
   RLS is set — a missing GRANT is a separate check from RLS.
4. `migrations/004_icon_names.sql` — only needed if you seeded before icons moved
   from emoji to vector glyph names. Fresh installs already get glyph names from
   `002_seed.sql`, so you can skip this.
5. `migrations/005_log_activity.sql` — the `log_activity(activity_id, notes)` RPC
   that awards XP, recomputes the level, and writes the log atomically. The app
   calls it via `supabase.rpc('log_activity', …)`.
6. `migrations/006_log_milestone.sql` — the `log_milestone(rank_id, notes)` RPC
   that records a milestone and sets the skill's current rank to the highest one
   achieved. Called via `supabase.rpc('log_milestone', …)`.
7. `migrations/007_create_skill.sql` — the `create_skill(name, icon, description,
   template_name, activities, ranks)` RPC that creates a user-owned skill plus its
   activities and ranks in one transaction. Called from the new-skill wizard.
8. `migrations/008_schedules.sql` — the `schedules` table (recurring activities) +
   `activity_log.schedule_id`/`scheduled_for` columns and the idempotency index.
   Schedules are created/deleted by direct table writes.
9. `migrations/009_scheduled_sessions.sql` — the `scheduled_sessions` table: one
   row per due date with status pending/completed/skipped.
10. `migrations/010_session_rpcs.sql` — `sync_due_sessions()` (queue pending rows
    on app open, no XP), `claim_sessions(ids)` (award XP + recompute level, or all
    pending if null), `skip_session(id)`. Drops the old `run_due_schedules`.
11. `migrations/011_skill_sharing.sql` — `skills.source_skill_id` lineage column +
    `clone_skill(source)` RPC that copies a public skill (with ranks + activities)
    to the caller as their own private skill. Sharing itself is just `is_public`.
12. `migrations/012_lock_skill_structure.sql` — freezes skill structure. Makes
    `create_skill`/`clone_skill` SECURITY DEFINER and revokes direct write access
    to `activities`/`ranks` (and all but the `is_public` column of `skills`). After
    this, a skill's activities & ranks are immutable; only the share toggle and a
    whole-skill delete remain. Must run after 011.
13. `migrations/013_skill_deletion.sql` — soft delete with a 7-day grace period:
    `skills.delete_after` column + `request_skill_deletion` / `cancel_skill_deletion`
    / `purge_expired_skills` RPCs. Pending skills hide from the board; purge runs
    lazily on app open.
14. `migrations/014_download_counts.sql` — `skill_download_counts(ids)` SECURITY
    DEFINER RPC that counts clones per source skill across all users (RLS would
    otherwise hide other people's private clones).

`001` and `002` are **additive-idempotent** — re-running them is safe and inserts
only what's missing (they never update existing rows or duplicate data). `003`
and `005` are also safe to re-run. So the normal setup is just: run `001`, `002`,
`003`, `005` (skip `004` on fresh installs).

### Wiping and rebuilding

`migrations/000_reset.sql` is a **destructive** teardown — it drops every table,
the `log_activity` function, and the `difficulty` type, deleting all data. Run it
only when you deliberately want a clean slate, then re-run `001 → 002 → 003 → 005`.
Because `001`/`002` are additive, editing a seeded value (e.g. a rank label) and
re-running `002` won't change existing rows — reset, or edit the row directly.

## Notes

- **RLS is on for every table.** The seed file is meant to be run from the SQL
  editor / service role, which bypasses RLS. The client (anon key) can only read
  reference + public/seeded data and read-write its own rows.
- **Levels vs. ranks are decoupled.** Levels come from `level_thresholds`
  (XP-driven); ranks come from `milestone_log` (milestone-driven).
- **Level curve** is the RuneScape XP formula scaled down ÷100, then multiplied by
  the template's `xp_scale_factor` (casual 0.5 / standard 1.0 / hardcore 2.0).
  Level 99 ≈ 65k / 130k / 261k XP respectively. Tune in `002_seed.sql`.
- **Base XP per difficulty** lives in `difficulty_xp` (easy 25 / medium 75 / hard 200)
  so it can change without a client release.
