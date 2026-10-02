// When a course meets, for the Schedule calendars. Pure (no imports), so tests can load it directly.
// Weekdays are compared by number (0 = Sunday), never by the browser's locale names.

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAILY_DAYS = [1, 2, 3, 4, 5];   // "Daily" classes meet Monday to Friday

/** 'Mon', 'Monday' or 'monday' → 1; anything else → -1. */
export function dayIndex(name: string): number {
  const key = name.trim().slice(0, 3).toLowerCase();
  return DAY_SHORT.findIndex((d) => d.toLowerCase() === key);
}

export interface Meets {
  isRecurring: boolean;
  /** Session date (once) or start date (recurring), YYYY-MM-DD. */
  date: string;
  frequency?: 'Daily' | 'Weekly' | 'Bi-weekly' | 'Monthly';
  daysOfWeek?: string[];
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};
const DAY_MS = 86_400_000;
/** Whole days between two local dates (DST-safe: compares calendar dates, not milliseconds). */
const daysBetween = (a: Date, b: Date) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);
const weekOfMonth = (d: Date) => Math.floor((d.getDate() - 1) / 7);   // 0 = days 1–7, 1 = days 8–14, …

/** Recurring (not Daily) but no class days chosen, so it shows on no day. */
export function missingDays(c: Meets) {
  return c.isRecurring && c.frequency !== 'Daily' && !(c.daysOfWeek ?? []).some((d) => dayIndex(d) >= 0);
}

/** Does the course meet on this date (YYYY-MM-DD)? */
export function occursOn(c: Meets, iso: string): boolean {
  if (!c.isRecurring) return c.date === iso;
  if (!c.date || iso < c.date) return false;
  const day = parse(iso);
  const weekday = day.getDay();
  if (c.frequency === 'Daily') return DAILY_DAYS.includes(weekday);
  const days = (c.daysOfWeek ?? []).map(dayIndex).filter((d) => d >= 0);
  if (!days.includes(weekday)) return false;
  const start = parse(c.date);
  if (c.frequency === 'Bi-weekly') {
    // Weeks (Sunday to Saturday) counted from the start date's week: 0, 2, 4, … meet.
    const startSunday = new Date(start.getFullYear(), start.getMonth(), start.getDate() - start.getDay());
    return Math.floor(daysBetween(startSunday, day) / 7) % 2 === 0;
  }
  if (c.frequency === 'Monthly') return weekOfMonth(day) === weekOfMonth(start);
  return true;   // Weekly
}

export interface Session<C> { course: C; date: string; startTime: string; endTime: string; inProgress: boolean }
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * The next `count` class sessions from `now` (local time), looking up to `horizonDays` ahead: today's
 * classes that already ended are skipped, one under way is marked inProgress. Sorted by date, then time.
 */
export function upcomingClasses<C extends Meets & { startTime: string; endTime: string }>(
  courses: C[], now: Date, count: number, horizonDays = 120,
): Session<C>[] {
  const out: Session<C>[] = [];
  const time = hhmm(now);
  for (let i = 0; i <= horizonDays && out.length < count; i++) {
    const date = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
    const today = courses.filter((c) => occursOn(c, date) && (i > 0 || !c.endTime || c.endTime > time))
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    for (const c of today) {
      if (out.length >= count) break;
      out.push({ course: c, date, startTime: c.startTime, endTime: c.endTime, inProgress: i === 0 && !!c.startTime && c.startTime <= time });
    }
  }
  return out;
}
