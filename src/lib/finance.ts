// Billing: statements, invoices, payments, receipts. Server side: server/lib/finance.ts.
import { api, fetchRaw } from './api';
import { refreshAll } from './live';

export type InvoiceStatus = 'paid' | 'partially_paid' | 'pending' | 'overdue' | 'void';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'gcash' | 'maya' | 'other';
export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash', bank_transfer: 'Bank transfer', gcash: 'GCash', maya: 'Maya', other: 'Other',
};
export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  paid: 'Paid', partially_paid: 'Partially paid', pending: 'Pending', overdue: 'Overdue', void: 'Void',
};
export const STATUS_STYLES: Record<InvoiceStatus | 'approved' | 'rejected', string> = {
  paid: 'bg-emerald-100 text-emerald-800', approved: 'bg-emerald-100 text-emerald-800',
  partially_paid: 'bg-sky-100 text-sky-800', pending: 'bg-amber-100 text-amber-800',
  overdue: 'bg-red-100 text-red-800', rejected: 'bg-red-100 text-red-800', void: 'bg-fb-gray text-fb-textSecondary line-through',
};

export interface Invoice {
  id: string; number: string; studentId: string; description: string; issuedOn: string; dueOn: string;
  state: 'issued' | 'void'; amount: number; paid: number; balance: number; status: InvoiceStatus;
  studentName?: string; studentNo?: string | null; lines?: { description: string; amount: number }[];
}
export interface Payment {
  id: string; amount: number; paidOn: string; method: PaymentMethod; reference: string | null;
  receiptUploadId: string | null; voided: boolean; voidReason: string | null; appliedTo: { number: string; amount: number }[];
}
export interface Receipt {
  id: string; studentId: string; studentName: string; invoiceId: string | null; invoiceNumber: string | null;
  amountClaimed: number; paidOn: string; method: PaymentMethod; reference: string | null; contentType: string;
  status: 'pending' | 'approved' | 'rejected'; reviewNote: string | null; reviewedBy: string | null; createdAt: string;
}
export interface Statement {
  student: { id: string; name: string; studentNo: string | null };
  totals: { charged: number; paid: number; balance: number; outstanding: number; credit: number };
  invoices: Invoice[]; payments: Payment[]; receipts: Receipt[];
  ledger: { date: string; kind: 'charge' | 'payment'; refId: string; description: string; debit: number; credit: number; balance: number }[];
}
export interface StudentBalance {
  studentId: string; studentName: string; studentNo: string | null; cohort: string | null; archived: boolean;
  charged: number; paid: number; outstanding: number; overdueCount: number; pendingReceipts: number;
}

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
export const formatPeso = (n: number) => peso.format(n);
export const formatDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

async function write<T>(p: Promise<T>) { const r = await p; refreshAll(); return r; }

export const fetchMyStatement = () => api<Statement>('me/finance');
export const fetchStatement = (studentId: string) => api<Statement>(`finance/students/${studentId}/statement`);
export const fetchStudentBalances = () => api<StudentBalance[]>('finance/students');
export const fetchReceipts = (status?: Receipt['status']) => api<Receipt[]>('finance/receipts', { query: { status } });
export const createInvoices = (input: { studentIds: string[]; description: string; dueOn: string; lines: { description: string; amount: number }[] }) =>
  write(api<{ created: number }>('finance/invoices', { method: 'POST', body: input }));
export const voidInvoice = (id: string, reason: string) => write(api(`finance/invoices/${id}`, { method: 'PATCH', body: { void: { reason } } }));
export const remindInvoice = (id: string) => write(api(`finance/invoices/${id}/remind`, { method: 'POST' }));
export const recordPayment = (input: { studentId: string; amount: number; paidOn: string; method: PaymentMethod; reference?: string | null; invoiceId?: string | null }) =>
  write(api('finance/payments', { method: 'POST', body: input }));
export const voidPayment = (id: string, reason: string) => write(api(`finance/payments/${id}`, { method: 'PATCH', body: { void: { reason } } }));
export const reviewReceipt = (id: string, body: { decision: 'approve'; amount?: number; note?: string | null } | { decision: 'reject'; note: string }) =>
  write(api(`finance/receipts/${id}/review`, { method: 'POST', body }));

/** Opens a receipt in a new tab (works for both R2 links and files stored in the database). */
export async function openReceipt(id: string) {
  const tab = window.open('', '_blank');   // opened now, so pop-up blockers allow it
  try {
    const res = await fetchRaw(`finance/receipts/${id}/file`);
    const url = res.headers.get('content-type')?.includes('application/json')
      ? ((await res.json()) as { url: string }).url
      : URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url; else window.location.href = url;
  } catch (e) {
    tab?.close();
    throw e;
  }
}

// ---------- receipt upload ----------
export const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Photos are shrunk in the browser (JPEG, long edge 2000 px, then smaller if needed) to fit in 2 MB; PDFs must already fit. */
export async function prepareReceiptFile(file: File): Promise<Blob> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_RECEIPT_BYTES) throw new Error('This PDF is larger than 2 MB. Please upload a photo or a smaller PDF.');
    return file;
  }
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo (JPEG, PNG, WebP) or a PDF.');
  if (ACCEPTED.includes(file.type) && file.size <= MAX_RECEIPT_BYTES && file.size < 600_000) return file;
  const bitmap = await createImageBitmap(file);
  for (const edge of [2000, 1600, 1200]) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_RECEIPT_BYTES) return blob;
    }
  }
  throw new Error("This photo couldn't be made small enough. Please take a closer photo of just the receipt.");
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
function base64(buf: ArrayBuffer) {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function uploadReceipt(blob: Blob, details: { amountClaimed: number; paidOn: string; method: PaymentMethod; reference: string | null; invoiceId: string | null }) {
  const bytes = await blob.arrayBuffer();
  const meta = { contentType: blob.type, sizeBytes: bytes.byteLength, sha256: hex(await crypto.subtle.digest('SHA-256', bytes)) };
  const target = await api<{ mode: 'r2'; key: string; url: string } | { mode: 'db' }>('finance/receipts/upload-url', { method: 'POST', body: meta });
  if (target.mode === 'r2') {
    const put = await fetch(target.url, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob });
    if (!put.ok) throw new Error('The upload failed. Please try again.');
    return write(api('finance/receipts', { method: 'POST', body: { ...meta, ...details, key: target.key } }));
  }
  return write(api('finance/receipts', { method: 'POST', body: { ...meta, ...details, data: base64(bytes) } }));
}
