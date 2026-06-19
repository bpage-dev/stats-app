// Pure level/XP math, derived from the seeded level_thresholds table.
// Single source of truth for turning accumulated XP into a level + bar fill,
// reused by the Skill Board now and the logging flow in Phase 3.

export const MAX_LEVEL = 99;

export type Threshold = { level_number: number; xp_required: number };

export type LevelInfo = {
  /** Current level (1-99). */
  level: number;
  /** XP earned past the current level's threshold. */
  xpIntoLevel: number;
  /** Total XP span between this level and the next (0 at max level). */
  xpForLevel: number;
  /** Progress toward the next level, 0..1 (1 at max level). */
  fraction: number;
  isMax: boolean;
};

/**
 * @param xp          accumulated XP for the skill
 * @param thresholds  rows for ONE template (any order); level 1 must be 0 XP
 */
export function getLevelInfo(xp: number, thresholds: Threshold[]): LevelInfo {
  const sorted = [...thresholds].sort((a, b) => a.level_number - b.level_number);

  let level = 1;
  for (const t of sorted) {
    if (xp >= t.xp_required) level = t.level_number;
    else break;
  }

  const currentReq = sorted.find((t) => t.level_number === level)?.xp_required ?? 0;
  const nextReq = sorted.find((t) => t.level_number === level + 1)?.xp_required;

  if (level >= MAX_LEVEL || nextReq === undefined) {
    return { level: Math.min(level, MAX_LEVEL), xpIntoLevel: 0, xpForLevel: 0, fraction: 1, isMax: true };
  }

  const xpForLevel = nextReq - currentReq;
  const xpIntoLevel = xp - currentReq;
  const fraction = xpForLevel > 0 ? Math.min(1, Math.max(0, xpIntoLevel / xpForLevel)) : 0;

  return { level, xpIntoLevel, xpForLevel, fraction, isMax: false };
}
