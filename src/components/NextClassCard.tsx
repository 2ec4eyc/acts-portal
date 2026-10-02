import { useEffect, useState } from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';

import { fetchCourses } from '../lib/data';
import { live } from '../lib/live';
import { upcomingClasses, type Session } from '../lib/schedule';
import type { Course } from '../types';

const COMING = 4;

/** "18:00" → "6:00 PM". */
const time12 = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const span = (s: Session<Course>) => (s.startTime ? `${time12(s.startTime)}${s.endTime ? ` – ${time12(s.endTime)}` : ''}` : 'Time not set');
/** Today / Tomorrow / Mon, Oct 5. */
const dayLabel = (iso: string, now: Date) => {
  const d = new Date(`${iso}T00:00:00`);
  const diff = Math.round((d.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};
const fullDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

/**
 * The next class a student has (their enrolled courses) or a teacher teaches (their own courses),
 * with the few after it. Links to the Schedule tab.
 */
export const NextClassCard = ({ who, uid, onNavigate }: { who: 'student' | 'teacher'; uid: string; onNavigate: (page: string) => void }) => {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => live(fetchCourses, (list) => {
    setCourses(list.filter((c) => c.status !== 'archived' && (who === 'student' || c.instructorId === uid)));
    setNow(new Date());
  }, () => setCourses([])), [who, uid]);

  const sessions: Session<Course>[] = courses ? upcomingClasses<Course>(courses, now, COMING + 1) : [];
  const [next, ...rest] = sessions;
  const sub = (c: Course) => (who === 'student'
    ? c.professor
    : [c.yearLevel, c.schoolType].filter(Boolean).join(' · '));

  return (
    <section aria-labelledby="next-class-title" className="h-full flex flex-col bg-white rounded-2xl border border-fb-border shadow-sm text-left">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-fb-border">
        <h2 id="next-class-title" className="flex-1 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-fb-textPrimary">
          <CalendarClock size={16} className="text-fb-blue" aria-hidden="true" /> {who === 'student' ? 'Next class' : 'Next class you teach'}
        </h2>
        <button type="button" onClick={() => onNavigate('calendar')} className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase tracking-wider text-fb-blue hover:underline">
          View schedule <ChevronRight size={14} />
        </button>
      </div>
      {!courses ? <p className="px-5 py-6 text-sm text-fb-textSecondary">Loading…</p>
        : courses.length === 0 ? <p className="px-5 py-6 text-sm text-fb-textSecondary">{who === 'student' ? "You aren't enrolled in any courses yet." : "You aren't teaching any courses yet."}</p>
        : !next ? <p className="px-5 py-6 text-sm text-fb-textSecondary">No upcoming classes.</p> : (
          <div className="flex-1 flex flex-col">
            <div className="m-4 rounded-2xl bg-gradient-to-br from-fb-blue to-indigo-600 text-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-white/20 text-xs font-black uppercase tracking-widest">{dayLabel(next.date, now)}</span>
                {next.inProgress && <span className="px-2.5 py-1 rounded-lg bg-emerald-400 text-emerald-950 text-xs font-black uppercase tracking-widest">Happening now</span>}
              </div>
              <p className="mt-3 text-xl md:text-2xl font-black leading-tight break-words">{next.course.name}</p>
              {sub(next.course) && <p className="text-sm text-blue-100 break-words">{sub(next.course)}</p>}
              <p className="mt-3 text-sm font-bold">{fullDate(next.date)}</p>
              <p className="text-lg font-black tabular-nums">{span(next)}</p>
            </div>
            {rest.length > 0 && (
              <div className="px-5 pb-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary mb-1">Coming up</h3>
                <ul className="divide-y divide-fb-border">
                  {rest.map((s) => (
                    <li key={`${s.course.id}-${s.date}`} className="py-2 flex items-baseline gap-3 text-sm">
                      <span className="w-24 shrink-0 font-bold text-fb-textPrimary">{dayLabel(s.date, now)}</span>
                      <span className="w-32 shrink-0 text-xs text-fb-textSecondary tabular-nums">{span(s)}</span>
                      <span className="flex-1 min-w-0 truncate text-fb-textPrimary">{s.course.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
    </section>
  );
};
