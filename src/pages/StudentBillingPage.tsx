import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, RefreshCw, Upload } from 'lucide-react';

import { Card } from '../components/Card';
import { StatementPdfButton } from '../components/StatementPdfButton';
import { StatementView } from '../components/StatementView';
import {
  fetchMyStatement, formatPeso, METHOD_LABELS, prepareReceiptFile, today, uploadReceipt,
  type PaymentMethod, type Statement,
} from '../lib/finance';
import { live } from '../lib/live';

const UploadForm = ({ s }: { s: Statement }) => {
  const open = s.invoices.filter((i) => i.state === 'issued' && i.balance > 0);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [invoiceId, setInvoiceId] = useState(open[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setMessage(null);
    try {
      const blob = await prepareReceiptFile(file);
      await uploadReceipt(blob, { amountClaimed: Number(amount), paidOn, method, reference: reference.trim() || null, invoiceId: invoiceId || null });
      setMessage({ ok: true, text: 'Receipt sent. The school office will review it and you\'ll get a notification.' });
      setFile(null); setAmount(''); setReference(''); setInputKey((k) => k + 1);
    } catch (err) { setMessage({ ok: false, text: (err as Error).message }); }
    finally { setBusy(false); }
  };
  const input = 'w-full bg-white border-2 border-fb-gray rounded-xl px-3 py-2.5 text-sm outline-none focus:border-fb-blue';
  const label = 'text-[10px] font-black uppercase tracking-widest text-fb-textSecondary';

  return (
    <Card title="Upload a payment receipt">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-fb-textSecondary">Paid by bank transfer, GCash, Maya or at the office? Upload a photo or PDF of the receipt (it will be shrunk to 2 MB if needed). Your balance updates once it's approved.</p>
        <label className="block space-y-1">
          <span className={label}>Receipt (photo or PDF)</span>
          <input key={inputKey} type="file" accept="image/*,application/pdf" required onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-fb-blue/10 file:text-fb-blue file:font-bold" />
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className={label}>Amount paid (₱)</span>
            <input type="number" inputMode="decimal" min="0.01" step="0.01" required className={`${input} tabular-nums`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className={label}>Date paid</span>
            <input type="date" required max={today()} className={input} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className={label}>Paid by</span>
            <select className={input} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className={label}>Reference no. (optional)</span>
            <input className={input} maxLength={100} autoComplete="off" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. GCash ref 1234…" />
          </label>
          {open.length > 0 && (
            <label className="block space-y-1 md:col-span-2">
              <span className={label}>For invoice</span>
              <select className={input} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                {open.map((i) => <option key={i.id} value={i.id}>{i.number}: {i.description} ({formatPeso(i.balance)} left)</option>)}
                <option value="">Not sure / general payment</option>
              </select>
            </label>
          )}
        </div>
        {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm font-bold ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.text}</p>}
        <button type="submit" disabled={busy || !file} className="px-5 py-2.5 bg-fb-blue text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2">
          {busy ? <RefreshCw size={12} className="animate-spin" /> : <Upload size={12} />} {busy ? 'Uploading…' : 'Send receipt'}
        </button>
      </form>
    </Card>
  );
};

export const StudentBillingPage = ({ receiptUploads }: { receiptUploads: boolean }) => {
  const [s, setS] = useState<Statement | null>(null);
  const [error, setError] = useState('');
  useEffect(() => live(fetchMyStatement, setS, (e) => setError((e as Error).message)), []);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-fb-textPrimary italic tracking-tight">Billing</h1>
          <p className="text-sm text-fb-textSecondary">Your invoices, payments and balance.</p>
        </div>
        <StatementPdfButton s={s} />
      </div>
      {error && <p role="alert" className="text-sm font-bold text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</p>}
      {!s && !error && <p className="text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>}
      {s && (
        <>
          <StatementView s={s} />
          {receiptUploads && <UploadForm s={s} />}
        </>
      )}
    </div>
  );
};
