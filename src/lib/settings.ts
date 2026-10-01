// Feature switches, settings and the audit log. Server side: server/lib/settings.ts, server/lib/audit.ts.
import { api } from './api';
import { refreshAll } from './live';

export interface Features { chat: boolean; receiptUploads: boolean; announcements: boolean; studentSchedule: boolean }
export const DEFAULT_FEATURES: Features = { chat: true, receiptUploads: true, announcements: true, studentSchedule: true };

/** Public switches. Fetched without sign-in headers so Vercel's CDN can serve them from cache. */
export async function fetchPublicSettings(): Promise<{ features: Features }> {
  const res = await fetch('/api/settings/public');
  if (!res.ok) throw new Error(`Settings unavailable (${res.status})`);
  return res.json();
}

export interface SettingInfo<T> { key: string; value: T; updatedAt: string | null; updatedBy: string | null }
export const fetchFeatureSettings = () => api<SettingInfo<Features>>('settings/features');
export async function updateFeatures(changes: Partial<Features>) {
  const r = await api<SettingInfo<Features>>('settings/features', { method: 'PATCH', body: changes });
  refreshAll();
  return r;
}

export interface AuditEntry {
  id: number;
  at: string;
  action: string;
  table: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE' | null;
  entityId: string;
  subject: string;
  actor: { id: string; name: string; email: string | null } | null;
  source: string | null;
  changes: { field: string; from: unknown; to: unknown }[];
  data: Record<string, unknown> | null;
}
export interface AuditFilter { table?: string; actorId?: string; from?: string; to?: string; before?: number }
export const fetchAudit = (f: AuditFilter = {}) =>
  api<{ entries: AuditEntry[]; nextBefore: number | null }>('audit', {
    query: { table: f.table, actorId: f.actorId, from: f.from, to: f.to, before: f.before ? String(f.before) : undefined },
  });

export interface AttendanceAlerts { warnAt: number; escalateAt: number; countExcused: boolean; countLate: boolean }
export const fetchAlertSettings = () => api<SettingInfo<AttendanceAlerts>>('settings/attendanceAlerts');
export const updateAlertSettings = (changes: Partial<AttendanceAlerts>) =>
  api<SettingInfo<AttendanceAlerts>>('settings/attendanceAlerts', { method: 'PATCH', body: changes });
