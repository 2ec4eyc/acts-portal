import { useEffect, useState } from 'react';
import { Megaphone, Pin } from 'lucide-react';

import { fetchAnnouncementFeed, formatWhen, markAnnouncementRead, type Announcement } from '../lib/inbox';
import { live } from '../lib/live';

/**
 * Announcements for the signed-in person, pinned first. Opening an unread one marks it read.
 * Hidden when there are none, unless `alwaysShow` (the dashboard), which shows an empty card instead.
 */
export const AnnouncementsFeed = ({ alwaysShow = false }: { alwaysShow?: boolean }) => {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => live(fetchAnnouncementFeed, setItems, () => setItems([])), []);

  if (!alwaysShow && (!items || items.length === 0)) return null;

  const toggle = (a: Announcement) => {
    setOpenId(openId === a.id ? null : a.id);
    if (!a.read) markAnnouncementRead(a.id).catch(() => {});
  };

  return (
    <section aria-labelledby="announcements-title" className="h-full flex flex-col bg-white rounded-2xl border border-fb-border shadow-sm text-left">
      <h2 id="announcements-title" className="flex items-center gap-2 px-5 py-4 border-b border-fb-border text-sm font-black uppercase tracking-widest text-fb-textPrimary">
        <Megaphone size={16} className="text-fb-blue" aria-hidden="true" /> Announcements
      </h2>
      {(!items || items.length === 0) && <p className="px-5 py-6 text-sm text-fb-textSecondary">{items ? 'No announcements yet.' : 'Loading…'}</p>}
      <ul className="flex-1 max-h-[28rem] overflow-y-auto overscroll-contain divide-y divide-fb-border">
        {(items ?? []).map((a) => {
          const open = openId === a.id;
          return (
            <li key={a.id}>
              <button type="button" onClick={() => toggle(a)} aria-expanded={open} className="w-full text-left px-5 py-4 hover:bg-fb-hover/60">
                <span className="flex items-start gap-2">
                  {a.pinned && <Pin size={14} className="text-fb-blue shrink-0 mt-1" aria-label="Pinned" />}
                  <span className={`flex-1 min-w-0 break-words text-fb-textPrimary ${a.read ? 'font-semibold' : 'font-black'}`}>{a.title}</span>
                  {!a.read && <span className="px-2 py-0.5 rounded-md bg-fb-blue text-white text-[9px] font-black uppercase tracking-widest shrink-0">New</span>}
                </span>
                <span className="block text-xs text-fb-textSecondary mt-1">
                  {formatWhen(a.publishAt)}{a.author ? ` · ${a.author}` : ''}
                  {a.courseName ? ` · ${a.courseName}` : ''}{a.cohort ? ` · ${a.cohort}` : ''}
                </span>
                <span className={`block text-sm text-fb-textPrimary mt-2 whitespace-pre-wrap break-words ${open ? '' : 'line-clamp-2'}`}>{a.body}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
