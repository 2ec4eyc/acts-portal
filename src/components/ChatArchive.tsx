import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Archive, Download, RefreshCw } from 'lucide-react';

import { Card } from './Card';
import { ConfirmModal } from './modals/ConfirmModal';
import { archiveCsv, archivePdf, fetchArchive, fetchArchiveSummary, purgeArchive, saveBlob, type ArchiveSummary } from '../lib/chat';
import { formatBytes } from '../lib/storage';

const manilaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const yearAgo = () => {
  const d = new Date(`${manilaToday()}T00:00:00`);
  d.setFullYear(d.getFullYear() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Settings → Storage: chat's size, and the yearly clean-up. Messages before a date are downloaded as a
 * PDF (to read or print) and a CSV (for spreadsheets); only then can they be removed from the portal.
 */
export const ChatArchive = () => {
  const [before, setBefore] = useState(yearAgo);
  const [s, setS] = useState<ArchiveSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<{ before: string; count: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(() => {
    fetchArchiveSummary(before).then(setS).catch((e) => setMessage({ ok: false, text: e.message }));
  }, [before]);
  useEffect(() => { setDownloaded(null); refresh(); }, [refresh]);

  const download = async (thenArchive: boolean) => {
    if (!s?.olderMessages) return;
    setMessage(null);
    try {
      setBusy('Collecting messages… 0');
      const rows = await fetchArchive(before, (n) => setBusy(`Collecting messages… ${n} of ${s.olderMessages}`));
      setBusy('Making the PDF…');
      const from = rows[0]?.createdAt.slice(0, 10) ?? before;
      const name = `acts-chat-${from}-to-${before}`;
      saveBlob(archiveCsv(rows), `${name}.csv`);
      saveBlob(await archivePdf(rows, before), `${name}.pdf`);
      setDownloaded({ before, count: rows.length });
      setMessage({ ok: true, text: `Downloaded ${rows.length} messages as ${name}.pdf and ${name}.csv.` });
      if (thenArchive) setConfirm(true);
    } catch (e) { setMessage({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  };

  const purge = async () => {
    if (!downloaded) return;
    setConfirm(false); setBusy('Removing…');
    try {
      const r = await purgeArchive(downloaded.before, downloaded.count);
      setMessage({ ok: true, text: `Removed ${r.removed} archived messages from the portal. Keep the downloaded files somewhere safe.` });
      setDownloaded(null);
      refresh();
    } catch (e) { setMessage({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  };

  return (
    <Card title="Chat history">
      <div className="space-y-4">
        <p className="text-sm text-fb-textSecondary">
          Messages are stored in the portal's database. Once a year, download the old ones (a PDF to read or print, and a CSV for spreadsheets), then remove them to keep the database small.
        </p>
        {s && (
          <p className="text-sm text-fb-textPrimary">
            <b className="tabular-nums">{s.totalMessages.toLocaleString()}</b> messages in total, using <b>{formatBytes(s.totalBytes)}</b>.
          </p>
        )}
        <label className="flex flex-wrap items-center gap-3 text-sm font-bold text-fb-textPrimary">
          Messages sent before
          <input type="date" value={before} max={manilaToday()} onChange={(e) => e.target.value && setBefore(e.target.value)}
            className="bg-white border-2 border-fb-gray rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-fb-blue" />
        </label>
        {s && (
          <p className="text-sm text-fb-textSecondary">
            {s.olderMessages
              ? <><b className="text-fb-textPrimary tabular-nums">{s.olderMessages.toLocaleString()}</b> messages in {s.olderConversations} conversation{s.olderConversations === 1 ? '' : 's'} ({formatBytes(s.olderBytes)} of text), the oldest from {new Date(s.oldestAt!).toLocaleDateString('en-US', { dateStyle: 'medium' })}.</>
              : 'No messages before this date.'}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy || !s?.olderMessages} onClick={() => download(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-fb-blue text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40">
            <Archive size={13} /> Download and archive
          </button>
          <button type="button" disabled={!!busy || !s?.olderMessages} onClick={() => download(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-fb-border text-[10px] font-black uppercase tracking-widest hover:bg-fb-hover disabled:opacity-40">
            <Download size={13} /> Download only
          </button>
          {downloaded && !busy && (
            <button type="button" onClick={() => setConfirm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest">
              Remove the {downloaded.count} downloaded messages
            </button>
          )}
        </div>
        {busy && <p role="status" className="text-sm font-bold text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> {busy}</p>}
        {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm font-bold flex items-center gap-2 ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{!message.ok && <AlertCircle size={14} />} {message.text}</p>}
      </div>
      <ConfirmModal isOpen={confirm} variant="danger" title="Remove archived messages?"
        message={`Remove the ${downloaded?.count ?? 0} messages sent before ${downloaded?.before ?? ''} from the portal? Check that both downloaded files open, and keep them somewhere safe. This can't be undone.`}
        confirmText="Remove messages" cancelText="Not now" onConfirm={purge} onCancel={() => setConfirm(false)} />
    </Card>
  );
};
