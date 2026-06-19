-- ============================================================================
-- Stats App — switch seeded skill icons from emoji to vector-font glyph names
-- Run once on a database that was already seeded with the old emoji icons.
-- (Fresh databases get the glyph names directly from 002_seed.sql.)
--
-- The app renders skills.icon as a MaterialCommunityIcons glyph so it can be
-- tinted gold; emoji can't be recolored.
-- ============================================================================

update skills set icon = 'run-fast'       where id = '11111111-1111-1111-1111-111111111111';
update skills set icon = 'bow-arrow'      where id = '22222222-2222-2222-2222-222222222222';
update skills set icon = 'guitar-acoustic' where id = '33333333-3333-3333-3333-333333333333';
