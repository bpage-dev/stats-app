-- ============================================================================
-- Stats App — seed data
-- Run after 001_schema.sql.
-- Additive-idempotent: every insert uses "on conflict do nothing", so re-running
-- inserts only what's missing and never duplicates. It does NOT update existing
-- rows — to change seeded values, edit the row directly or run 000_reset.sql.
-- ============================================================================

-- Base XP per difficulty.
insert into difficulty_xp (difficulty, base_xp) values
  ('easy', 25),
  ('medium', 75),
  ('hard', 200)
on conflict (difficulty) do nothing;

-- XP templates. Factor scales the (already tracker-sized) base level curve:
--   casual   0.5  -> ~65k XP to level 99   (fastest)
--   standard 1.0  -> ~130k XP to level 99
--   hardcore 2.0  -> ~261k XP to level 99  (grindiest)
insert into xp_templates (name, xp_scale_factor) values
  ('casual', 0.5),
  ('standard', 1.0),
  ('hardcore', 2.0)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Level thresholds, computed from the authentic RuneScape XP curve and then
-- scaled down (÷100) to habit-tracker magnitudes, per template.
--
--   RS per-level increment:  floor((L + 300 * 2^(L/7)) / 4)
--   cumulative XP to reach L: sum of increments for 1..L-1   (level 1 = 0)
-- ---------------------------------------------------------------------------
with recursive rs(lvl, cumulative) as (
  select 1, 0::numeric
  union all
  select lvl + 1,
         cumulative + floor((lvl + 300 * power(2, lvl / 7.0)) / 4)
  from rs
  where lvl < 99
)
insert into level_thresholds (xp_template_id, level_number, xp_required)
select t.id,
       rs.lvl,
       round(rs.cumulative / 100.0 * t.xp_scale_factor)::int
from rs
cross join xp_templates t
on conflict (xp_template_id, level_number) do nothing;

-- ---------------------------------------------------------------------------
-- Starter skills (user_id null = seeded, public). All use the standard template.
-- ---------------------------------------------------------------------------
-- icon stores a MaterialCommunityIcons glyph name (rendered + tinted by the app).
insert into skills (id, user_id, name, icon, description, xp_template_id, is_public)
select s.id, null, s.name, s.icon, s.description, t.id, true
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Distance Running', 'run-fast',        'Build endurance one mile at a time.'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Archery',          'bow-arrow',        'Steady hands, sharper aim.'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'Ukelele',          'guitar-acoustic',  'Four strings, endless tunes.')
) as s(id, name, icon, description)
cross join (select id from xp_templates where name = 'standard') t
on conflict (id) do nothing;

-- Ranks (low -> high), unlocked by milestones.
insert into ranks (skill_id, label, rank_order, milestone_desc) values
  -- Distance Running
  ('11111111-1111-1111-1111-111111111111', 'Pavement Pounder', 1, 'Log your first run.'),
  ('11111111-1111-1111-1111-111111111111', 'Trail Seeker',     2, 'Complete a 5K.'),
  ('11111111-1111-1111-1111-111111111111', 'Road Warrior',     3, 'Run a 10K.'),
  ('11111111-1111-1111-1111-111111111111', 'Endurance Seeker', 4, 'Finish a half marathon.'),
  ('11111111-1111-1111-1111-111111111111', 'Peak Chaser',      5, 'Finish a full marathon.'),
  -- Archery
  ('22222222-2222-2222-2222-222222222222', 'Whittler',     1, 'Loose your first arrow.'),
  ('22222222-2222-2222-2222-222222222222', 'Fletcher',     2, 'Group three arrows on target.'),
  ('22222222-2222-2222-2222-222222222222', 'Bowyer',       3, 'Shoot a full scored round.'),
  ('22222222-2222-2222-2222-222222222222', 'Marksman',     4, 'Place in a local competition.'),
  ('22222222-2222-2222-2222-222222222222', 'Sharpshooter', 5, 'Hit a personal-best score.'),
  -- Ukelele
  ('33333333-3333-3333-3333-333333333333', 'Strummer',     1, 'Play your first chord.'),
  ('33333333-3333-3333-3333-333333333333', 'Chord Chaser', 2, 'Switch cleanly between chords.'),
  ('33333333-3333-3333-3333-333333333333', 'Fret Walker',  3, 'Play a full song.'),
  ('33333333-3333-3333-3333-333333333333', 'Melodist',     4, 'Perform for someone.'),
  ('33333333-3333-3333-3333-333333333333', 'Composer',     5, 'Write your own song.')
on conflict (skill_id, rank_order) do nothing;

-- Sample activities per skill.
insert into activities (skill_id, name, difficulty) values
  -- Distance Running
  ('11111111-1111-1111-1111-111111111111', 'Short jog (1-2 mi)',  'easy'),
  ('11111111-1111-1111-1111-111111111111', 'Tempo run (3-5 mi)',  'medium'),
  ('11111111-1111-1111-1111-111111111111', 'Long run (6+ mi)',    'hard'),
  -- Archery
  ('22222222-2222-2222-2222-222222222222', 'Stance & draw drill (15 min)', 'easy'),
  ('22222222-2222-2222-2222-222222222222', 'Range session (50 arrows)',    'medium'),
  ('22222222-2222-2222-2222-222222222222', 'Scored round',                 'hard'),
  -- Ukelele
  ('33333333-3333-3333-3333-333333333333', 'Chord practice (15 min)',   'easy'),
  ('33333333-3333-3333-3333-333333333333', 'Learn a new song',          'medium'),
  ('33333333-3333-3333-3333-333333333333', 'Perform a song from memory','hard')
on conflict (skill_id, name) do nothing;
