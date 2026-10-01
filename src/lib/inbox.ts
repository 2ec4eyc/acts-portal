// Notifications (the bell) and announcements. Server side: server/lib/notifications.ts, announcements.ts.
import { api } from './api';
import { refreshAll } from './live';

export interface Notification {
  id: number; kind: string; title: string; body: string; link: string | null;
  readAt: string | null; createdAt: string;
}
export const fetchNotifications = () => api<{ items: Notification[]; unread: number }>('notifications');
export async function markNotificationsRead(ids: number[] | 'all') {
  await api('notifications/read', { method: 'POST', body: ids === 'all' ? { all: true } : { ids } });
  refreshAll();
}

export type ApiRole = 'student' | 'teacher' | 'admin' | 'president' | 'vice_president';
export const ROLE_LABELS: Record<ApiRole, string> = {
  student: 'Students', teacher: 'Teachers', admin: 'Admins', president: 'President', vice_president: 'Vice President',
};
export interface Announcement {
  id: string; title: string; body: string; audienceRoles: ApiRole[]; cohort: string | null;
  offeringId: string | null; courseName: string | null; pinned: boolean;
  publishAt: string; expiresAt: string | null; createdAt: string; author: string | null;
  read?: boolean; readCount?: number; status?: 'scheduled' | 'live' | 'expired';
}
export interface AnnouncementInput {
  title: string; body: string; audienceRoles: ApiRole[]; cohort: string | null; offeringId: string | null;
  pinned: boolean; publishAt: string | null; expiresAt: string | null;
}
export const fetchAnnouncementFeed = () => api<Announcement[]>('announcements');
export const fetchAllAnnouncements = () => api<Announcement[]>('announcements', { query: { manage: 'true' } });
async function write<T>(p: Promise<T>) { const r = await p; refreshAll(); return r; }
export const createAnnouncement = (input: AnnouncementInput) => write(api<Announcement>('announcements', { method: 'POST', body: input }));
export const updateAnnouncement = (id: string, patch: Partial<AnnouncementInput>) =>
  write(api<Announcement>(`announcements/${id}`, { method: 'PATCH', body: patch }));
export const deleteAnnouncement = (id: string) => write(api(`announcements/${id}`, { method: 'DELETE' }));
export const markAnnouncementRead = (id: string) => write(api(`announcements/${id}/read`, { method: 'POST' }));

export const formatWhen = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
