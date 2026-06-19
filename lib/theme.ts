// Shared visual tokens for the app's dark, RPG-flavored UI.
// Kept in one place so screens stay consistent and the palette is easy to tune.
export const colors = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceMuted: '#172033',
  border: 'rgba(148, 163, 184, 0.15)',
  borderStrong: 'rgba(148, 163, 184, 0.3)',
  gold: '#f59e0b',
  goldBright: '#fbbf24',
  goldTint: 'rgba(245, 158, 11, 0.15)',
  track: 'rgba(148, 163, 184, 0.2)',
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  danger: '#ef4444',
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
} as const;

/** Insert thousands separators without relying on Intl (spotty under Hermes). */
export function formatInt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
