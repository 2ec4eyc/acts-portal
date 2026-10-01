// Chat with the school office. Server: server/lib/chat.ts. No outside service: an open thread asks for
// messages newer than the last one it has, every 5 s (15 s after two quiet minutes), only while visible.
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from './api';
import { refreshAll } from './live';

export const MAX_MESSAGE = 4000;

export interface ChatMessage { id: number; body: string; createdAt: string; senderName: string; fromOffice: boolean; mine: boolean }
export interface MyThread { id: string; studentId: string; status: 'open' | 'closed'; lastMessageAt: string | null; unread: boolean; chatEnabled: boolean }
export interface InboxThread {
  id: string; studentId: string; status: 'open' | 'closed'; lastMessageAt: string | null; unread: boolean;
  studentName: string; studentNo: string | null; cohort: string | null; lastSenderRole: 'student' | 'admin' | null; preview: string | null;
}

export const fetchMyThread = () => api<MyThread>('chat/conversations');
export const fetchInbox = (f: { q?: string; unread?: boolean; status?: 'open' | 'closed' } = {}) =>
  api<InboxThread[]>('chat/conversations', { query: { q: f.q || undefined, unread: f.unread ? 'true' : undefined, status: f.status } });
export const startThread = (studentId: string) => api<{ id: string }>('chat/conversations', { method: 'POST', body: { studentId } });
export const setThreadStatus = (id: string, status: 'open' | 'closed') =>
  api<{ status: string }>(`chat/conversations/${id}`, { method: 'PATCH', body: { status } });
export const fetchMessages = (id: string, q: { after?: number; before?: number } = {}) =>
  api<{ messages: ChatMessage[]; more: boolean }>(`chat/conversations/${id}/messages`, {
    query: { after: q.after !== undefined ? String(q.after) : undefined, before: q.before !== undefined ? String(q.before) : undefined },
  });
export const sendMessage = (id: string, body: string) =>
  api<{ id: number; createdAt: string }>(`chat/conversations/${id}/messages`, { method: 'POST', body: { body } });
export const markThreadRead = (id: string) => api(`chat/conversations/${id}/read`, { method: 'POST' });
export const fetchChatUnread = () => api<{ count: number }>('chat/unread');

const FAST_MS = 5_000;
const SLOW_MS = 15_000;
const QUIET_MS = 2 * 60_000;

/**
 * Messages of one thread, kept current: loads the newest page, then polls for newer ones (fast while
 * the conversation is active, slower when quiet, paused while the tab is hidden). Marks the thread
 * read whenever new messages arrive while it's on screen.
 */
export function useThread(id: string | null) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState('');
  const lastId = useRef(0);
  const lastActivity = useRef(Date.now());
  const busy = useRef(false);

  const add = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
    lastActivity.current = Date.now();
    setMessages((prev) => {
      const seen = new Set((prev ?? []).map((m) => m.id));
      return [...(prev ?? []), ...incoming.filter((m) => !seen.has(m.id))];
    });
  }, []);

  const poll = useCallback(async () => {
    if (!id || busy.current || document.visibilityState !== 'visible') return;
    busy.current = true;
    try {
      const r = await fetchMessages(id, { after: lastId.current });
      if (r.messages.length) {
        add(r.messages);
        if (r.messages.some((m) => !m.mine)) { await markThreadRead(id).catch(() => {}); refreshAll(); }
      }
      setError('');
    } catch (e) { setError((e as Error).message); }
    finally { busy.current = false; }
  }, [id, add]);

  useEffect(() => {
    setMessages(null); setHasOlder(false); setError(''); lastId.current = 0; lastActivity.current = Date.now();
    if (!id) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    fetchMessages(id).then(async (r) => {
      if (stopped) return;
      lastId.current = r.messages.at(-1)?.id ?? 0;
      setMessages(r.messages); setHasOlder(r.more);
      await markThreadRead(id).catch(() => {});
      refreshAll();
    }).catch((e) => setError((e as Error).message));
    const loop = () => {
      timer = setTimeout(async () => {
        await poll();
        if (!stopped) loop();
      }, Date.now() - lastActivity.current > QUIET_MS ? SLOW_MS : FAST_MS);
    };
    loop();
    const onVisible = () => { if (document.visibilityState === 'visible') { lastActivity.current = Date.now(); void poll(); } };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      stopped = true; clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [id, poll]);

  const loadOlder = useCallback(async () => {
    if (!id || !messages?.length) return;
    const r = await fetchMessages(id, { before: messages[0].id });
    setMessages((prev) => [...r.messages, ...(prev ?? [])]);
    setHasOlder(r.more);
  }, [id, messages]);

  const send = useCallback(async (body: string) => {
    if (!id) return;
    await sendMessage(id, body);
    lastActivity.current = Date.now();
    await poll();
    refreshAll();
  }, [id, poll]);

  return { messages, hasOlder, error, loadOlder, send };
}

// ---------- archive (Settings → Storage) ----------
export interface ArchiveSummary {
  before: string; olderMessages: number; olderConversations: number; olderBytes: number; oldestAt: string | null;
  totalMessages: number; totalBytes: number;
}
export interface ArchivedMessage {
  id: number; createdAt: string; body: string; conversationId: string;
  studentName: string; studentNo: string | null; senderName: string; fromOffice: boolean;
}
export const fetchArchiveSummary = (before: string) => api<ArchiveSummary>('chat/archive', { query: { before } });
export async function fetchArchive(before: string, onProgress: (n: number) => void) {
  const all: ArchivedMessage[] = [];
  let afterId = 0;
  for (;;) {
    const r = await api<{ messages: ArchivedMessage[]; nextAfterId: number | null }>('chat/archive/messages', { query: { before, afterId: String(afterId) } });
    all.push(...r.messages);
    onProgress(all.length);
    if (r.nextAfterId === null) return all;
    afterId = r.nextAfterId;
  }
}
export const purgeArchive = (before: string, expectedCount: number) =>
  api<{ removed: number }>('chat/archive/purge', { method: 'POST', body: { before, expectedCount } });

const manila = (iso: string) => new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** All archived messages as CSV (UTF-8 with a byte-order mark so Excel reads accents and ₱ correctly). */
export function archiveCsv(rows: ArchivedMessage[]) {
  const lines = [['Date and time (Manila)', 'Student', 'Student no.', 'From', 'Message'].join(',')];
  for (const m of rows) {
    lines.push([manila(m.createdAt), m.studentName, m.studentNo ?? '', m.fromOffice ? `${m.senderName} (school office)` : m.senderName, m.body]
      .map(csvCell).join(','));
  }
  return new Blob(['﻿', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

/** A readable PDF: a cover page, then each student's conversation in order. */
export async function archivePdf(rows: ArchivedMessage[], before: string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48;
  let y = M;
  const need = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const threads = new Map<string, ArchivedMessage[]>();
  for (const m of rows) threads.set(m.conversationId, [...(threads.get(m.conversationId) ?? []), m]);
  const ordered = [...threads.values()].sort((a, b) => a[0].studentName.localeCompare(b[0].studentName));

  doc.setFont('helvetica', 'bold').setFontSize(18).text('ACTS Portal: chat archive', M, y); y += 28;
  doc.setFont('helvetica', 'normal').setFontSize(11);
  const first = rows[0]?.createdAt ? manila(rows[0].createdAt) : '-';
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  for (const line of [`Messages sent before ${before} (Manila time)`, `Earliest message: ${first}`,
    `${plural(rows.length, 'message')} in ${plural(ordered.length, 'conversation')}`, `Exported ${manila(new Date().toISOString())}`]) {
    doc.text(line, M, y); y += 16;
  }
  for (const thread of ordered) {
    doc.addPage(); y = M;
    const s = thread[0];
    doc.setFont('helvetica', 'bold').setFontSize(14).text(`${s.studentName}${s.studentNo ? ` (${s.studentNo})` : ''}`, M, y); y += 22;
    for (const m of thread) {
      // jsPDF's built-in fonts are Latin-1; keep the text readable if someone typed emoji.
      const body = m.body.replace(/[^\u0000-ÿ₱]/g, '?').replace(/₱/g, 'PHP ');
      const lines = doc.setFontSize(10).splitTextToSize(body, W - 2 * M - 12) as string[];
      need(16 + lines.length * 13);
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(90)
        .text(`${m.fromOffice ? `${m.senderName} (school office)` : m.senderName} · ${manila(m.createdAt)}`, M, y);
      y += 13;
      doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(20);
      for (const line of lines) { need(13); doc.text(line, M + 12, y); y += 13; }
      y += 8;
    }
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i).setFont('helvetica', 'normal').setFontSize(8).setTextColor(120).text(`Page ${i} of ${pages}`, W - M, H - 24, { align: 'right' });
  }
  return doc.output('blob');
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
