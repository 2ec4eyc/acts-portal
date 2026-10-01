import { useState } from 'react';
import { Bell, Ban, Eye } from 'lucide-react';

import {
  formatDay, formatPeso, METHOD_LABELS, openReceipt, STATUS_LABELS, STATUS_STYLES,
  type Invoice, type Payment, type Statement,
} from '../lib/finance';

export const StatusChip = ({ status }: { status: keyof typeof STATUS_STYLES }) => (
  <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${STATUS_STYLES[status]}`}>
    {status in STATUS_LABELS ? STATUS_LABELS[status as keyof typeof STATUS_LABELS] : status}
  </span>
);

const Tile = ({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'good' }) => (
  <div className="bg-white rounded-2xl border border-fb-border p-4">
    <p className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">{label}</p>
    <p className={`text-xl md:text-2xl font-black tabular-nums ${tone === 'danger' ? 'text-red-700' : tone === 'good' ? 'text-emerald-700' : 'text-fb-textPrimary'}`}>{value}</p>
  </div>
);

export interface StatementActions {
  onRemind?: (inv: Invoice) => void;
  onVoidInvoice?: (inv: Invoice) => void;
  onVoidPayment?: (p: Payment) => void;
}

/** Totals, invoices, payments, the running ledger and receipts. Admin actions appear when passed. */
export const StatementView = ({ s, actions = {} }: { s: Statement; actions?: StatementActions }) => {
  const [showLedger, setShowLedger] = useState(false);
  const cell = 'px-3 py-2.5';
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Outstanding" value={formatPeso(s.totals.outstanding)} tone={s.totals.outstanding > 0 ? 'danger' : 'good'} />
        <Tile label="Total charged" value={formatPeso(s.totals.charged)} />
        <Tile label="Total paid" value={formatPeso(s.totals.paid)} />
        <Tile label="Credit" value={formatPeso(s.totals.credit)} tone={s.totals.credit > 0 ? 'good' : undefined} />
      </div>

      <section className="bg-white rounded-2xl border border-fb-border overflow-hidden">
        <h3 className="px-4 py-3 border-b border-fb-border text-xs font-black uppercase tracking-widest text-fb-textPrimary">Invoices</h3>
        {s.invoices.length === 0 ? <p className="p-4 text-sm text-fb-textSecondary">No invoices.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary bg-fb-gray/40">
                <tr><th scope="col" className={`${cell} text-left`}>Invoice</th><th scope="col" className={`${cell} text-left`}>Due</th>
                  <th scope="col" className={`${cell} text-right`}>Amount</th><th scope="col" className={`${cell} text-right`}>Paid</th>
                  <th scope="col" className={`${cell} text-right`}>Balance</th><th scope="col" className={`${cell} text-left`}>Status</th>
                  {(actions.onRemind || actions.onVoidInvoice) && <th scope="col" className={cell}><span className="sr-only">Actions</span></th>}</tr>
              </thead>
              <tbody className="divide-y divide-fb-border">
                {s.invoices.map((i) => (
                  <tr key={i.id}>
                    <td className={cell}><span className="font-bold">{i.number}</span><span className="block text-xs text-fb-textSecondary">{i.description}</span></td>
                    <td className={`${cell} whitespace-nowrap`}>{formatDay(i.dueOn)}</td>
                    <td className={`${cell} text-right tabular-nums`}>{formatPeso(i.amount)}</td>
                    <td className={`${cell} text-right tabular-nums`}>{formatPeso(i.paid)}</td>
                    <td className={`${cell} text-right tabular-nums font-bold`}>{formatPeso(i.state === 'void' ? 0 : i.balance)}</td>
                    <td className={cell}><StatusChip status={i.status} /></td>
                    {(actions.onRemind || actions.onVoidInvoice) && (
                      <td className={`${cell} text-right whitespace-nowrap`}>
                        {i.state === 'issued' && i.balance > 0 && actions.onRemind && (
                          <button type="button" onClick={() => actions.onRemind!(i)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-fb-border text-[10px] font-black uppercase hover:bg-fb-hover"><Bell size={11} /> Remind</button>
                        )}
                        {i.state === 'issued' && i.paid === 0 && actions.onVoidInvoice && (
                          <button type="button" onClick={() => actions.onVoidInvoice!(i)} className="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 text-red-700 text-[10px] font-black uppercase hover:bg-red-50"><Ban size={11} /> Void</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-fb-border overflow-hidden">
        <h3 className="px-4 py-3 border-b border-fb-border text-xs font-black uppercase tracking-widest text-fb-textPrimary">Payments</h3>
        {s.payments.length === 0 ? <p className="p-4 text-sm text-fb-textSecondary">No payments yet.</p> : (
          <ul className="divide-y divide-fb-border">
            {s.payments.map((p) => (
              <li key={p.id} className={`px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm ${p.voided ? 'opacity-60' : ''}`}>
                <span className={`font-black tabular-nums ${p.voided ? 'line-through' : ''}`}>{formatPeso(p.amount)}</span>
                <span className="text-fb-textSecondary">{formatDay(p.paidOn)} · {METHOD_LABELS[p.method]}{p.reference ? ` · ref ${p.reference}` : ''}{p.receiptUploadId ? ' · from uploaded receipt' : ''}</span>
                {p.appliedTo.length > 0 && <span className="text-xs text-fb-textSecondary">→ {p.appliedTo.map((a) => `${a.number} (${formatPeso(a.amount)})`).join(', ')}</span>}
                {p.voided && <span className="text-xs text-red-700">Voided: {p.voidReason}</span>}
                {!p.voided && actions.onVoidPayment && (
                  <button type="button" onClick={() => actions.onVoidPayment!(p)} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 text-red-700 text-[10px] font-black uppercase hover:bg-red-50"><Ban size={11} /> Void</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {s.receipts.length > 0 && (
        <section className="bg-white rounded-2xl border border-fb-border overflow-hidden">
          <h3 className="px-4 py-3 border-b border-fb-border text-xs font-black uppercase tracking-widest text-fb-textPrimary">Uploaded receipts</h3>
          <ul className="divide-y divide-fb-border">
            {s.receipts.map((r) => (
              <li key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <StatusChip status={r.status} />
                <span className="font-bold tabular-nums">{formatPeso(r.amountClaimed)}</span>
                <span className="text-fb-textSecondary">{formatDay(r.paidOn)} · {METHOD_LABELS[r.method]}{r.reference ? ` · ref ${r.reference}` : ''}{r.invoiceNumber ? ` · for ${r.invoiceNumber}` : ''}</span>
                {r.status === 'pending' && <span className="text-xs text-amber-800">Under review</span>}
                {r.reviewNote && <span className="text-xs text-fb-textSecondary">Note: {r.reviewNote}</span>}
                <button type="button" onClick={() => openReceipt(r.id).catch(() => {})} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-fb-border text-[10px] font-black uppercase hover:bg-fb-hover"><Eye size={11} /> View</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-white rounded-2xl border border-fb-border overflow-hidden">
        <button type="button" onClick={() => setShowLedger(!showLedger)} aria-expanded={showLedger}
          className="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-fb-textPrimary hover:bg-fb-hover">
          Statement of account {showLedger ? '▴' : '▾'}
        </button>
        {showLedger && (s.ledger.length === 0 ? <p className="px-4 pb-4 text-sm text-fb-textSecondary">Nothing yet.</p> : (
          <div className="overflow-x-auto border-t border-fb-border">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary bg-fb-gray/40">
                <tr><th scope="col" className={`${cell} text-left`}>Date</th><th scope="col" className={`${cell} text-left`}>Entry</th>
                  <th scope="col" className={`${cell} text-right`}>Charge</th><th scope="col" className={`${cell} text-right`}>Payment</th>
                  <th scope="col" className={`${cell} text-right`}>Balance</th></tr>
              </thead>
              <tbody className="divide-y divide-fb-border tabular-nums">
                {s.ledger.map((l) => (
                  <tr key={`${l.kind}-${l.refId}`}>
                    <td className={`${cell} whitespace-nowrap`}>{formatDay(l.date)}</td>
                    <td className={cell}>{l.description}</td>
                    <td className={`${cell} text-right`}>{l.debit ? formatPeso(l.debit) : ''}</td>
                    <td className={`${cell} text-right`}>{l.credit ? formatPeso(l.credit) : ''}</td>
                    <td className={`${cell} text-right font-bold`}>{formatPeso(l.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  );
};
