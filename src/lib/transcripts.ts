// Official transcripts: API calls and the PDF (drawn as text with jsPDF, not a screenshot, so it
// prints sharply and stays searchable). Server side: server/lib/transcripts.ts.
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { api } from './api';
import { refreshAll } from './live';

export interface TranscriptCourse { name: string; units: number; grade: number | null; remark: 'Passed' | 'Failed' | 'Incomplete' }
export interface TranscriptTerm { schoolYear: string; yearLevel: number; semester: number; courses: TranscriptCourse[]; unitsEarned: number }
export interface TranscriptContent {
  version: 1;
  school: string;
  student: {
    fullName: string; firstName: string; middleName: string | null; lastName: string;
    studentNo: string | null; schoolType: 'day' | 'night' | null; cohort: string | null; birthDate: string | null;
  };
  terms: TranscriptTerm[];
  totals: { unitsAttempted: number; unitsEarned: number; generalAverage: number | null };
  passingGrade: number;
}
export interface TranscriptSummary {
  id: string; studentId: string; code: string; purpose: string | null;
  issuedAt: string; issuedBy: string | null;
  revokedAt: string | null; revokedBy: string | null; revokeReason: string | null;
}
export interface Transcript extends TranscriptSummary { content: TranscriptContent }
export interface Verification {
  status: 'valid' | 'revoked'; school: string; studentName: string; studentNo: string | null;
  issuedAt: string; issuedBy: string | null; revokedAt: string | null;
}

export const fetchTranscripts = (studentId: string) => api<TranscriptSummary[]>('transcripts', { query: { studentId } });
export const fetchTranscript = (id: string) => api<Transcript>(`transcripts/${id}`);
export const previewTranscript = (studentId: string) => api<TranscriptContent>('transcripts/preview', { query: { studentId } });
export const verifyTranscript = (code: string) => api<Verification>(`verify/${encodeURIComponent(code)}`);

export async function issueTranscript(studentId: string, purpose: string) {
  const t = await api<Transcript>('transcripts', { method: 'POST', body: { studentId, purpose: purpose.trim() || null } });
  refreshAll();
  return t;
}
export async function revokeTranscript(id: string, reason: string) {
  const t = await api<Transcript>(`transcripts/${id}/revoke`, { method: 'POST', body: { reason } });
  refreshAll();
  return t;
}

// ---------- display helpers ----------

const ORDINAL = ['', '1st', '2nd', '3rd'];
export const termLabel = (t: Pick<TranscriptTerm, 'schoolYear' | 'yearLevel' | 'semester'>) =>
  `S.Y. ${t.schoolYear} · ${ORDINAL[t.yearLevel]} Year · ${ORDINAL[t.semester]} Semester`;
export const formatUnits = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export const formatGrade = (c: TranscriptCourse) => (c.grade === null ? 'INC' : c.grade.toFixed(2).replace(/\.00$/, ''));
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
export const verifyUrl = (code: string) => `${window.location.origin}/verify/${code}`;
const programLabel = (t: TranscriptContent['student']['schoolType']) => (t === 'day' ? 'Day School' : t === 'night' ? 'Night School' : '—');

// ---------- PDF ----------

/** Draws the transcript as an A4 PDF and saves it. Revoked transcripts are stamped REVOKED. */
export async function downloadTranscriptPdf(t: Transcript) {
  const c = t.content;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;
  const BOTTOM = H - 30;
  const cols = { course: M, units: W - M - 70, grade: W - M - 45, remark: W - M - 22 };
  let y = M;

  const text = (s: string, x: number, yy: number, opts: { size?: number; bold?: boolean; align?: 'left' | 'center' | 'right'; color?: number } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 10);
    doc.setTextColor(opts.color ?? 20);
    doc.text(s, x, yy, { align: opts.align ?? 'left' });
  };
  const header = (first: boolean) => {
    text(c.school.toUpperCase(), W / 2, y, { size: first ? 16 : 11, bold: true, align: 'center' });
    y += first ? 7 : 5;
    text('OFFICIAL TRANSCRIPT OF RECORDS', W / 2, y, { size: first ? 11 : 8, align: 'center', color: 80 });
    y += first ? 4 : 3;
    doc.setDrawColor(40); doc.setLineWidth(0.4); doc.line(M, y, W - M, y);
    y += first ? 8 : 6;
    if (!first) { text(`${c.student.fullName} · ${c.student.studentNo ?? ''}`, M, y, { size: 8, color: 90 }); y += 6; }
  };
  const ensure = (needed: number) => {
    if (y + needed <= BOTTOM) return;
    doc.addPage();
    y = M;
    header(false);
  };

  header(true);

  // Student details, two columns.
  const field = (label: string, value: string, x: number, yy: number) => {
    text(label.toUpperCase(), x, yy, { size: 7, color: 110 });
    text(value || '—', x, yy + 4.5, { size: 10, bold: true });
  };
  field('Name', `${c.student.lastName}, ${c.student.firstName}${c.student.middleName ? ` ${c.student.middleName}` : ''}`, M, y);
  field('Student No.', c.student.studentNo ?? '', W / 2 + 10, y);
  y += 11;
  field('Program', programLabel(c.student.schoolType), M, y);
  field('Batch', c.student.cohort ?? '', W / 2 + 10, y);
  y += 11;
  if (c.student.birthDate) { field('Date of Birth', formatDate(c.student.birthDate), M, y); y += 11; }
  y += 2;

  // Terms
  for (const term of c.terms) {
    ensure(18 + term.courses.length * 6);
    doc.setFillColor(238, 241, 245); doc.rect(M, y - 4.5, W - 2 * M, 7, 'F');
    text(termLabel(term).replace(/·/g, '-'), M + 2, y, { size: 9, bold: true });
    y += 7;
    text('COURSE', cols.course + 2, y, { size: 7, color: 110 });
    text('UNITS', cols.units, y, { size: 7, color: 110, align: 'right' });
    text('GRADE', cols.grade, y, { size: 7, color: 110, align: 'right' });
    text('REMARKS', cols.remark, y, { size: 7, color: 110, align: 'center' });
    y += 5;
    for (const course of term.courses) {
      ensure(6);
      const name = doc.splitTextToSize(course.name, cols.units - cols.course - 15)[0] as string;
      text(name, cols.course + 2, y);
      text(formatUnits(course.units), cols.units, y, { align: 'right' });
      text(formatGrade(course), cols.grade, y, { align: 'right', bold: true });
      text(course.remark, cols.remark, y, { align: 'center', color: course.remark === 'Passed' ? 20 : 150 });
      y += 5.5;
    }
    doc.setDrawColor(200); doc.setLineWidth(0.2); doc.line(M, y - 3, W - M, y - 3);
    text(`Units earned: ${formatUnits(term.unitsEarned)}`, cols.units, y + 1, { size: 8, align: 'right', color: 90 });
    y += 9;
  }

  // Totals
  ensure(30);
  doc.setDrawColor(40); doc.setLineWidth(0.4); doc.line(M, y - 3, W - M, y - 3);
  y += 3;
  field('Units attempted', formatUnits(c.totals.unitsAttempted), M, y);
  field('Units earned', formatUnits(c.totals.unitsEarned), M + 55, y);
  field('General weighted average', c.totals.generalAverage === null ? '—' : c.totals.generalAverage.toFixed(2), M + 110, y);
  y += 12;
  text(`Grading: 0-100, passing grade ${c.passingGrade}. INC = Incomplete (not included in the average). The general average is weighted by units.`, M, y, { size: 7.5, color: 100 });
  y += 10;

  // Issue block + QR (bottom of the last page)
  ensure(48);
  const qr = await QRCode.toDataURL(verifyUrl(t.code), { margin: 1, width: 240 });
  const qrSize = 30;
  const blockTop = Math.max(y, BOTTOM - 40);
  doc.addImage(qr, 'PNG', W - M - qrSize, blockTop, qrSize, qrSize);
  text('Verify this transcript', W - M - qrSize / 2, blockTop + qrSize + 4, { size: 7, align: 'center', color: 100 });
  text(t.code, W - M - qrSize / 2, blockTop + qrSize + 8, { size: 8, bold: true, align: 'center' });
  let by = blockTop + 4;
  text(`Issued ${formatDate(t.issuedAt)}${t.purpose ? `  ·  Purpose: ${t.purpose}` : ''}`.replace(/·/g, '-'), M, by, { size: 9 });
  by += 16;
  doc.setDrawColor(40); doc.setLineWidth(0.3); doc.line(M, by, M + 70, by);
  text(t.issuedBy ?? '', M, by + 5, { size: 10, bold: true });
  text('Issuing Officer (Registrar)', M, by + 9.5, { size: 8, color: 100 });
  text(`Check authenticity at ${verifyUrl(t.code)}`, M, by + 17, { size: 7.5, color: 100 });

  // Page numbers and revoked stamp on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    text(`Page ${i} of ${pages}`, W - M, H - 10, { size: 7.5, align: 'right', color: 130 });
    text(`Transcript ${t.code}`, M, H - 10, { size: 7.5, color: 130 });
    if (t.revokedAt) {
      doc.setTextColor(200, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(64);
      doc.text('REVOKED', W / 2, H / 2, { align: 'center', angle: 30 });
    }
  }
  doc.save(`Transcript_${c.student.lastName}_${c.student.firstName}_${t.code}.pdf`.replace(/\s+/g, '_'));
}
