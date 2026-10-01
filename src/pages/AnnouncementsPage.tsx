import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, Pin, PinOff, Pencil, RefreshCw, Trash2 } from 'lucide-react';

import { Card } from '../components/Card';
import { ConfirmModal } from '../components/modals/ConfirmModal';
import { fetchCourses, fetchUsers } from '../lib/data';
import {
  createAnnouncement, deleteAnnouncement, fetchAllAnnouncements, formatWhen, ROLE_LABELS, updateAnnouncement,
  type Announcement, type AnnouncementInput, type ApiRole,
} from '../lib/inbox';
import { live } from '../lib/live';
import type { Course } from '../types';

const ROLES = Object.keys(ROLE_LABELS) as ApiRole[];
const EMPTY: AnnouncementInput = {
  title: '', body: '', audienceRoles: ['student'], cohort: null, offeringId: null, pinned: false, publishAt: null, expiresAt: null,
};
// <input type="datetime-local"> works in local time without a zone.
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

const STATUS_STYLE = {
  live: 'bg-emerald-100 text-emerald-700', scheduled: 'bg-amber-100 text-amber-800', expired: 'bg-fb-gray text-fb-textSecondary',
} as const;

export const AnnouncementsPage = () => {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [form, setForm] = useState<AnnouncementInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const [batches, setBatches] = useState<string[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => live(fetchAllAnnouncements, setItems, (e) => setError((e as Error).message)), []);
  useEffect(() => {
    fetchUsers({ role: 'student' }).then((s) => setBatches([...new Set(s.map((u) => u.batchName).filter((b): b is string => !!b))].sort())).catch(() => {});
    fetchCourses().then(setCourses).catch(() => {});
  }, []);
  const courseLabel = useMemo(() => new Map(courses.map((c) => [c.id, `${c.name} · ${c.yearLevel}, ${c.semester}${c.schoolYear ? ` · ${c.schoolYear}` : ''}`])), [courses]);

  const set = (patch: Partial<AnnouncementInput>) => setForm((f) => ({ ...f, ...patch }));
  const toggleRole = (r: ApiRole) => set({ audienceRoles: form.audienceRoles.includes(r) ? form.audienceRoles.filter((x) => x !== r) : [...form.audienceRoles, r] });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setNotice('');
    if (!form.audienceRoles.length) { setError('Choose at least one group to send it to.'); return; }
    setSaving(true);
    try {
      if (editingId) { await updateAnnouncement(editingId, form); setNotice('Announcement updated.'); }
      else { await createAnnouncement(form); setNotice(form.publishAt && new Date(form.publishAt) > new Date() ? 'Announcement scheduled.' : 'Announcement posted.'); }
      setForm(EMPTY); setEditingId(null);
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  const edit = (a: Announcement) => {
    setEditingId(a.id);
    setForm({ title: a.title, body: a.body, audienceRoles: a.audienceRoles, cohort: a.cohort, offeringId: a.offeringId, pinned: a.pinned, publishAt: a.publishAt, expiresAt: a.expiresAt });
    setNotice(''); setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const input = 'w-full bg-white border-2 border-fb-gray rounded-xl px-3 py-2.5 text-sm outline-none focus:border-fb-blue';
  const labelCls = 'text-[10px] font-black uppercase tracking-widest text-fb-textSecondary';

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-black text-fb-textPrimary italic tracking-tight">Announcements</h1>
        <p className="text-sm text-fb-textSecondary">Post to students, teachers or staff. They appear on each person's dashboard.</p>
      </div>

      <Card title={editingId ? 'Edit announcement' : 'New announcement'}>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1">
            <span className={labelCls}>Title</span>
            <input className={input} name="title" required maxLength={200} value={form.title} onChange={(e) => set({ title: e.target.value })} autoComplete="off" />
          </label>
          <label className="block space-y-1">
            <span className={labelCls}>Message</span>
            <textarea className={`${input} min-h-28`} name="body" required maxLength={5000} value={form.body} onChange={(e) => set({ body: e.target.value })} />
          </label>
          <fieldset className="space-y-2">
            <legend className={labelCls}>Send to</legend>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <label key={r} className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer text-sm font-bold ${form.audienceRoles.includes(r) ? 'border-fb-blue bg-fb-blue/5 text-fb-blue' : 'border-fb-gray text-fb-textSecondary'}`}>
                  <input type="checkbox" className="accent-fb-blue" checked={form.audienceRoles.includes(r)} onChange={() => toggleRole(r)} />
                  {ROLE_LABELS[r]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className={labelCls}>Only students in batch (optional)</span>
              <select className={input} value={form.cohort ?? ''} onChange={(e) => set({ cohort: e.target.value || null })}>
                <option value="">All batches</option>
                {batches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>Only one course (optional)</span>
              <select className={input} value={form.offeringId ?? ''} onChange={(e) => set({ offeringId: e.target.value || null })}>
                <option value="">All courses</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{courseLabel.get(c.id)}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>Publish at (optional, default now)</span>
              <input type="datetime-local" className={input} value={toLocalInput(form.publishAt)} onChange={(e) => set({ publishAt: fromLocalInput(e.target.value) })} />
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>Hide after (optional)</span>
              <input type="datetime-local" className={input} value={toLocalInput(form.expiresAt)} onChange={(e) => set({ expiresAt: fromLocalInput(e.target.value) })} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-fb-textPrimary">
            <input type="checkbox" className="accent-fb-blue w-4 h-4" checked={form.pinned} onChange={(e) => set({ pinned: e.target.checked })} />
            Pin to the top
          </label>
          {error && <p role="alert" className="text-sm font-bold text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</p>}
          {notice && <p role="status" className="text-sm font-bold text-emerald-700">{notice}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-fb-blue text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2">
              {saving && <RefreshCw size={12} className="animate-spin" />} {editingId ? 'Save changes' : 'Post'}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }} className="px-5 py-2.5 rounded-xl border border-fb-border text-xs font-black uppercase tracking-widest">Cancel</button>
            )}
          </div>
        </form>
      </Card>

      <Card title="All announcements" noPadding>
        {!items ? (
          <p className="p-5 text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-5 text-sm text-fb-textSecondary">Nothing posted yet.</p>
        ) : (
          <ul className="divide-y divide-fb-border">
            {items.map((a) => (
              <li key={a.id} className="p-4 md:p-5 flex flex-col md:flex-row gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-bold text-fb-textPrimary break-words flex items-center gap-2 flex-wrap">
                    {a.pinned && <Pin size={14} className="text-fb-blue" aria-label="Pinned" />}
                    {a.title}
                    {a.status && <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${STATUS_STYLE[a.status]}`}>{a.status}</span>}
                  </p>
                  <p className="text-xs text-fb-textSecondary break-words">
                    To {a.audienceRoles.map((r) => ROLE_LABELS[r]).join(', ')}
                    {a.cohort ? ` · ${a.cohort}` : ''}{a.courseName ? ` · ${a.courseName}` : ''}
                    {' · '}{a.status === 'scheduled' ? 'publishes' : 'posted'} {formatWhen(a.publishAt)}
                    {a.expiresAt ? ` · hides ${formatWhen(a.expiresAt)}` : ''}
                    {' · '}read by {a.readCount ?? 0}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => updateAnnouncement(a.id, { pinned: !a.pinned }).catch((e) => setError(e.message))}
                    className="px-3 py-2 rounded-lg border border-fb-border text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-fb-hover">
                    {a.pinned ? <PinOff size={12} /> : <Pin size={12} />} {a.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button type="button" onClick={() => edit(a)} className="px-3 py-2 rounded-lg border border-fb-border text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-fb-hover">
                    <Pencil size={12} /> Edit
                  </button>
                  <button type="button" onClick={() => setDeleting(a)} className="px-3 py-2 rounded-lg border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-red-50">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmModal
        isOpen={!!deleting}
        title="Delete announcement?"
        message={`"${deleting?.title ?? ''}" will disappear from everyone's dashboard.`}
        confirmText="Delete"
        variant="danger"
        onConfirm={async () => { const a = deleting!; setDeleting(null); await deleteAnnouncement(a.id).catch((e) => setError(e.message)); }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
};
