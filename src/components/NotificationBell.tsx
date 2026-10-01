import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, CheckCheck, MessageCircle, X } from 'lucide-react';

import { fetchNotifications, markNotificationsRead, timeAgo, type Notification } from '../lib/inbox';
import { live } from '../lib/live';

/** The bell with an unread count; opens the person's notifications. Refreshes every 30 s and on focus. */
export const NotificationBell = ({ onOpenLink }: { onOpenLink: (page: string) => void }) => {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => live(fetchNotifications, (r) => { setItems(r.items); setUnread(r.unread); }, () => {}), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => { if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick); };
  }, [open]);

  const openItem = async (n: Notification) => {
    if (!n.readAt) await markNotificationsRead([n.id]).catch(() => {});
    setOpen(false);
    if (n.link) onOpenLink(n.link);
  };

  return (
    <div ref={panel} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative p-2.5 rounded-full bg-white border border-fb-border shadow-sm hover:bg-fb-hover transition-colors"
      >
        <Bell size={20} className="text-fb-textPrimary" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto overscroll-contain bg-white rounded-2xl shadow-2xl border border-fb-border z-50">
          <div className="sticky top-0 bg-white flex items-center gap-2 px-4 py-3 border-b border-fb-border">
            <p className="flex-1 text-sm font-black text-fb-textPrimary">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={() => markNotificationsRead('all')} className="flex items-center gap-1 text-xs font-bold text-fb-blue hover:underline">
                <CheckCheck size={14} aria-hidden="true" /> Mark all read
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded-full hover:bg-fb-hover"><X size={16} /></button>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fb-textSecondary">You're all caught up.</p>
          ) : (
            <ul className="divide-y divide-fb-border">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => openItem(n)} className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-fb-hover ${n.readAt ? '' : 'bg-fb-blue/5'}`}>
                    {n.kind === 'message'
                      ? <MessageCircle size={18} aria-hidden="true" className="shrink-0 mt-0.5 text-fb-blue" />
                      : <AlertTriangle size={18} aria-hidden="true" className={`shrink-0 mt-0.5 ${n.kind === 'attendance_escalation' ? 'text-red-600' : 'text-amber-600'}`} />}
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className={`text-sm text-fb-textPrimary break-words ${n.readAt ? 'font-semibold' : 'font-black'}`}>{n.title}</span>
                        {!n.readAt && <span className="w-2 h-2 rounded-full bg-fb-blue shrink-0" aria-label="Unread" />}
                      </span>
                      <span className="block text-xs text-fb-textSecondary break-words">{n.body}</span>
                      <span className="block text-[10px] text-fb-textSecondary mt-1">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
