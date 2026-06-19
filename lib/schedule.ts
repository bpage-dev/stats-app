// Client-side schedule helpers: parse the stored rows and decide which calendar
// days a recurring schedule lands on. Mirrors the SQL in run_due_schedules.

export type Recurrence = 'weekly' | 'interval';

export type ScheduleRow = {
  id: string;
  skill_id: string;
  activity_id: string;
  recurrence: Recurrence;
  weekdays: number[]; // 0=Sun .. 6=Sat
  interval_days: number | null;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
  active: boolean;
};

export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Parse a YYYY-MM-DD string as a local-midnight Date (avoids UTC drift). */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAY_MS = 86_400_000;

/** Does this schedule fall on the given calendar day? */
export function scheduleMatchesDate(s: ScheduleRow, date: Date): boolean {
  const day = startOfDay(date);
  const start = parseDate(s.start_date);
  if (day < start) return false;
  if (s.end_date && day > parseDate(s.end_date)) return false;

  if (s.recurrence === 'weekly') {
    return s.weekdays.includes(day.getDay());
  }
  if (!s.interval_days || s.interval_days < 1) return false;
  const elapsed = Math.round((day.getTime() - start.getTime()) / DAY_MS);
  return elapsed % s.interval_days === 0;
}

/** Human label for a schedule's cadence, e.g. "Tue, Thu" or "Every 2 days". */
export function describeRecurrence(s: ScheduleRow): string {
  if (s.recurrence === 'interval') {
    return s.interval_days === 1 ? 'Every day' : `Every ${s.interval_days} days`;
  }
  const ordered = [...s.weekdays].sort((a, b) => a - b);
  return ordered.map((d) => WEEKDAY_SHORT[d]).join(', ') || 'Weekly';
}
