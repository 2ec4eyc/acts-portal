import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { AlertCircle, RefreshCw, Send } from 'lucide-react';

import { MAX_MESSAGE, useThread, type ChatMessage } from '../lib/chat';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** One conversation: messages grouped by day, older pages on demand, and a composer (or why not). */
export const ChatThread = ({ id, title, subtitle, blocked, actions }: {
  id: string;
  title: string;
  subtitle?: string;
  /** Why this person can't write right now (chat off, thread closed); null = can write. */
  blocked: string | null;
  actions?: ReactNode;
}) => {
  const { messages, hasOlder, error, loadOlder, send } = useThread(id);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);       // follow new messages unless the reader scrolled up
  const keepFrom = useRef<number | null>(null);

  useEffect(() => { setDraft(''); setSendError(''); stick.current = true; }, [id]);

  useLayoutEffect(() => {
    const el = list.current;
    if (!el || !messages) return;
    if (keepFrom.current !== null) { el.scrollTop = el.scrollHeight - keepFrom.current; keepFrom.current = null; return; }
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true); setSendError('');
    try { await send(body); setDraft(''); stick.current = true; }
    catch (err) { setSendError((err as Error).message); }
    finally { setSending(false); }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
  };
  const older = async () => {
    setLoadingOlder(true);
    keepFrom.current = list.current ? list.current.scrollHeight - list.current.scrollTop : null;
    try { await loadOlder(); } finally { setLoadingOlder(false); }
  };

  const groups: { day: string; items: ChatMessage[] }[] = [];
  for (const m of messages ?? []) {
    const d = day(m.createdAt);
    if (groups.at(-1)?.day === d) groups.at(-1)!.items.push(m); else groups.push({ day: d, items: [m] });
  }

  return (
    <section className="bg-white rounded-xl border border-fb-border shadow-sm flex flex-col h-[70vh] min-h-[420px] min-w-0" aria-label={`Conversation: ${title}`}>
      <header className="px-4 md:px-5 py-3 border-b border-fb-border flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-fb-textPrimary truncate">{title}</h2>
          {subtitle && <p className="text-xs text-fb-textSecondary truncate">{subtitle}</p>}
        </div>
        {actions}
      </header>
      <div ref={list} role="log" aria-live="polite" aria-label="Messages"
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        className="flex-1 overflow-y-auto px-3 md:px-5 py-4 space-y-4 bg-fb-gray/30">
        {hasOlder && (
          <div className="text-center">
            <button type="button" onClick={older} disabled={loadingOlder} className="px-3 py-1.5 rounded-lg border border-fb-border bg-white text-[10px] font-black uppercase tracking-wider hover:bg-fb-hover disabled:opacity-50">
              {loadingOlder ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}
        {!messages && !error && <p className="text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>}
        {messages?.length === 0 && <p className="text-sm text-fb-textSecondary text-center py-10">No messages yet.</p>}
        {groups.map((g) => (
          <div key={g.day} className="space-y-2">
            <p className="text-center text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">{g.day}</p>
            {g.items.map((m) => (
              <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-3.5 py-2 ${m.mine ? 'bg-fb-blue text-white rounded-br-md' : 'bg-white border border-fb-border rounded-bl-md'}`}>
                  {!m.mine && <p className="text-[11px] font-bold text-fb-textSecondary">{m.senderName}{m.fromOffice ? ' · School office' : ''}</p>}
                  <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`text-[10px] mt-0.5 text-right ${m.mine ? 'text-white/80' : 'text-fb-textSecondary'}`}>{time(m.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {error && <p role="alert" className="px-4 py-2 text-xs font-bold text-red-700 flex items-center gap-2 border-t border-fb-border"><AlertCircle size={14} /> {error}</p>}
      {blocked ? (
        <p className="px-4 py-3 border-t border-fb-border text-sm font-semibold text-fb-textSecondary bg-fb-gray/40">{blocked}</p>
      ) : (
        <form onSubmit={submit} className="border-t border-fb-border p-3 flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label htmlFor={`compose-${id}`} className="sr-only">Message</label>
            <textarea id={`compose-${id}`} rows={2} maxLength={MAX_MESSAGE} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey}
              placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
              className="w-full resize-none bg-white border-2 border-fb-gray rounded-xl px-3 py-2 text-sm outline-none focus:border-fb-blue" />
            <div className="flex justify-between text-[10px] text-fb-textSecondary">
              <span role={sendError ? 'alert' : undefined} className="text-red-700 font-bold">{sendError}</span>
              {draft.length > MAX_MESSAGE - 500 && <span className="tabular-nums">{draft.length}/{MAX_MESSAGE}</span>}
            </div>
          </div>
          <button type="submit" disabled={sending || !draft.trim()} aria-label="Send message"
            className="mb-4 shrink-0 px-4 py-2.5 bg-fb-blue text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-1.5">
            {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />} <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      )}
    </section>
  );
};
