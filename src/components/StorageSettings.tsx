import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Eye, RefreshCw, Trash2 } from 'lucide-react';

import { Card } from './Card';
import { StatusChip } from './StatementView';
import { ConfirmModal } from './modals/ConfirmModal';
import { formatDay, openReceipt } from '../lib/finance';
import { fetchStorageSettings, updateStorageSettings, type StorageSettings as Limits } from '../lib/settings';
import {
  deleteFiles, fetchFiles, fetchStorage, formatBytes, recountStorage, type FileFilter, type StorageUsage, type StoredFile,
} from '../lib/storage';

const FREE_TIER_BYTES = 10e9;
const LEVEL_STYLES = {
  ok: { bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800', label: 'OK' },
  warn: { bar: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800', label: 'Almost full' },
  full: { bar: 'bg-red-600', chip: 'bg-red-100 text-red-800', label: 'Full: uploads stopped' },
};
const formatWhen = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const num = 'w-24 bg-white border-2 border-fb-gray rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-fb-blue tabular-nums';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-fb-border text-[10px] font-black uppercase tracking-wider hover:bg-fb-hover disabled:opacity-50';

const UsageCard = ({ u, onRecount, recounting }: { u: StorageUsage; onRecount: () => void; recounting: boolean }) => {
  const scale = Math.max(u.limitBytes, u.usedBytes, 1);
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  const style = LEVEL_STYLES[u.level];
  return (
    <Card title="Storage">
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-2xl md:text-3xl font-black tabular-nums text-fb-textPrimary">{formatBytes(u.usedBytes)}</p>
          <p className="text-sm font-bold text-fb-textSecondary">of {formatBytes(u.limitBytes)} limit</p>
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${style.chip}`}>{style.label}</span>
        </div>
        <div className="relative h-3 rounded-full bg-fb-gray overflow-visible" role="meter" aria-label="Receipt storage used"
          aria-valuemin={0} aria-valuemax={u.limitBytes} aria-valuenow={u.usedBytes} aria-valuetext={`${formatBytes(u.usedBytes)} of ${formatBytes(u.limitBytes)}`}>
          <div className={`h-full rounded-full ${style.bar}`} style={{ width: pct(u.usedBytes), minWidth: u.usedBytes ? 4 : 0 }} />
          <div className="absolute -top-1 -bottom-1 w-0.5 bg-amber-600" style={{ left: pct(u.warnBytes) }} title={`Warning at ${formatBytes(u.warnBytes)}`} />
        </div>
        <p className="text-xs text-fb-textSecondary">
          Admins are notified at {formatBytes(u.warnBytes)} (amber mark). At {formatBytes(u.limitBytes)} students can't upload receipts until space is freed or the limit is raised.
          {u.mode === 'r2' && ` Cloudflare R2's free tier is ${formatBytes(FREE_TIER_BYTES)}.`}
        </p>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {(['pending', 'approved', 'rejected'] as const).map((s) => (
            <div key={s} className="rounded-xl border border-fb-border p-3">
              <dt className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">{s}</dt>
              <dd className="font-black tabular-nums">{u.byStatus[s].files} <span className="font-semibold text-fb-textSecondary">· {formatBytes(u.byStatus[s].bytes)}</span></dd>
            </div>
          ))}
          <div className="rounded-xl border border-fb-border p-3">
            <dt className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">Files deleted</dt>
            <dd className="font-black tabular-nums">{u.deletedFiles}</dd>
          </div>
        </dl>
        {u.mode === 'r2' ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-fb-textSecondary">
            <span>
              Stored in <b>Cloudflare R2</b>.{' '}
              {u.measured?.at
                ? <>Bucket last checked {formatWhen(u.measured.at)}: {u.measured.objects} files, {formatBytes(u.measured.bytes ?? 0)}{u.measured.orphansRemoved ? `; ${u.measured.orphansRemoved} unfinished upload${u.measured.orphansRemoved === 1 ? '' : 's'} removed` : ''}. Checked automatically every morning.</>
                : 'The bucket hasn\'t been checked yet; it is checked automatically every morning.'}
            </span>
            <button type="button" onClick={onRecount} disabled={recounting} className={btn}>
              <RefreshCw size={12} className={recounting ? 'animate-spin' : ''} /> {recounting ? 'Checking…' : 'Recount now'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Receipts are stored in the <b>database</b> because Cloudflare R2 isn't set up. The database's free plan has about 0.5 GB for everything, so set a low limit here (for example warn at 0.2 GB, stop at 0.3 GB) or set up R2.
          </p>
        )}
      </div>
    </Card>
  );
};

const LimitsCard = ({ onSaved }: { onSaved: () => void }) => {
  const [saved, setSaved] = useState<Limits | null>(null);
  const [form, setForm] = useState<Limits | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { fetchStorageSettings().then((r) => { setSaved(r.value); setForm(r.value); }).catch((e) => setMessage({ ok: false, text: e.message })); }, []);
  if (!form || !saved) return message ? <p role="alert" className="text-sm font-bold text-red-700">{message.text}</p> : null;
  const changed = (Object.keys(form) as (keyof Limits)[]).filter((k) => form[k] !== saved[k]);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setMessage(null);
    if (form.warnAtGb >= form.limitGb) { setMessage({ ok: false, text: 'The warning must be lower than the limit.' }); return; }
    try {
      const r = await updateStorageSettings(Object.fromEntries(changed.map((k) => [k, form[k]])));
      setSaved(r.value); setForm(r.value); setMessage({ ok: true, text: 'Saved.' }); onSaved();
    } catch (err) { setMessage({ ok: false, text: (err as Error).message }); }
  };
  const gb = (v: string) => Math.round(Number(v) * 10) / 10;
  return (
    <Card title="Storage limits">
      <form onSubmit={save} className="space-y-4">
        <label className="flex items-center gap-3 text-sm font-bold text-fb-textPrimary">
          <input type="number" className={num} min={0.1} max={1000} step={0.1} required value={form.warnAtGb} onChange={(e) => setForm({ ...form, warnAtGb: gb(e.target.value) })} />
          GB: notify admins
        </label>
        <label className="flex items-center gap-3 text-sm font-bold text-fb-textPrimary">
          <input type="number" className={num} min={0.1} max={1000} step={0.1} required value={form.limitGb} onChange={(e) => setForm({ ...form, limitGb: gb(e.target.value) })} />
          GB: stop receipt uploads
        </label>
        <label className="flex items-center gap-3 text-sm font-bold text-fb-textPrimary">
          <input type="number" className={num} min={1} max={20} step={1} required value={form.deleteApprovedAfterYears} onChange={(e) => setForm({ ...form, deleteApprovedAfterYears: Number(e.target.value) })} />
          years: approved receipts' files can be deleted after this long
        </label>
        <p className="text-xs text-fb-textSecondary">Rejected receipts' files can be deleted any time. Pending receipts' files can't be deleted.</p>
        {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm font-bold ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.text}</p>}
        <button type="submit" disabled={changed.length === 0} className="px-5 py-2.5 bg-fb-blue text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40">Save</button>
      </form>
    </Card>
  );
};

const FilesCard = ({ onChanged, version }: { onChanged: () => void; version: number }) => {
  const [filter, setFilter] = useState<FileFilter>({ sort: 'newest' });
  const [search, setSearch] = useState('');
  const [files, setFiles] = useState<StoredFile[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (offset = 0) => {
    const r = await fetchFiles({ ...filter, offset });
    setFiles((prev) => (offset ? [...(prev ?? []), ...r.files] : r.files));
    setNext(r.nextOffset);
  }, [filter]);
  useEffect(() => { setSelected(new Set()); load().catch((e) => setMessage({ ok: false, text: e.message })); }, [load, version]);
  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => (f.q === (search.trim() || undefined) ? f : { ...f, q: search.trim() || undefined })), 300);
    return () => clearTimeout(t);
  }, [search]);

  const deletable = (files ?? []).filter((x) => !x.cannotDelete);
  const chosen = deletable.filter((x) => selected.has(x.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allChosen = deletable.length > 0 && chosen.length === deletable.length;

  const remove = async () => {
    setConfirm(false); setBusy(true); setMessage(null);
    try {
      const r = await deleteFiles(chosen.map((x) => x.id));
      const parts = [`Deleted ${r.deleted} file${r.deleted === 1 ? '' : 's'}, freed ${formatBytes(r.freedBytes)}.`];
      if (r.skipped.length) parts.push(`${r.skipped.length} skipped (${[...new Set(r.skipped.map((s) => s.reason))].join('; ')}).`);
      if (r.warning) parts.push(r.warning);
      setMessage({ ok: true, text: parts.join(' ') });
      onChanged();
    } catch (e) { setMessage({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const input = 'bg-white border-2 border-fb-gray rounded-xl px-3 py-2 text-sm outline-none focus:border-fb-blue';
  return (
    <Card title="Receipt files" noPadding>
      <div className="p-4 md:p-5 space-y-3 border-b border-fb-border">
        <div className="flex flex-wrap gap-2">
          <input type="search" aria-label="Search by student or invoice" placeholder="Search student or invoice…" className={`${input} flex-1 min-w-[180px]`} value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="Status" className={input} value={filter.status ?? ''} onChange={(e) => setFilter({ ...filter, status: (e.target.value || undefined) as FileFilter['status'] })}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="deleted">File deleted</option>
          </select>
          <select aria-label="Sort" className={input} value={filter.sort} onChange={(e) => setFilter({ ...filter, sort: e.target.value as FileFilter['sort'] })}>
            <option value="newest">Newest first</option>
            <option value="largest">Largest first</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-fb-textPrimary">
            <input type="checkbox" className="accent-fb-blue w-4 h-4" checked={!!filter.deletable} onChange={(e) => setFilter({ ...filter, deletable: e.target.checked || undefined })} />
            Can be deleted only
          </label>
          <button type="button" disabled={busy || chosen.length === 0} onClick={() => setConfirm(true)}
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40">
            <Trash2 size={12} /> {busy ? 'Deleting…' : `Delete selected files${chosen.length ? ` (${chosen.length}, ${formatBytes(chosen.reduce((s, x) => s + x.sizeBytes, 0))})` : ''}`}
          </button>
        </div>
        {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm font-bold flex items-center gap-2 ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{!message.ok && <AlertCircle size={14} />} {message.text}</p>}
      </div>
      {!files ? (
        <p className="p-5 text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>
      ) : files.length === 0 ? (
        <p className="p-5 text-sm text-fb-textSecondary">No files.</p>
      ) : (
        <div className="overflow-x-auto relative">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary bg-fb-gray/40">
              <tr>
                <th scope="col" className="px-3 py-2.5 w-10">
                  <input type="checkbox" aria-label="Select every file that can be deleted" className="accent-fb-blue w-4 h-4" disabled={!deletable.length}
                    checked={allChosen} onChange={() => setSelected(allChosen ? new Set() : new Set(deletable.map((x) => x.id)))} />
                </th>
                <th scope="col" className="px-3 py-2.5 text-left">Student</th>
                <th scope="col" className="px-3 py-2.5 text-left">Uploaded</th>
                <th scope="col" className="px-3 py-2.5 text-right">Size</th>
                <th scope="col" className="px-3 py-2.5 text-left">Status</th>
                <th scope="col" className="px-3 py-2.5"><span className="sr-only">File</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fb-border">
              {files.map((x) => (
                <tr key={x.id} className={x.fileDeletedAt ? 'opacity-60' : ''}>
                  <td className="px-3 py-2.5" title={x.cannotDelete ?? 'Can be deleted'}>
                    <input type="checkbox" aria-label={`Select ${x.studentName}'s file from ${formatDay(x.createdAt)}`} className="accent-fb-blue w-4 h-4"
                      disabled={!!x.cannotDelete} checked={selected.has(x.id)} onChange={() => toggle(x.id)} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-bold">{x.studentName}</span>
                    <span className="block text-xs text-fb-textSecondary">{x.invoiceNumber ?? 'General payment'} · {x.contentType === 'application/pdf' ? 'PDF' : 'Image'}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{formatDay(x.createdAt)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatBytes(x.sizeBytes)}</td>
                  <td className="px-3 py-2.5">
                    <StatusChip status={x.status} />
                    {x.cannotDelete && !x.fileDeletedAt && <span className="block text-[11px] text-fb-textSecondary mt-0.5">{x.cannotDelete}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {x.fileDeletedAt
                      ? <span className="text-[10px] font-black uppercase text-fb-textSecondary">Deleted {formatDay(x.fileDeletedAt)}</span>
                      : <button type="button" onClick={() => openReceipt(x.id).catch((e) => setMessage({ ok: false, text: e.message }))} className={btn}><Eye size={12} /> View</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {next !== null && (
            <div className="p-4 border-t border-fb-border">
              <button type="button" className={btn} onClick={() => load(next).catch((e) => setMessage({ ok: false, text: e.message }))}>Load more</button>
            </div>
          )}
        </div>
      )}
      <ConfirmModal isOpen={confirm} variant="danger" title="Delete files?"
        message={`This removes ${chosen.length} receipt file${chosen.length === 1 ? '' : 's'} (${formatBytes(chosen.reduce((s, x) => s + x.sizeBytes, 0))}). The receipts and payments stay; only the image/PDF is removed. This can't be undone.`}
        confirmText="Delete files" onConfirm={remove} onCancel={() => setConfirm(false)} />
    </Card>
  );
};

/** Settings → Storage: usage, limits and the receipt files (admins). */
export const StorageSettings = () => {
  const [u, setU] = useState<StorageUsage | null>(null);
  const [error, setError] = useState('');
  const [recounting, setRecounting] = useState(false);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => { fetchStorage().then(setU).catch((e) => setError(e.message)); }, []);
  useEffect(refresh, [refresh]);

  const recount = async () => {
    setRecounting(true); setError('');
    try { await recountStorage(); refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setRecounting(false); }
  };

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="text-sm font-bold text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</p>}
      {u && <UsageCard u={u} onRecount={recount} recounting={recounting} />}
      <LimitsCard onSaved={refresh} />
      <FilesCard version={version} onChanged={() => { refresh(); setVersion((v) => v + 1); }} />
    </div>
  );
};
