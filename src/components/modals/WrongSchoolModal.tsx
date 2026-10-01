import { useEffect, useState } from 'react';
import { RefreshCw, UserMinus, X } from 'lucide-react';

import { ConfirmModal } from './ConfirmModal';
import { fetchMismatched, unenrollStudents, type MismatchedStudent } from '../../lib/data';
import { toast } from '../../lib/toast';
import type { Course } from '../../types';

const SCHOOL = { day: 'Day School', night: 'Night School' } as const;

/**
 * Students enrolled in a course who aren't from its Day/Night school (usually enrolled before the course
 * had one). Admins remove them here; anyone with a grade or attendance in the course stays.
 */
export const WrongSchoolModal = ({ course, onClose }: { course: Course; onClose: () => void }) => {
  const [rows, setRows] = useState<MismatchedStudent[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => fetchMismatched(course.id).then((r) => { setRows(r); setSelected(new Set()); }).catch((e) => toast.error(e.message));
  useEffect(() => { void load(); }, [course.id]);

  const removable = (rows ?? []).filter((r) => !r.cannotRemove);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const remove = async () => {
    setConfirm(false); setBusy(true);
    try {
      const r = await unenrollStudents(course.id, [...selected]);
      toast.success(`Removed ${r.removed} student${r.removed === 1 ? '' : 's'} from ${course.name}.${r.skipped.length ? ` ${r.skipped.length} kept (grade or attendance recorded).` : ''}`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-fb-textPrimary/30 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Wrong-school students in ${course.name}`}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-fb-border flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-fb-border flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-fb-textPrimary truncate">{course.name}</h3>
            <p className="text-xs text-fb-textSecondary">Students enrolled here who aren't {course.schoolType} students. They see this course on their schedule.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-fb-hover"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!rows && <p className="p-5 text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>}
          {rows?.length === 0 && <p className="p-5 text-sm text-emerald-700 font-bold">Every enrolled student is a {course.schoolType} student.</p>}
          {!!rows?.length && (
            <ul className="divide-y divide-fb-border">
              {rows.map((r) => (
                <li key={r.studentId}>
                  <label className={`flex items-center gap-3 px-5 py-3 ${r.cannotRemove ? 'opacity-60' : 'cursor-pointer hover:bg-fb-hover'}`}>
                    <input type="checkbox" className="accent-fb-blue w-4 h-4" disabled={!!r.cannotRemove}
                      checked={selected.has(r.studentId)} onChange={() => toggle(r.studentId)} />
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-sm truncate">{r.studentName}</span>
                      <span className="block text-xs text-fb-textSecondary">
                        {[r.studentNo, r.schoolType ? SCHOOL[r.schoolType] : 'No school set', r.cohort].filter(Boolean).join(' · ')}
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
