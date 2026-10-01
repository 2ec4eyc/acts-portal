// File storage (receipts, course files, profile photos): usage, limits, the file list and freeing space. Server: server/lib/receipt-storage.ts.
import { api } from './api';

export type StorageLevel = 'ok' | 'warn' | 'full';
export interface StorageUsage {
  mode: 'r2' | 'db';
  usedBytes: number; trackedBytes: number; files: number; deletedFiles: number;
  /** Notes, exams and activities uploaded as files (links take no space). */
  courseFiles: { files: number; bytes: number };
  /** Profile photos, always stored in the database. */
  profilePhotos: { files: number; bytes: number };
  byStatus: Record<'pending' | 'approved' | 'rejected', { files: number; bytes: number }>;
  measured: { bytes: number | null; objects: number | null; at: string | null; orphansRemoved: number } | null;
  warnBytes: number; limitBytes: number; level: StorageLevel; deleteApprovedAfterYears: number;
}
export interface StoredFile {
  id: string; studentId: string; studentName: string; invoiceNumber: string | null;
  contentType: string; sizeBytes: number; status: 'pending' | 'approved' | 'rejected';
  createdAt: string; reviewedAt: string | null; storedIn: 'r2' | 'db';
  fileDeletedAt: string | null; cannotDelete: string | null;
}
export interface FileFilter { status?: 'pending' | 'approved' | 'rejected' | 'deleted'; q?: string; deletable?: boolean; sort?: 'newest' | 'largest'; offset?: number }

export const fetchStorage = () => api<StorageUsage>('storage');
export const fetchFiles = (f: FileFilter) => api<{ files: StoredFile[]; nextOffset: number | null }>('storage/files', {
  query: { status: f.status, q: f.q || undefined, deletable: f.deletable ? 'true' : undefined, sort: f.sort, offset: f.offset ? String(f.offset) : undefined },
});
export const deleteFiles = (ids: string[]) =>
  api<{ deleted: number; freedBytes: number; skipped: { id: string; reason: string }[]; warning: string | null }>('storage/files/delete', { method: 'POST', body: { ids } });
export const recountStorage = () =>
  api<{ skipped: boolean; objects: number; bytes: number; orphansRemoved: number }>('storage/recount', { method: 'POST' });

/** Decimal units (1 GB = 1,000,000,000 bytes), as the server counts them. */
export function formatBytes(n: number) {
  if (n < 1000) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n, i = -1;
  do { v /= 1000; i++; } while (v >= 1000 && i < units.length - 1);
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}
