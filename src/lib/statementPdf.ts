// Statement of account as an A4 PDF, drawn as text with jsPDF (like the transcript), so it stays sharp
// and searchable. Kept free of app imports so it can be built and checked in tests.
import type { jsPDF as JsPdf } from 'jspdf';

/** What the PDF needs from a statement (the API's Statement, see src/lib/finance.ts, fits this). */
export interface StatementForPdf {
  school: string; generatedAt: string;
  student: { name: string; studentNo: string | null };
  totals: { charged: number; paid: number; outstanding: number; credit: number };
  invoices: {
    number: string; description: string; issuedOn: string; dueOn: string; state: 'issued' | 'void';
    amount: number; paid: number; balance: number; status: string; lines?: { description: string; amount: number }[];
  }[];
  payments: {
    amount: number; paidOn: string; method: string; reference: string | null; voided: boolean; voidReason: string | null;
    appliedTo: { number: string; amount: number }[];
  }[];
}
type Statement = StatementForPdf;

// jsPDF's built-in Helvetica has no peso sign, so amounts read "PHP 1,234.00".
const money = (n: number) => `PHP ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const manila = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
const STATUS: Record<string, string> = { paid: 'Paid', partially_paid: 'Partially paid', pending: 'Pending', overdue: 'Overdue', void: 'Void' };
const METHOD: Record<string, string> = { cash: 'Cash', bank_transfer: 'Bank transfer', gcash: 'GCash', maya: 'Maya', other: 'Other' };

/** File name like statement-S-001-2026-10-02.pdf. */
export function statementFileName(s: Statement) {
  const who = (s.student.studentNo || s.student.name).replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  const date = new Date(s.generatedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  return `statement-${who}-${date}.pdf`;
}

/** Builds the statement PDF (jsPDF is passed in so the browser can load it only when needed). */
export function buildStatementPdf(s: Statement, JsPDF: typeof JsPdf): JsPdf {
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const BOTTOM = H - 22;
  let y = M;

  const text = (str: string, x: number, yy: number, o: { size?: number; bold?: boolean; align?: 'left' | 'center' | 'right'; color?: number; maxWidth?: number } = {}) => {
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
    doc.setFontSize(o.size ?? 9);
    doc.setTextColor(o.color ?? 20);
    doc.text(o.maxWidth ? doc.splitTextToSize(str, o.maxWidth)[0] : str, x, yy, { align: o.align ?? 'left' });
  };
  const rule = (yy: number, weight = 0.2, shade = 170) => { doc.setDrawColor(shade); doc.setLineWidth(weight); doc.line(M, yy, W - M, yy); };

  const header = (first: boolean) => {
    text(s.school.toUpperCase(), W / 2, y, { size: first ? 15 : 10, bold: true, align: 'center' });
    y += first ? 6 : 4.5;
    text('STATEMENT OF ACCOUNT', W / 2, y, { size: first ? 11 : 8, align: 'center', color: 80 });
    y += first ? 3.5 : 3;
    rule(y, 0.4, 40);
    y += first ? 7 : 5;
    if (!first) { text(`${s.student.name}${s.student.studentNo ? ` · ${s.student.studentNo}` : ''}`, M, y, { size: 8, color: 90 }); y += 5; }
  };
  let tableHeader: (() => void) | null = null;
  const ensure = (needed: number) => {
    if (y + needed <= BOTTOM) return;
    doc.addPage();
    y = M;
    header(false);
    tableHeader?.();
  };

  header(true);
  text('Student', M, y, { size: 8, color: 110 });
  text('As of', W - M, y, { size: 8, color: 110, align: 'right' });
  y += 5;
  text(s.student.name, M, y, { size: 12, bold: true });
  text(`${manila(s.generatedAt)} (Manila)`, W - M, y, { size: 10, align: 'right' });
  y += 5;
  if (s.student.studentNo) { text(`Student no. ${s.student.studentNo}`, M, y, { size: 9, color: 80 }); y += 5; }
  y += 3;

  // Summary
  const boxes: [string, number, boolean][] = [
    ['Total charged', s.totals.charged, false], ['Total paid', s.totals.paid, false], ['Amount due', s.totals.outstanding, true],
  ];
  if (s.totals.credit > 0) boxes.push(['Credit', s.totals.credit, false]);
  const bw = (W - 2 * M - (boxes.length - 1) * 4) / boxes.length;
  boxes.forEach(([label, value, strong], i) => {
    const x = M + i * (bw + 4);
    doc.setDrawColor(strong ? 40 : 190); doc.setLineWidth(strong ? 0.5 : 0.2);
    doc.roundedRect(x, y, bw, 16, 1.5, 1.5);
    text(label.toUpperCase(), x + 3, y + 5.5, { size: 7, color: 100, bold: true });
    text(money(value), x + 3, y + 12, { size: strong ? 12 : 11, bold: true });
  });
  y += 24;

  // Invoices
  const ic = { no: M, issued: W - M - 118, due: W - M - 96, amount: W - M - 50, paid: W - M - 25, balance: W - M };
  const section = (title: string) => { ensure(16); text(title, M, y, { size: 10, bold: true }); y += 5; };
  section('Invoices');
  tableHeader = () => {
    text('Invoice / what for', ic.no, y, { size: 7, bold: true, color: 100 });
    text('Issued', ic.issued, y, { size: 7, bold: true, color: 100 });
    text('Due', ic.due, y, { size: 7, bold: true, color: 100 });
    text('Amount', ic.amount, y, { size: 7, bold: true, color: 100, align: 'right' });
    text('Paid', ic.paid, y, { size: 7, bold: true, color: 100, align: 'right' });
    text('Balance', ic.balance, y, { size: 7, bold: true, color: 100, align: 'right' });
    y += 1.5; rule(y); y += 4;
  };
  tableHeader();
  if (s.invoices.length === 0) { text('No invoices.', M, y, { color: 110 }); y += 6; }
  const invoices = [...s.invoices].sort((a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.number.localeCompare(b.number));
  for (const inv of invoices) {
    const lines = inv.lines ?? [];
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const what: string[] = doc.splitTextToSize(inv.description, ic.amount - ic.no - 32).slice(0, 2);
    ensure(14 + what.length * 4 + lines.length * 4);
    const isVoid = inv.state === 'void';
    const shade = isVoid ? 140 : 20;
    text(inv.number, ic.no, y, { bold: true, color: shade });
    text(day(inv.issuedOn), ic.issued, y, { size: 8, color: shade });
    text(day(inv.dueOn), ic.due, y, { size: 8, color: shade });
    text(money(inv.amount), ic.amount, y, { size: 8, align: 'right', color: shade });
    text(isVoid ? '-' : money(inv.paid), ic.paid, y, { size: 8, align: 'right', color: shade });
    text(isVoid ? '-' : money(inv.balance), ic.balance, y, { size: 8, align: 'right', bold: !isVoid && inv.balance > 0, color: shade });
    y += 4.5;
    for (const w of what) { text(w, ic.no, y, { color: shade }); y += 4; }
    text(isVoid ? 'VOID (not counted)' : STATUS[inv.status] ?? inv.status, ic.no, y, {
      size: 7, bold: true, color: isVoid ? 140 : inv.status === 'overdue' ? 160 : inv.status === 'paid' ? 60 : 100,
    });
    y += 4;
    for (const l of lines) {
      text(`- ${l.description}`, ic.no + 4, y, { size: 8, color: 90, maxWidth: ic.amount - ic.no - 34 });
      text(money(l.amount), ic.amount, y, { size: 8, color: 90, align: 'right' });
      y += 4;
    }
    y += 1; rule(y, 0.1, 215); y += 4;
  }
  tableHeader = null;
  y += 4;

  // Payments
  const pc = { date: M, method: M + 28, ref: M + 58, applied: M + 98, amount: W - M };
  section('Payments');
  tableHeader = () => {
    text('Date', pc.date, y, { size: 7, bold: true, color: 100 });
    text('Method', pc.method, y, { size: 7, bold: true, color: 100 });
    text('Reference / OR no.', pc.ref, y, { size: 7, bold: true, color: 100 });
    text('Applied to', pc.applied, y, { size: 7, bold: true, color: 100 });
    text('Amount', pc.amount, y, { size: 7, bold: true, color: 100, align: 'right' });
    y += 1.5; rule(y); y += 4;
  };
  tableHeader();
  if (s.payments.length === 0) { text('No payments yet.', M, y, { color: 110 }); y += 6; }
  const payments = [...s.payments].sort((a, b) => a.paidOn.localeCompare(b.paidOn));
  for (const p of payments) {
    ensure(9);
    const shade = p.voided ? 140 : 20;
    text(day(p.paidOn), pc.date, y, { size: 8, color: shade });
    text(METHOD[p.method] ?? p.method, pc.method, y, { size: 8, color: shade });
    text(p.reference ?? '-', pc.ref, y, { size: 8, color: shade, maxWidth: pc.applied - pc.ref - 3 });
    const applied = p.voided ? `VOID${p.voidReason ? `: ${p.voidReason}` : ''}` : p.appliedTo.map((a) => `${a.number} (${money(a.amount)})`).join(', ') || 'Credit';
    text(applied, pc.applied, y, { size: 8, color: shade, maxWidth: pc.amount - pc.applied - 30 });
    text(money(p.amount), pc.amount, y, { size: 8, align: 'right', bold: !p.voided, color: shade });
    y += 5; rule(y - 1, 0.1, 215); y += 2;
  }
  tableHeader = null;

  // Total line
  ensure(14);
  y += 3; rule(y, 0.4, 40); y += 6;
  text('AMOUNT DUE', M, y, { size: 10, bold: true });
  text(money(s.totals.outstanding), W - M, y, { size: 12, bold: true, align: 'right' });
  if (s.totals.credit > 0) { y += 5; text(`Credit on account: ${money(s.totals.credit)}`, W - M, y, { size: 9, align: 'right', color: 80 }); }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(200); doc.setLineWidth(0.2); doc.line(M, H - 15, W - M, H - 15);
    text(`Generated from the ACTS portal on ${manila(s.generatedAt)}. Reflects payments recorded up to this date.`, M, H - 10, { size: 7, color: 120 });
    text(`Page ${i} of ${pages}`, W - M, H - 10, { size: 7, color: 120, align: 'right' });
  }
  return doc;
}

/** Builds the statement and saves it as a PDF (loads jsPDF on first use). */
export async function downloadStatementPdf(s: Statement) {
  const { jsPDF } = await import('jspdf');
  buildStatementPdf(s, jsPDF).save(statementFileName(s));
}
