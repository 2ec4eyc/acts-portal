import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';

import { NotificationIcon } from './NotificationBell';
import { fetchNotifications, markNotificationsRead, timeAgo, type Notification } from '../lib/inbox';
import { live } from '../lib/live';

const FIRST = 5;

/** The person's notifications as a dashboard card (same data as the bell; opening one marks it read). */
export const NotificationsPanel = ({ onOpenLink }: { onOpenLink: (page: string) => void }) => {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [all, setAll] = useState(false);
  useEffect(() => live(fetchNotifications, (r) => { setItems(r.items); setUnread(r.unread); }, () => setItems([])), []);

  // Unread first, newest first within each group.
  const sorted = [...(items ?? [])].sort((a, b) => Number(!!a.readAt) - Number(!!b.readAt) || b.createdAt.localeCompare(a.createdAt));
  const shown = all ? sorted : sorted.slice(0, FIRST);
  const open = async (n: Notification) => {
    if (!n.readAt) await markNotificationsRead([n.id]).catch(() => {});
    if (n.link) onOpenLink(n.link);
  };

  return (
    <section aria-labelledby="dash-notifications-title" className="h-full flex flex-col bg-white rounded-2xl border border-fb-border shadow-sm text-left">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-fb-border">
        <h2 id="dash-notifications-title" className="flex-1 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-fb-textPrimary">
          <Bell size={16} className="text-fb-blue" aria-hidden="true" /> Notifications
          {unread > 0 && <span className="px-2 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-black tabular-nums">{unread} new</span>}
        </h2>
        {unread > 0 && (
          <button type="button" onClick={() => markNotificationsRead('all').catch(() => {})}
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-fb-blue hover:underline">
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>
      {items === null ? <p className="px-5 py-6 text-sm text-fb-textSecondary">Loading…</p>
        : items.length === 0 ? <p className="px-5 py-6 text-sm text-fb-textSecondary">You're all caught up.</p> : (
          <>
            <ul className="flex-1 max-h-[28rem] overflow-y-auto overscroll-contain divide-y divide-fb-border">
              {shown.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => open(n)} className={`w-full text-left px-5 py-3 flex gap-3 hover:bg-fb-hover/60 ${n.readAt ? '' : 'bg-fb-blue/5'}`}>
                    <NotificationIcon n={n} />
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
            {sorted.length > FIRST && (
              <button type="button" onClick={() => setAll(!all)} aria-expanded={all}
                className="w-full px-5 py-3 border-t border-fb-border text-[10px] font-black uppercase tracking-widest text-fb-blue hover:bg-fb-hover/60">
                {all ? 'Show fewer' : `Show all (${sorted.length})`}
              </button>
            )}
          </>
        )}
    </section>
  );
};
