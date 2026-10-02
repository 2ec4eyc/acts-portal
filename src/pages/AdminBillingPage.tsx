import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, Check, Eye, FileText, Pencil, Plus, RefreshCw, Save, Search, Trash2, X } from 'lucide-react';

import { Card } from '../components/Card';
import { StatementPdfButton } from '../components/StatementPdfButton';
import { StatementView, StatusChip } from '../components/StatementView';
import {
  createInvoices, createTemplate, deleteTemplate, fetchTemplates, updateTemplate, fetchReceipts, fetchStatement, fetchStudentBalances, formatDay, formatPeso, METHOD_LABELS, openReceipt,
  recordPayment, remindInvoice, reviewReceipt, today, voidInvoice, voidPayment,
  type BillingTemplate, type Invoice, type Payment, type PaymentMethod, type Receipt, type Statement, type StudentBalance,
} from '../lib/finance';
import { live } from '../lib/live';
import { toast } from '../lib/toast';

const input = 'w-full bg-white border-2 border-fb-gray rounded-xl px-3 py-2.5 text-sm outline-none focus:border-fb-blue';
const label = 'text-[10px] font-black uppercase tracking-widest text-fb-textSecondary';
const primary = 'px-5 py-2.5 bg-fb-blue text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2';

/** Small dialog asking for a reason (void) or confirming an action. */
const ReasonDialog = ({ title, help, confirm, onConfirm, onClose }: {
  title: string; help: string; confirm: string; onConfirm: (reason: string) => Promise<void>; onClose: () => void;
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50" role="dialog" aria-modal="true" aria-label={title}>
      <form className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError('');
        try { await onConfirm(reason.trim()); onClose(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
        <h3 className="text-lg font-black text-fb-textPrimary">{title}</h3>
        <p className="text-sm text-fb-textSecondary">{help}</p>
        <label className="block space-y-1">
          <span className={label}>Reason</span>
          <input className={input} required minLength={3} maxLength={500} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-fb-border text-xs font-black uppercase">Cancel</button>
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-black uppercase disabled:opacity-50">{confirm}</button>
        </div>
      </form>
    </div>
  );
};

const PaymentForm = ({ s, onDone }: { s: Statement; onDone: (msg: string) => void }) => {
  const open = s.invoices.filter((i) => i.state === 'issued' && i.balance > 0);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await recordPayment({ studentId: s.student.id, amount: Number(amount), paidOn, method, reference: reference.trim() || null, invoiceId: invoiceId || null });
      onDone(`Payment of ${formatPeso(Number(amount))} recorded.`);
      setAmount(''); setReference('');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="bg-fb-gray/40 rounded-2xl p-4 space-y-3">
      <p className="text-xs font-black uppercase tracking-widest text-fb-textPrimary">Record a payment received at the office</p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <label className="space-y-1"><span className={label}>Amount (₱)</span>
          <input type="number" min="0.01" step="0.01" required className={`${input} tabular-nums`} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="space-y-1"><span className={label}>Date</span>
          <input type="date" required className={input} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></label>
        <label className="space-y-1"><span className={label}>Method</span>
          <select className={input} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="space-y-1"><span className={label}>Reference / OR no.</span>
          <input className={input} maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
        <label className="space-y-1 col-span-2 md:col-span-1"><span className={label}>Apply to</span>
          <select className={input} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
            <option value="">Oldest unpaid first</option>
            {open.map((i) => <option key={i.id} value={i.id}>{i.number} ({formatPeso(i.balance)})</option>)}
          </select></label>
      </div>
      {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className={primary}><Plus size={12} /> Record payment</button>
    </form>
  );
};

const StudentModal = ({ studentId, onClose }: { studentId: string; onClose: () => void }) => {
  const [s, setS] = useState<Statement | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ kind: 'invoice'; inv: Invoice } | { kind: 'payment'; p: Payment } | null>(null);
  useEffect(() => live(() => fetchStatement(studentId), setS, (e) => setError((e as Error).message)), [studentId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !dialog) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, dialog]);
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-2 md:p-4 bg-white/80 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="statement-title">
      <div className="bg-fb-gray w-full max-w-5xl max-h-[95vh] overflow-y-auto overscroll-contain rounded-[2rem] shadow-2xl border border-fb-border">
        <div className="sticky top-0 z-10 bg-white px-5 py-4 border-b border-fb-border flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 id="statement-title" className="text-lg font-black text-fb-textPrimary truncate">{s?.student.name ?? 'Statement'}</h2>
            <p className="text-xs text-fb-textSecondary">{s?.student.studentNo ?? ''}</p>
          </div>
          <span className="hidden sm:inline-flex"><StatementPdfButton s={s} /></span>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-full border border-fb-border bg-white hover:bg-fb-hover"><X size={18} /></button>
        </div>
        <div className="p-4 md:p-6 space-y-4">
          {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
          {notice && <p role="status" className="text-sm font-bold text-emerald-700">{notice}</p>}
          {!s ? <p className="text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p> : (
            <>
              <div className="sm:hidden"><StatementPdfButton s={s} /></div>
              <PaymentForm s={s} onDone={setNotice} />
              <StatementView s={s} actions={{
                onRemind: (inv) => { setError(''); remindInvoice(inv.id).then(() => setNotice(`Reminder sent for ${inv.number}.`), (e) => setError(e.message)); },
                onVoidInvoice: (inv) => setDialog({ kind: 'invoice', inv }),
                onVoidPayment: (p) => setDialog({ kind: 'payment', p }),
              }} />
            </>
          )}
        </div>
      </div>
      {dialog?.kind === 'invoice' && (
        <ReasonDialog title={`Void ${dialog.inv.number}?`} confirm="Void invoice"
          help={`It stays on record as void and no longer counts toward the balance (${formatPeso(dialog.inv.amount)}).`}
          onConfirm={async (reason) => { await voidInvoice(dialog.inv.id, reason); setNotice(`${dialog.inv.number} voided.`); }}
          onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'payment' && (
        <ReasonDialog title={`Void payment of ${formatPeso(dialog.p.amount)}?`} confirm="Void payment"
          help="It stays on record as void, and the invoices it paid go back to owing that amount."
          onConfirm={async (reason) => { await voidPayment(dialog.p.id, reason); setNotice('Payment voided.'); }}
          onClose={() => setDialog(null)} />
      )}
    </div>
  );
};

const StudentsTab = ({ onOpen }: { onOpen: (id: string) => void }) => {
  const [rows, setRows] = useState<StudentBalance[] | null>(null);
  const [q, setQ] = useState('');
  const [onlyOwing, setOnlyOwing] = useState(false);
  useEffect(() => live(fetchStudentBalances, setRows, () => setRows([])), []);
  const shown = useMemo(() => (rows ?? []).filter((r) =>
    !r.archived && (!onlyOwing || r.outstanding > 0)
    && `${r.studentName} ${r.studentNo ?? ''} ${r.cohort ?? ''}`.toLowerCase().includes(q.toLowerCase())), [rows, q, onlyOwing]);
  const total = shown.reduce((n, r) => n + r.outstanding, 0);
  return (
    <Card noPadding>
      <div className="p-4 flex flex-col md:flex-row gap-3 md:items-center border-b border-fb-border">
        <label className="relative flex-1">
          <span className="sr-only">Search students</span>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fb-textSecondary" aria-hidden="true" />
          <input type="search" className={`${input} pl-9`} placeholder="Search name, student no. or batch…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" className="accent-fb-blue w-4 h-4" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} /> With a balance only</label>
        <p className="text-sm text-fb-textSecondary">Outstanding: <span className="font-black text-fb-textPrimary tabular-nums">{formatPeso(total)}</span></p>
      </div>
      {!rows ? <p className="p-5 text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p> : shown.length === 0 ? <p className="p-5 text-sm text-fb-textSecondary">No students match.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary bg-fb-gray/40">
              <tr><th scope="col" className="px-4 py-2.5 text-left">Student</th><th scope="col" className="px-4 py-2.5 text-right">Charged</th>
                <th scope="col" className="px-4 py-2.5 text-right">Paid</th><th scope="col" className="px-4 py-2.5 text-right">Outstanding</th>
                <th scope="col" className="px-4 py-2.5 text-left">Flags</th><th scope="col" className="px-4 py-2.5"><span className="sr-only">Open</span></th></tr>
            </thead>
            <tbody className="divide-y divide-fb-border tabular-nums">
              {shown.map((r) => (
                <tr key={r.studentId}>
                  <td className="px-4 py-2.5"><span className="font-bold">{r.studentName}</span><span className="block text-xs text-fb-textSecondary">{[r.studentNo, r.cohort].filter(Boolean).join(' · ')}</span></td>
                  <td className="px-4 py-2.5 text-right">{formatPeso(r.charged)}</td>
                  <td className="px-4 py-2.5 text-right">{formatPeso(r.paid)}</td>
                  <td className={`px-4 py-2.5 text-right font-black ${r.outstanding > 0 ? 'text-red-700' : ''}`}>{formatPeso(r.outstanding)}</td>
                  <td className="px-4 py-2.5 space-x-1">
                    {r.overdueCount > 0 && <StatusChip status="overdue" />}
                    {r.pendingReceipts > 0 && <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-amber-100 text-amber-800">{r.pendingReceipts} receipt{r.pendingReceipts > 1 ? 's' : ''} to review</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right"><button type="button" onClick={() => onOpen(r.studentId)} className="px-3 py-1.5 rounded-lg bg-fb-blue/10 text-fb-blue text-[10px] font-black uppercase hover:bg-fb-blue hover:text-white">Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

const ReceiptRow = ({ r }: { r: Receipt; key?: string }) => {
  const [amount, setAmount] = useState(String(r.amountClaimed));
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    setBusy(true); setError('');
    try { await reviewReceipt(r.id, { decision: 'approve', amount: Number(amount) }); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <li className="p-4 md:px-5 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-bold text-fb-textPrimary">{r.studentName}</span>
        <span className="text-sm text-fb-textSecondary">claims <span className="font-black text-fb-textPrimary tabular-nums">{formatPeso(r.amountClaimed)}</span> · {METHOD_LABELS[r.method]} · paid {formatDay(r.paidOn)}{r.reference ? ` · ref ${r.reference}` : ''}{r.invoiceNumber ? ` · for ${r.invoiceNumber}` : ''}</span>
        {r.fileDeletedAt
          ? <span className="ml-auto text-[10px] font-black uppercase text-fb-textSecondary">File deleted {formatDay(r.fileDeletedAt)}</span>
          : <button type="button" onClick={() => openReceipt(r.id).catch((e) => setError(e.message))} className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-fb-border text-[10px] font-black uppercase hover:bg-fb-hover"><Eye size={12} /> View receipt</button>}
      </div>
      {r.status === 'pending' ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1"><span className={label}>Amount to record (₱)</span>
            <input type="number" min="0.01" step="0.01" className={`${input} w-36 tabular-nums`} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <button type="button" disabled={busy} onClick={approve} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase flex items-center gap-1 disabled:opacity-50"><Check size={12} /> Approve</button>
          <button type="button" onClick={() => setRejecting(true)} className="px-4 py-2.5 rounded-xl border border-red-200 text-red-700 text-xs font-black uppercase flex items-center gap-1 hover:bg-red-50"><X size={12} /> Reject</button>
        </div>
      ) : (
        <p className="text-xs text-fb-textSecondary"><StatusChip status={r.status} /> {r.reviewedBy ? `by ${r.reviewedBy}` : ''}{r.reviewNote ? ` · ${r.reviewNote}` : ''}</p>
      )}
      {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
      {rejecting && (
        <ReasonDialog title="Reject this receipt?" confirm="Reject" help="The student is told why and can upload a new one."
          onConfirm={(note) => reviewReceipt(r.id, { decision: 'reject', note }).then(() => undefined)} onClose={() => setRejecting(false)} />
      )}
    </li>
  );
};

const ReceiptsTab = () => {
  const [status, setStatus] = useState<Receipt['status']>('pending');
  const [rows, setRows] = useState<Receipt[] | null>(null);
  useEffect(() => { setRows(null); return live(() => fetchReceipts(status), setRows, () => setRows([])); }, [status]);
  return (
    <Card noPadding>
      <div className="p-4 border-b border-fb-border flex gap-2">
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${status === s ? 'bg-fb-blue text-white' : 'bg-fb-gray text-fb-textSecondary'}`}>
            {s === 'pending' ? 'To review' : s}
          </button>
        ))}
      </div>
      {!rows ? <p className="p-5 text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>
        : rows.length === 0 ? <p className="p-5 text-sm text-fb-textSecondary">{status === 'pending' ? 'No receipts waiting for review.' : 'None.'}</p>
        : <ul className="divide-y divide-fb-border">{rows.map((r) => <ReceiptRow key={r.id} r={r} />)}</ul>}
    </Card>
  );
};

type LineDraft = { description: string; amount: string };
const blankLine = (): LineDraft => ({ description: '', amount: '' });
const toDrafts = (lines: { description: string; amount: number }[]): LineDraft[] => lines.map((l) => ({ description: l.description, amount: String(l.amount) }));
const toLines = (lines: LineDraft[]) => lines.map((l) => ({ description: l.description.trim(), amount: Number(l.amount) }));
const linesTotal = (lines: LineDraft[]) => lines.reduce((n, l) => n + (Number(l.amount) || 0), 0);
/** Why these charges can't be saved yet, or '' when they can. */
const chargesProblem = (description: string, lines: LineDraft[]) =>
  !description.trim() ? 'Fill in "What for" first.'
    : lines.some((l) => !l.description.trim() || !(Number(l.amount) > 0)) ? 'Every charge needs a name and an amount above zero.' : '';

/** The charge lines editor shared by "Bill students" and the template form. */
const ChargeLines = ({ lines, setLines, totalLabel, extra }: {
  lines: LineDraft[]; setLines: (l: LineDraft[]) => void; totalLabel: string; extra?: ReactNode;
}) => (
  <fieldset className="space-y-2">
    <legend className={label}>Charges</legend>
    {lines.map((l, i) => (
      <div key={i} className="flex gap-2">
        <label className="flex-1 min-w-0"><span className="sr-only">Charge {i + 1}</span>
          <input className={input} required maxLength={200} placeholder="e.g. Tuition" value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} /></label>
        <label className="w-28 md:w-36 shrink-0"><span className="sr-only">Amount {i + 1}</span>
          <input type="number" min="0.01" step="0.01" required className={`${input} tabular-nums`} placeholder="₱" value={l.amount} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} /></label>
        {lines.length > 1 && <button type="button" aria-label={`Remove charge ${i + 1}`} onClick={() => setLines(lines.filter((_, j) => j !== i))} className="p-2.5 rounded-xl border border-fb-border hover:bg-fb-hover shrink-0"><Trash2 size={14} /></button>}
      </div>
    ))}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-4">
        {lines.length < 20 && <button type="button" onClick={() => setLines([...lines, blankLine()])} className="text-xs font-black uppercase text-fb-blue flex items-center gap-1"><Plus size={12} /> Add charge</button>}
        {extra}
      </div>
      <p className="text-sm">{totalLabel}: <span className="font-black tabular-nums">{formatPeso(linesTotal(lines))}</span></p>
    </div>
  </fieldset>
);

/** Small in-app dialog: asks for a name, or just confirms (no input) when `field` is omitted. */
const SmallDialog = ({ title, help, confirm, field, danger, onConfirm, onClose }: {
  title: string; help: string; confirm: string; field?: { label: string; initial?: string; maxLength: number };
  danger?: boolean; onConfirm: (value: string) => Promise<void>; onClose: () => void;
}) => {
  const [value, setValue] = useState(field?.initial ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50" role="dialog" aria-modal="true" aria-label={title}>
      <form className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError('');
        try { await onConfirm(value.trim()); onClose(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
        <h3 className="text-lg font-black text-fb-textPrimary">{title}</h3>
        <p className="text-sm text-fb-textSecondary">{help}</p>
        {field && (
          <label className="block space-y-1">
            <span className={label}>{field.label}</span>
            <input className={input} required maxLength={field.maxLength} autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
        )}
        {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-fb-border text-xs font-black uppercase">Cancel</button>
          <button type="submit" disabled={busy} className={`px-4 py-2 rounded-xl text-white text-xs font-black uppercase disabled:opacity-50 ${danger ? 'bg-red-600' : 'bg-fb-blue'}`}>{confirm}</button>
        </div>
      </form>
    </div>
  );
};

const NewInvoiceTab = ({ onDone, onTemplates }: { onDone: (msg: string) => void; onTemplates: () => void }) => {
  const [students, setStudents] = useState<StudentBalance[]>([]);
  const [templates, setTemplates] = useState<BillingTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [batch, setBatch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchStudentBalances().then((s) => setStudents(s.filter((x) => !x.archived))).catch(() => {}); }, []);
  useEffect(() => live(fetchTemplates, setTemplates, () => setTemplates([])), []);
  const batches = [...new Set(students.map((s) => s.cohort).filter((c): c is string => !!c))].sort();
  const visible = students.filter((s) => !batch || s.cohort === batch);
  const allPicked = visible.length > 0 && visible.every((s) => picked.has(s.studentId));
  const toggleAll = () => setPicked(new Set(allPicked ? [] : visible.map((s) => s.studentId)));
  const toggle = (id: string) => { const n = new Set(picked); if (n.has(id)) n.delete(id); else n.add(id); setPicked(n); };
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates?.find((x) => x.id === id);
    if (t) { setDescription(t.description); setLines(toDrafts(t.lines)); }
  };
  const startSave = () => {
    const problem = chargesProblem(description, lines);
    if (problem) toast.error(problem); else setSaving(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (!picked.size) { setError('Choose at least one student.'); return; }
    setBusy(true);
    try {
      const r = await createInvoices({ studentIds: [...picked], description: description.trim(), dueOn, lines: toLines(lines) });
      onDone(`${r.created} invoice${r.created > 1 ? 's' : ''} created. Each student was notified.`);
      setPicked(new Set()); setDescription(''); setLines([blankLine()]); setTemplateId('');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <Card title="Bill students">
      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-2xl bg-fb-gray/40 p-4 space-y-1">
          <label className="block space-y-1"><span className={label}>Start from template</span>
            <select className={input} value={templateId} onChange={(e) => applyTemplate(e.target.value)} disabled={!templates?.length}>
              <option value="">{templates?.length ? 'None, enter charges by hand' : 'No templates yet'}</option>
              {templates?.map((t) => <option key={t.id} value={t.id}>{t.name} ({formatPeso(t.total)})</option>)}
            </select></label>
          {templates?.length === 0 && (
            <p className="text-xs text-fb-textSecondary">Save charge sets you use often in <button type="button" onClick={onTemplates} className="font-bold text-fb-blue underline">Templates</button>, or with "Save as template" below.</p>
          )}
          {templateId && <p className="text-xs text-fb-textSecondary">Filled in from the template. You can still change anything before billing.</p>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1"><span className={label}>What for</span>
            <input className={input} required maxLength={200} placeholder="e.g. Tuition, 1st semester 2026-2027" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label className="space-y-1"><span className={label}>Due date</span>
            <input type="date" className={input} required value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></label>
        </div>
        <ChargeLines lines={lines} setLines={setLines} totalLabel="Total per student"
          extra={<button type="button" onClick={startSave} className="text-xs font-black uppercase text-fb-blue flex items-center gap-1"><Save size={12} /> Save as template</button>} />
        <fieldset className="space-y-2">
          <legend className={label}>Students ({picked.size} selected)</legend>
          <div className="flex flex-wrap gap-3 items-center">
            <label className="flex items-center gap-2 text-sm"><span className="font-bold">Batch</span>
              <select className={`${input} w-auto`} value={batch} onChange={(e) => setBatch(e.target.value)}>
                <option value="">All</option>{batches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select></label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" className="accent-fb-blue w-4 h-4" checked={allPicked} onChange={toggleAll} /> Select all shown</label>
          </div>
          <div className="max-h-64 overflow-y-auto border border-fb-border rounded-xl divide-y divide-fb-border">
            {visible.map((s) => (
              <label key={s.studentId} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-fb-hover">
                <input type="checkbox" className="accent-fb-blue w-4 h-4" checked={picked.has(s.studentId)} onChange={() => toggle(s.studentId)} />
                <span className="font-semibold">{s.studentName}</span>
                <span className="text-xs text-fb-textSecondary">{[s.studentNo, s.cohort].filter(Boolean).join(' · ')}</span>
              </label>
            ))}
            {visible.length === 0 && <p className="p-3 text-sm text-fb-textSecondary">No students.</p>}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm font-bold text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</p>}
        <button type="submit" disabled={busy} className={primary}>{busy && <RefreshCw size={12} className="animate-spin" />} Create {picked.size || ''} invoice{picked.size === 1 ? '' : 's'}</button>
      </form>
      {saving && (
        <SmallDialog title="Save as template" confirm="Save template" field={{ label: 'Template name', initial: description.trim().slice(0, 100), maxLength: 100 }}
          help={`Saves "What for" and the ${lines.length} charge${lines.length > 1 ? 's' : ''} (${formatPeso(linesTotal(lines))}) so you can bill them again later.`}
          onConfirm={async (name) => {
            const t = await createTemplate({ name, description: description.trim(), lines: toLines(lines) });
            setTemplateId(t.id);
            toast.success(`Template "${t.name}" saved.`);
          }}
          onClose={() => setSaving(false)} />
      )}
    </Card>
  );
};

const TemplateForm = ({ initial, onClose }: { initial: BillingTemplate | null; onClose: () => void }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [lines, setLines] = useState<LineDraft[]>(initial ? toDrafts(initial.lines) : [blankLine()]);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = { name: name.trim(), description: description.trim(), lines: toLines(lines) };
      const t = initial ? await updateTemplate(initial.id, body) : await createTemplate(body);
      toast.success(`Template "${t.name}" ${initial ? 'updated' : 'saved'}.`);
      onClose();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card title={initial ? `Edit ${initial.name}` : 'New template'}>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1"><span className={label}>Template name</span>
            <input className={input} required maxLength={100} placeholder="e.g. Tuition – 1st Semester" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="space-y-1"><span className={label}>What for (shown on the invoice)</span>
            <input className={input} required maxLength={200} placeholder="e.g. Tuition, 1st semester" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        </div>
        <ChargeLines lines={lines} setLines={setLines} totalLabel="Total" />
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={primary}>{busy && <RefreshCw size={12} className="animate-spin" />} {initial ? 'Save changes' : 'Save template'}</button>
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl border border-fb-border text-xs font-black uppercase tracking-widest">Cancel</button>
        </div>
      </form>
    </Card>
  );
};

const TemplatesTab = ({ onBill }: { onBill: () => void }) => {
  const [rows, setRows] = useState<BillingTemplate[] | null>(null);
  const [editing, setEditing] = useState<BillingTemplate | 'new' | null>(null);
  const [removing, setRemoving] = useState<BillingTemplate | null>(null);
  useEffect(() => live(fetchTemplates, setRows, (e) => { toast.error((e as Error).message); setRows([]); }), []);
  if (editing) return <TemplateForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />;
  return (
    <Card noPadding>
      <div className="p-4 border-b border-fb-border flex flex-wrap items-center gap-3">
        <p className="flex-1 min-w-[12rem] text-sm text-fb-textSecondary">Saved charge sets. Pick one in <button type="button" onClick={onBill} className="font-bold text-fb-blue underline">Bill students</button> to fill in the charges. Changing or deleting a template never changes invoices already issued.</p>
        <button type="button" onClick={() => setEditing('new')} className={primary}><Plus size={12} /> New template</button>
      </div>
      {!rows ? <p className="p-5 text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>
        : rows.length === 0 ? <p className="p-5 text-sm text-fb-textSecondary">No templates yet.</p> : (
          <ul className="divide-y divide-fb-border">
            {rows.map((t) => (
              <li key={t.id} className="p-4 md:px-5 flex flex-wrap items-center gap-3">
                <span className="shrink-0 p-2 rounded-xl bg-fb-blue/5 text-fb-blue"><FileText size={16} /></span>
                <span className="flex-1 min-w-[10rem]">
                  <span className="block font-bold text-fb-textPrimary break-words">{t.name}</span>
                  <span className="block text-xs text-fb-textSecondary break-words">{t.description} · {t.lines.length} charge{t.lines.length > 1 ? 's' : ''}: {t.lines.map((l) => l.description).join(', ')}</span>
                </span>
                <span className="font-black tabular-nums">{formatPeso(t.total)}</span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-fb-border text-[10px] font-black uppercase hover:bg-fb-hover"><Pencil size={12} /> Edit</button>
                  <button type="button" onClick={() => setRemoving(t)} aria-label={`Delete ${t.name}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-[10px] font-black uppercase hover:bg-red-50"><Trash2 size={12} /> Delete</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      {removing && (
        <SmallDialog title={`Delete "${removing.name}"?`} confirm="Delete template" danger
          help="Invoices already billed from it stay exactly as they are."
          onConfirm={async () => { await deleteTemplate(removing.id); toast.success(`Template "${removing.name}" deleted.`); }}
          onClose={() => setRemoving(null)} />
      )}
    </Card>
  );
};

export const AdminBillingPage = () => {
  const [tab, setTab] = useState<'students' | 'receipts' | 'new' | 'templates'>('students');
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const tabs = [['students', 'Students'], ['receipts', 'Receipts to review'], ['new', 'Bill students'], ['templates', 'Templates']] as const;
  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-black text-fb-textPrimary italic tracking-tight">Billing</h1>
        <p className="text-sm text-fb-textSecondary">Invoices, payments and receipts. Amounts in Philippine pesos.</p>
      </div>
      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => { setTab(id); setNotice(''); }}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${tab === id ? 'bg-fb-blue text-white' : 'bg-white border border-fb-border text-fb-textSecondary'}`}>{name}</button>
        ))}
      </div>
      {notice && <p role="status" className="text-sm font-bold text-emerald-700">{notice}</p>}
      {tab === 'students' && <StudentsTab onOpen={setOpenId} />}
      {tab === 'receipts' && <ReceiptsTab />}
      {tab === 'new' && <NewInvoiceTab onDone={(m) => { setNotice(m); setTab('students'); }} onTemplates={() => setTab('templates')} />}
      {tab === 'templates' && <TemplatesTab onBill={() => setTab('new')} />}
      {openId && <StudentModal studentId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
};
