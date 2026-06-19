import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../lib/theme';

const glyphMap = MaterialCommunityIcons.glyphMap;
type GlyphName = keyof typeof glyphMap;

const FALLBACK: GlyphName = 'star-four-points';

type Props = {
  /** A MaterialCommunityIcons glyph name stored on the skill. */
  name: string | null;
  size?: number;
  color?: string;
};

/**
 * Renders a skill's icon from the vector font so it can be tinted. Falls back to
 * a generic glyph if the stored value isn't a known icon name (e.g. legacy emoji
 * or a not-yet-validated custom skill).
 */
export function SkillIcon({ name, size = 22, color = colors.goldBright }: Props) {
  const glyph: GlyphName = name && name in glyphMap ? (name as GlyphName) : FALLBACK;
  return <MaterialCommunityIcons name={glyph} size={size} color={color} />;
}
