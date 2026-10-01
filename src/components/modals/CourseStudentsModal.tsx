import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, UserMinus, UserPlus, X } from 'lucide-react';

import { ConfirmModal } from './ConfirmModal';
import { addStudentsToCourse, fetchCourseStudents, fetchUsers, unenrollStudents, type CourseStudent } from '../../lib/data';
import { formatName } from '../../lib/format';
import { toast } from '../../lib/toast';
import type { Course, UserProfile } from '../../types';

const SCHOOL = { day: 'Day School', night: 'Night School' } as const;
const YEAR = { 1: '1st Year', 2: '2nd Year' } as Record<number, string>;

/**
 * A course's students: everyone enrolled (automatically by Day/Night + year, or added by hand), adding a
 * student by hand as an exception, and removing students. Anyone with a grade or attendance stays.
 */
export const CourseStudentsModal = ({ course, onClose }: { course: Course; onClose: () => void }) => {
  const [rows, setRows] = useState<CourseStudent[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'other'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState<UserProfile[] | null>(null);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  const load = () => fetchCourseStudents(course.id).then((r) => { setRows(r.students); setSelected(new Set()); }).catch((e) => toast.error(e.message));
  useEffect(() => { void load(); }, [course.id]);
  useEffect(() => { fetchUsers({ role: 'student' }).then(setAll).catch(() => setAll([])); }, []);

  const other = (rows ?? []).filter((r) => r.wrongSchool);
  const shown = filter === 'other' ? other : rows ?? [];
  const removable = shown.filter((r) => !r.cannotRemove);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const enrolledIds = useMemo(() => new Set((rows ?? []).map((r) => r.studentId)), [rows]);
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term || !all) return [];
    return all.filter((s) => !enrolledIds.has(s.uid)
      && `${formatName(s)} ${s.firstName ?? ''} ${s.lastName ?? ''} ${s.studentId ?? ''} ${s.batchName ?? ''}`.toLowerCase().includes(term)).slice(0, 8);
  }, [q, all, enrolledIds]);
  const exception = (s: UserProfile) => {
    const parts: string[] = [];
    if (course.schoolType && s.schoolType !== course.schoolType) parts.push(s.schoolType ?? 'No school set');
    if (s.yearLevel !== course.yearLevel) parts.push(s.yearLevel ?? 'No year set');
    return parts.length ? `${parts.join(' · ')}: will be added as an exception` : null;
  };

  const add = async (s: UserProfile) => {
    setAdding(s.uid);
    try {
      const r = await addStudentsToCourse(course.id, [s.uid]);
      toast.success(r.added ? `${formatName(s)} added to ${course.name}.` : `${formatName(s)} is already in ${course.name}.`);
      setQ('');
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setAdding(null); }
  };

  const remove = async () => {
    setConfirm(false); setBusy(true);
    try {
      const r = await unenrollStudents(course.id, [...selected]);
      toast.success(`Removed ${r.removed} student${r.removed === 1 ? '' : 's'} from ${course.name}.${r.skipped.length ? ` ${r.skipped.length} kept (grade or attendance recorded).` : ''}`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const chip = (active: boolean) => `px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${active ? 'bg-fb-blue text-white' : 'bg-fb-gray text-fb-textSecondary hover:bg-fb-hover'}`;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-fb-textPrimary/30 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Students in ${course.name}`}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-fb-border flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-fb-border flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-fb-textPrimary truncate">{course.name}</h3>
            <p className="text-xs text-fb-textSecondary">{[course.schoolType ?? 'Day/Night not set', course.yearLevel, course.schoolYear && `SY ${course.schoolYear}`].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-fb-hover"><X size={16} /></button>
        </div>

        <div className="px-5 py-3 border-b border-fb-border space-y-2">
          <label htmlFor="add-student" className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">Add a student</label>
          <input id="add-student" type="search" autoComplete="off" placeholder="Search by name, student no. or batch…" value={q} onChange={(e) => setQ(e.target.value)}
            className="w-full bg-white border-2 border-fb-gray rounded-xl px-3 py-2 text-sm outline-none focus:border-fb-blue" />
          {q.trim() && (
            <ul className="rounded-xl border border-fb-border divide-y divide-fb-border max-h-56 overflow-y-auto">
              {!all && <li className="p-3 text-sm text-fb-textSecondary">Loading…</li>}
              {all && matches.length === 0 && <li className="p-3 text-sm text-fb-textSecondary">No students found (or they're already in this course).</li>}
              {matches.map((s) => {
                const note = exception(s);
                return (
                  <li key={s.uid} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-sm truncate">{formatName(s)}</span>
                      <span className="block text-xs text-fb-textSecondary truncate">{[s.studentId, s.schoolType ?? 'No school set', s.yearLevel, s.batchName].filter(Boolean).join(' · ')}</span>
                      {note && <span className="block text-[11px] font-semibold text-amber-700">{note}</span>}
                    </span>
                    <button type="button" onClick={() => add(s)} disabled={adding !== null} aria-label={`Add ${formatName(s)}`}
                      className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-fb-blue text-white text-[10px] font-black uppercase disabled:opacity-50">
                      {adding === s.uid ? <RefreshCw size={12} className="animate-spin" /> : <UserPlus size={12} />} Add
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 pt-3 flex items-center gap-2">
          <button type="button" className={chip(filter === 'all')} onClick={() => { setFilter('all'); setSelected(new Set()); }}>All ({rows?.length ?? 0})</button>
          {other.length > 0 && <button type="button" className={chip(filter === 'other')} onClick={() => { setFilter('other'); setSelected(new Set()); }}>Other school ({other.length})</button>}
        </div>
        <div className="flex-1 overflow-y-auto">
          {!rows && <p className="p-5 text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>}
          {rows?.length === 0 && <p className="p-5 text-sm text-fb-textSecondary">No students in this course yet.</p>}
          {shown.length > 0 && (
            <ul className="divide-y divide-fb-border">
              {shown.map((r) => (
                <li key={r.studentId}>
                  <label className={`flex items-center gap-3 px-5 py-3 ${r.cannotRemove ? '' : 'cursor-pointer hover:bg-fb-hover'}`}>
                    <input type="checkbox" className="accent-fb-blue w-4 h-4" disabled={!!r.cannotRemove}
                      checked={selected.has(r.studentId)} onChange={() => toggle(r.studentId)} aria-label={`Select ${r.studentName}`} />
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-sm">{r.studentName}</span>
                        {r.manual && <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[9px] font-black uppercase">Added by hand</span>}
                        {r.wrongSchool && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase">Other school</span>}
                      </span>
                      <span className="block text-xs text-fb-textSecondary">
                        {[r.studentNo, r.schoolType ? SCHOOL[r.schoolType] : 'No school set', r.yearLevel ? YEAR[r.yearLevel] : null, r.cohort].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {r.cannotRemove && <span className="text-[10px] font-black uppercase text-fb-textSecondary">{r.cannotRemove}</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-5 py-4 border-t border-fb-border flex flex-wrap items-center gap-3">
          {removable.length > 0 && (
            <button type="button" onClick={() => setSelected(selected.size === removable.length ? new Set() : new Set(removable.map((r) => r.studentId)))}
              className="text-xs font-bold text-fb-blue">{selected.size === removable.length ? 'Clear' : 'Select all removable'}</button>
          )}
          <button type="button" disabled={busy || selected.size === 0} onClick={() => setConfirm(true)}
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40">
            <UserMinus size={13} /> {busy ? 'Removing…' : `Remove from course${selected.size ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      </div>
      <ConfirmModal isOpen={confirm} variant="danger" title="Remove from course?"
        message={`Remove ${selected.size} student${selected.size === 1 ? '' : 's'} from ${course.name}? It disappears from their schedule. This is recorded in the Audit log.`}
        confirmText="Remove" onConfirm={remove} onCancel={() => setConfirm(false)} />
    </div>
  );
};
