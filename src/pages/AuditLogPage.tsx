import { useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, RefreshCw } from 'lucide-react';

import { Card } from '../components/Card';
import { fetchUsers } from '../lib/data';
import { formatName } from '../lib/format';
import { fetchAudit, type AuditEntry, type AuditFilter } from '../lib/settings';
import type { UserProfile } from '../types';

const TABLES: Record<string, string> = {
  grades: 'Grades',
  users: 'Accounts',
  user_profiles: 'Profiles',
  student_records: 'Student records',
  course_offerings: 'Courses',
  attendance_records: 'Attendance',
  materials: 'Course files',
  transcripts: 'Transcripts',
  announcements: 'Announcements',
  invoices: 'Invoices',
  invoice_lines: 'Invoice charges',
  payments: 'Payments',
  payment_allocations: 'Payment allocations',
  receipt_uploads: 'Receipts',
  app_settings: 'Settings',
};
const SINGULAR: Record<string, string> = {
  grades: 'a grade', users: 'an account', user_profiles: 'a profile', student_records: 'a student record',
  course_offerings: 'a course', attendance_records: 'attendance', materials: 'a course file',
  transcripts: 'a transcript', app_settings: 'a setting', announcements: 'an announcement',
  invoices: 'an invoice', invoice_lines: 'an invoice charge', payments: 'a payment',
  payment_allocations: 'a payment allocation', receipt_uploads: 'a receipt',
};
const VERB = { INSERT: 'added', UPDATE: 'changed', DELETE: 'removed' } as const;
const EVENTS: Record<string, string> = {
  'transcript.issued': 'issued a transcript',
  'transcript.revoked': 'revoked a transcript',
  'enrollment.cleaned_up': 'removed an archived course from a student record',
  'system.reset': 'reset the portal',
  'user.admin_granted': 'granted admin access',
};
const FIELD_LABELS: Record<string, string> = {
  value: 'Grade', is_incomplete: 'Incomplete', released_at: 'Released', first_name: 'First name', last_name: 'Last name',
  middle_name: 'Middle name', archived_at: 'Archived', staff_category: 'Admin category', student_no: 'Student no.',
  current_year_level: 'Year level', is_excused: 'Excused', instructor_id: 'Teacher', deleted_at: 'Archived',
  year_level: 'Year level', units: 'Units', recorded_by: 'Recorded by', student_id: 'Student',
  user_id: 'Account', updated_by: 'Changed by', deleted_by: 'Archived by', uploaded_by: 'Uploaded by',
};
// Internal identifiers mean nothing to a reader. People (teacher, recorded by, ...) arrive as names.
const PEOPLE = new Set(['recorded_by', 'instructor_id', 'updated_by', 'deleted_by', 'uploaded_by', 'issued_by', 'revoked_by', 'student_id', 'user_id']);
const isInternal = (field: string) => !PEOPLE.has(field)
  && (field === 'id' || field.endsWith('_id') || field === 'firebase_uid' || field === 'created_at' || field === 'content');

const label = (field: string) => FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function describe(e: AuditEntry) {
  if (!e.op) return EVENTS[e.action] ?? e.action.replace(/[._]/g, ' ');
  if (e.table === 'app_settings') return 'changed the settings';
  return `${VERB[e.op]} ${SINGULAR[e.table] ?? e.table}`;
}

const Entry = ({ entry }: { entry: AuditEntry; key?: number }) => {
  const [open, setOpen] = useState(false);
  const fields = entry.changes.filter((c) => !isInternal(c.field));
  const details = entry.op ? fields : Object.entries(entry.data ?? {}).map(([field, to]) => ({ field, from: null, to }));
  const who = entry.actor ? entry.actor.name : entry.source === 'system' ? 'System' : (entry.source ?? 'System');
  return (
    <li className="p-4 md:px-5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-start gap-3 text-left">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-fb-textPrimary break-words">
            <span className="font-bold">{who}</span> {describe(entry)}
            {entry.subject && <span className="text-fb-textSecondary"> · {entry.subject}</span>}
          </p>
          <p className="text-xs text-fb-textSecondary tabular-nums">{when(entry.at)}</p>
        </div>
        {details.length > 0 && <ChevronDown size={16} className={`shrink-0 mt-1 text-fb-textSecondary transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />}
      </button>
      {open && details.length > 0 && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs bg-fb-gray/50 rounded-lg p-3">
          {details.map((c) => (
            <div key={c.field} className="contents">
              <dt className="font-bold text-fb-textSecondary">{label(c.field)}</dt>
              <dd className="text-fb-textPrimary break-words min-w-0">
                {entry.op === 'UPDATE'
                  ? <><span className="line-through text-fb-textSecondary">{show(c.from)}</span> → <span className="font-bold">{show(c.to)}</span></>
                  : show(entry.op === 'DELETE' ? c.from : c.to)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
};

/** `embedded`: shown as a tab in Settings, which already provides the page heading. */
export const AuditLogPage = ({ embedded = false }: { embedded?: boolean }) => {
  const [filter, setFilter] = useState<AuditFilter>({});
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [staff, setStaff] = useState<UserProfile[]>([]);

  useEffect(() => {
    fetchUsers({ status: 'all' }).then((all) => setStaff(all.filter((u) => u.role !== 'student').sort((a, b) => formatName(a).localeCompare(formatName(b))))).catch(() => {});
  }, []);

  useEffect(() => {
    setEntries(null);
    setError('');
    fetchAudit(filter).then((r) => { setEntries(r.entries); setNextBefore(r.nextBefore); }).catch((e) => setError(e.message));
  }, [filter]);

  const loadMore = async () => {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const r = await fetchAudit({ ...filter, before: nextBefore });
      setEntries((prev) => [...(prev ?? []), ...r.entries]);
      setNextBefore(r.nextBefore);
    } catch (e) { setError((e as Error).message); }
    finally { setLoadingMore(false); }
  };

  const set = (patch: Partial<AuditFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const field = 'w-full bg-white border-2 border-fb-gray rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-fb-blue';

  return (
    <div className={`space-y-6 ${embedded ? '' : 'pb-10'}`}>
      <div>
        {!embedded && <h1 className="text-2xl font-black text-fb-textPrimary italic tracking-tight">Audit Log</h1>}
        <p className="text-sm text-fb-textSecondary">Every change to grades, accounts, courses, attendance, files, transcripts, billing and settings: who made it, when, and what changed. Entries can't be edited or deleted.</p>
      </div>
      <Card noPadding>
        <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-4 gap-3 border-b border-fb-border">
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">What</span>
            <select className={field} value={filter.table ?? ''} onChange={(e) => set({ table: e.target.value || undefined })}>
              <option value="">Everything</option>
              {Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">Who</span>
            <select className={field} value={filter.actorId ?? ''} onChange={(e) => set({ actorId: e.target.value || undefined })}>
              <option value="">Anyone</option>
              {staff.map((u) => <option key={u.uid} value={u.uid}>{formatName(u)} ({u.role})</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">From</span>
            <input type="date" className={field} value={filter.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">To</span>
            <input type="date" className={field} value={filter.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
          </label>
        </div>
        {error && <p role="alert" className="p-5 text-sm font-bold text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</p>}
        {!entries && !error && <p className="p-5 text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>}
        {entries && entries.length === 0 && <p className="p-5 text-sm text-fb-textSecondary">No changes match these filters.</p>}
        {entries && entries.length > 0 && (
          <ul className="divide-y divide-fb-border">
            {entries.map((e) => <Entry key={e.id} entry={e} />)}
          </ul>
        )}
        {nextBefore && (
          <div className="p-4 border-t border-fb-border text-center">
            <button type="button" onClick={loadMore} disabled={loadingMore}
              className="px-5 py-2 rounded-xl bg-fb-gray hover:bg-fb-hover text-xs font-black uppercase tracking-widest disabled:opacity-50">
              {loadingMore ? 'Loading…' : 'Show older'}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
};
