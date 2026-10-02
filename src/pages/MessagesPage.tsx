import { useEffect, useState } from 'react';
import { AlertCircle, Lock, MessageSquarePlus, RefreshCw, Unlock, X } from 'lucide-react';

import { ChatThread } from '../components/ChatThread';
import { fetchInbox, fetchMyThread, setThreadStatus, startThread, type InboxThread, type MyThread } from '../lib/chat';
import { fetchUsers } from '../lib/data';
import { formatName } from '../lib/format';
import { live, refreshAll } from '../lib/live';
import type { UserProfile } from '../types';

const when = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** A student's or teacher's one thread with the school office. */
export const MemberMessages = ({ teacher = false }: { teacher?: boolean }) => {
  const [t, setT] = useState<MyThread | null>(null);
  const [error, setError] = useState('');
  useEffect(() => live(fetchMyThread, setT, (e) => setError((e as Error).message)), []);
  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-black text-fb-textPrimary italic tracking-tight">Messages</h1>
        <p className="text-sm text-fb-textSecondary">{teacher
          ? 'Message the school office about your classes, rooms, equipment, schedules or anything else. Replies appear here and in your notifications.'
          : 'Ask the school office about enrollment, billing, schedules or anything else. Replies appear here and in your notifications.'}</p>
      </div>
      {error && <p role="alert" className="text-sm font-bold text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</p>}
      {!t && !error && <p className="text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>}
      {t && (
        <ChatThread id={t.id} title="School office" subtitle="Any staff member in the office can reply."
          blocked={!t.chatEnabled ? 'Messaging is turned off for now. You can still read your messages.'
            : t.status === 'closed' ? 'This conversation was closed by the school office.' : null} />
      )}
    </div>
  );
};

const NewThread = ({ onPick, onClose }: { onPick: (studentId: string) => void; onClose: () => void }) => {
  const [students, setStudents] = useState<UserProfile[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    Promise.all([fetchUsers({ role: 'student' }), fetchUsers({ role: 'teacher' })])
      .then(([s, t]) => setStudents([...s, ...t].sort((a, b) => formatName(a).localeCompare(formatName(b)))))
      .catch(() => setStudents([]));
  }, []);
  const shown = (students ?? []).filter((s) => `${formatName(s)} ${s.role} ${s.studentId ?? ''} ${s.batchName ?? ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  return (
    <div className="border-b border-fb-border p-3 space-y-2 bg-fb-gray/30">
      <div className="flex items-center gap-2">
        <input autoFocus type="search" aria-label="Find a student or teacher" placeholder="Find a student or teacher…" value={q} onChange={(e) => setQ(e.target.value)}
          className="flex-1 min-w-0 bg-white border-2 border-fb-gray rounded-xl px-3 py-2 text-sm outline-none focus:border-fb-blue" />
        <button type="button" onClick={onClose} aria-label="Cancel" className="p-2 rounded-lg hover:bg-fb-hover"><X size={16} /></button>
      </div>
      <ul className="max-h-60 overflow-y-auto divide-y divide-fb-border bg-white rounded-xl border border-fb-border">
        {!students && <li className="p-3 text-sm text-fb-textSecondary">Loading…</li>}
        {students && shown.length === 0 && <li className="p-3 text-sm text-fb-textSecondary">No one found.</li>}
        {shown.map((s) => (
          <li key={s.uid}>
            <button type="button" onClick={() => onPick(s.uid)} className="w-full text-left px-3 py-2 hover:bg-fb-hover">
              <span className="font-bold text-sm">{formatName(s)}</span>
              <span className="block text-xs text-fb-textSecondary">{s.role === 'teacher' ? 'Teacher' : [s.studentId, s.batchName].filter(Boolean).join(' · ') || 'Student'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** The school office's shared inbox: every student and teacher thread, answered by any admin. */
export const OfficeMessages = () => {
  const [threads, setThreads] = useState<InboxThread[] | null>(null);
  const [q, setQ] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [role, setRole] = useState<'' | 'student' | 'teacher'>('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => live(() => fetchInbox({ q, unread: unreadOnly, role: role || undefined }), setThreads, (e) => setError((e as Error).message), 15_000), [q, unreadOnly, role]);
  const open = threads?.find((t) => t.id === openId) ?? null;

  const pick = async (studentId: string) => {
    try { const { id } = await startThread(studentId); setPicking(false); setOpenId(id); refreshAll(); }
    catch (e) { setError((e as Error).message); }
  };
  const toggleStatus = async () => {
    if (!open) return;
    try { await setThreadStatus(open.id, open.status === 'open' ? 'closed' : 'open'); refreshAll(); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-black text-fb-textPrimary italic tracking-tight">Messages</h1>
        <p className="text-sm text-fb-textSecondary">Students' and teachers' messages to the school office. Every admin sees the same inbox; a dot means they're waiting for a reply.</p>
      </div>
      {error && <p role="alert" className="text-sm font-bold text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
        <section aria-label="Inbox" className={`bg-white rounded-xl border border-fb-border shadow-sm overflow-hidden ${open ? 'hidden lg:block' : ''}`}>
          <div className="p-3 border-b border-fb-border space-y-2">
            <div className="flex gap-2">
              <input type="search" aria-label="Search conversations" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)}
                className="flex-1 min-w-0 bg-white border-2 border-fb-gray rounded-xl px-3 py-2 text-sm outline-none focus:border-fb-blue" />
              <button type="button" onClick={() => setPicking(true)} aria-label="New message" title="New message"
                className="shrink-0 px-3 rounded-xl bg-fb-blue text-white"><MessageSquarePlus size={16} /></button>
            </div>
            <div role="group" aria-label="Show" className="flex gap-1">
              {([['', 'All'], ['student', 'Students'], ['teacher', 'Teachers']] as const).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={role === v} onClick={() => setRole(v)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${role === v ? 'bg-fb-blue text-white' : 'bg-fb-gray text-fb-textSecondary'}`}>{label}</button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-fb-textPrimary">
              <input type="checkbox" className="accent-fb-blue w-4 h-4" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              Waiting for a reply only
            </label>
          </div>
          {picking && <NewThread onPick={pick} onClose={() => setPicking(false)} />}
          {!threads && <p className="p-4 text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>}
          {threads?.length === 0 && <p className="p-4 text-sm text-fb-textSecondary">{q || unreadOnly || role ? 'No matching conversations.' : 'No messages yet.'}</p>}
          <ul className="divide-y divide-fb-border max-h-[65vh] overflow-y-auto">
            {threads?.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => setOpenId(t.id)} aria-current={t.id === openId}
                  className={`w-full text-left px-3 py-3 flex gap-2 hover:bg-fb-hover ${t.id === openId ? 'bg-fb-blue/5' : ''}`}>
                  <span aria-hidden="true" className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${t.unread ? 'bg-fb-blue' : 'bg-transparent'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={`truncate text-sm ${t.unread ? 'font-black' : 'font-bold'}`}>{t.studentName}</span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${t.role === 'teacher' ? 'bg-violet-100 text-violet-800' : 'bg-fb-gray text-fb-textSecondary'}`}>{t.role === 'teacher' ? 'Teacher' : 'Student'}</span>
                      {t.status === 'closed' && <Lock size={11} className="shrink-0 text-fb-textSecondary" aria-label="Closed" />}
                      <span className="ml-auto shrink-0 text-[11px] text-fb-textSecondary">{when(t.lastMessageAt)}</span>
                    </span>
                    <span className="block truncate text-xs text-fb-textSecondary">
                      {t.preview ? `${t.lastSenderRole === 'admin' ? 'Office: ' : ''}${t.preview}` : 'No messages yet'}
                    </span>
                    {t.unread && <span className="sr-only">Waiting for a reply</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        {open ? (
          <div className="min-w-0 space-y-2">
            <button type="button" onClick={() => setOpenId(null)} className="lg:hidden text-xs font-black uppercase tracking-widest text-fb-blue">← All conversations</button>
            <ChatThread id={open.id} title={open.studentName} subtitle={[open.studentNo, open.cohort].filter(Boolean).join(' · ') || undefined}
              blocked={null}
              actions={(
                <button type="button" onClick={toggleStatus} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-fb-border text-[10px] font-black uppercase tracking-wider hover:bg-fb-hover">
                  {open.status === 'open' ? <><Lock size={12} /> Close</> : <><Unlock size={12} /> Reopen</>}
                </button>
              )} />
            {open.status === 'closed' && <p className="text-xs text-fb-textSecondary">Closed: the student can read but not reply. The office can still write.</p>}
          </div>
        ) : (
          <p className="hidden lg:flex items-center justify-center h-40 text-sm text-fb-textSecondary bg-white rounded-xl border border-dashed border-fb-border">Choose a conversation.</p>
        )}
      </div>
    </div>
  );
};
