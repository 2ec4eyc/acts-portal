import { useEffect, useState } from 'react';
import { AlertCircle, ArrowDown, Ban, FileCheck2, RefreshCw, X } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { formatName } from '../../lib/format';
import {
  downloadTranscriptPdf, fetchTranscript, fetchTranscripts, formatDate, formatGrade, formatUnits, issueTranscript,
  previewTranscript, revokeTranscript, termLabel,
  type TranscriptContent, type TranscriptSummary,
} from '../../lib/transcripts';
import type { UserProfile } from '../../types';

const errorText = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'Something went wrong');

/** The transcript as it would be issued (or was issued): terms, courses, units, grades. */
export const TranscriptTable = ({ content }: { content: TranscriptContent }) => (
  <div className="space-y-4">
    {content.terms.map((term) => (
      <div key={`${term.schoolYear}-${term.yearLevel}-${term.semester}`} className="border border-fb-border rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-fb-gray/60 text-[10px] font-black uppercase tracking-widest text-fb-textPrimary">{termLabel(term)}</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary">
              <th scope="col" className="text-left px-4 py-2">Course</th>
              <th scope="col" className="text-right px-4 py-2">Units</th>
              <th scope="col" className="text-right px-4 py-2">Grade</th>
              <th scope="col" className="text-left px-4 py-2">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {term.courses.map((c) => (
              <tr key={c.name} className="border-t border-fb-border">
                <td className="px-4 py-2 font-bold text-fb-textPrimary">{c.name}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatUnits(c.units)}</td>
                <td className="px-4 py-2 text-right font-black tabular-nums">{formatGrade(c)}</td>
                <td className={`px-4 py-2 text-xs font-bold ${c.remark === 'Passed' ? 'text-emerald-700' : c.remark === 'Failed' ? 'text-red-700' : 'text-amber-700'}`}>{c.remark}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 text-right text-[10px] font-bold text-fb-textSecondary border-t border-fb-border">Units earned: {formatUnits(term.unitsEarned)}</div>
      </div>
    ))}
    <dl className="grid grid-cols-3 gap-3 text-center">
      {[
        ['Units attempted', formatUnits(content.totals.unitsAttempted)],
        ['Units earned', formatUnits(content.totals.unitsEarned)],
        ['General average', content.totals.generalAverage === null ? '—' : content.totals.generalAverage.toFixed(2)],
      ].map(([label, value]) => (
        <div key={label} className="bg-fb-gray/50 rounded-xl p-3">
          <dt className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary">{label}</dt>
          <dd className="text-lg font-black text-fb-textPrimary tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  </div>
);

/** Issued transcripts with download (everyone who can open this), plus issue/revoke for admins. */
export const TranscriptList = ({ studentId, canIssue, reloadKey = 0, onChanged }: {
  studentId: string; canIssue: boolean; reloadKey?: number; onChanged?: () => void;
}) => {
  const [items, setItems] = useState<TranscriptSummary[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = () => fetchTranscripts(studentId).then(setItems).catch((e) => setError(errorText(e)));
  useEffect(() => { load(); }, [studentId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async (id: string) => {
    setBusyId(id);
    try { await downloadTranscriptPdf(await fetchTranscript(id)); }
    catch (e) { setError(errorText(e)); }
    finally { setBusyId(null); }
  };
  const revoke = async (id: string) => {
    setBusyId(id);
    try { await revokeTranscript(id, reason.trim()); setRevokingId(null); setReason(''); await load(); onChanged?.(); }
    catch (e) { setError(errorText(e)); }
    finally { setBusyId(null); }
  };

  if (error) return <p role="alert" className="text-sm font-bold text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</p>;
  if (!items) return <p className="text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading transcripts…</p>;
  if (!items.length) return <p className="text-sm text-fb-textSecondary">No official transcript has been issued yet.</p>;

  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t.id} className="border border-fb-border rounded-xl p-3 md:p-4 space-y-2">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-fb-textPrimary">
                Issued {formatDate(t.issuedAt)}
                {t.revokedAt
                  ? <span className="ml-2 px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-[9px] font-black uppercase tracking-widest align-middle">Revoked</span>
                  : <span className="ml-2 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-widest align-middle">Valid</span>}
              </p>
              <p className="text-xs text-fb-textSecondary break-words">
                By {t.issuedBy ?? 'unknown'}{t.purpose ? ` · Purpose: ${t.purpose}` : ''} · Code <span className="font-mono font-bold">{t.code}</span>
              </p>
              {t.revokedAt && <p className="text-xs text-red-700 break-words">Revoked {formatDate(t.revokedAt)} by {t.revokedBy ?? 'unknown'}: {t.revokeReason}</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => download(t.id)} disabled={busyId === t.id}
                className="px-3 py-2 bg-white text-fb-blue hover:bg-fb-blue hover:text-white rounded-lg text-[10px] font-black uppercase tracking-widest border border-fb-blue/20 transition-colors flex items-center gap-1.5 disabled:opacity-50">
                {busyId === t.id ? <RefreshCw size={12} className="animate-spin" /> : <ArrowDown size={12} />} PDF
              </button>
              {canIssue && !t.revokedAt && (
                <button type="button" onClick={() => { setRevokingId(revokingId === t.id ? null : t.id); setReason(''); }}
                  className="px-3 py-2 bg-white text-red-700 hover:bg-red-50 rounded-lg text-[10px] font-black uppercase tracking-widest border border-red-200 transition-colors flex items-center gap-1.5">
                  <Ban size={12} /> Revoke
                </button>
              )}
            </div>
          </div>
          {revokingId === t.id && (
            <form className="flex flex-col md:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); revoke(t.id); }}>
              <label htmlFor={`revoke-${t.id}`} className="sr-only">Reason for revoking</label>
              <input id={`revoke-${t.id}`} name="reason" autoComplete="off" required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Reason, e.g. issued with a wrong grade…"
                className="flex-1 border-2 border-fb-gray rounded-xl px-3 py-2 text-sm outline-none focus:border-red-400" />
              <button type="submit" disabled={!reason.trim() || busyId === t.id}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Confirm revoke</button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
};

export const TranscriptModal = ({ student, canIssue, onClose }: { student: UserProfile; canIssue: boolean; onClose: () => void }) => {
  const [preview, setPreview] = useState<TranscriptContent | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [purpose, setPurpose] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!canIssue) return;
    previewTranscript(student.uid).then(setPreview).catch((e) => setPreviewError(errorText(e)));
  }, [student.uid, canIssue, reloadKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const issue = async () => {
    setIssuing(true);
    try {
      const t = await issueTranscript(student.uid, purpose);
      setPurpose('');
      setReloadKey((k) => k + 1);
      await downloadTranscriptPdf(t);
    } catch (e) { setPreviewError(errorText(e)); }
    finally { setIssuing(false); }
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="transcript-title">
      <div className="bg-white w-full max-w-3xl max-h-[95vh] overflow-y-auto overscroll-contain rounded-[2rem] shadow-2xl border border-fb-border">
        <div className="p-5 md:p-6 border-b border-fb-border flex items-start gap-4 sticky top-0 bg-white z-10">
          <div className="p-2.5 bg-fb-blue/10 text-fb-blue rounded-xl"><FileCheck2 size={22} /></div>
          <div className="flex-1 min-w-0">
            <h2 id="transcript-title" className="text-lg md:text-xl font-black text-fb-textPrimary italic tracking-tight">Official Transcript</h2>
            <p className="text-xs text-fb-textSecondary truncate">{formatName(student)} · {student.studentId || 'No student no.'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 bg-white hover:bg-fb-gray rounded-full border border-fb-border"><X size={18} /></button>
        </div>

        <div className="p-5 md:p-6 space-y-8">
          <section className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">Issued transcripts</h3>
            <TranscriptList studentId={student.uid} canIssue={canIssue} reloadKey={reloadKey} />
          </section>

          {canIssue && (
            <section className="space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">Issue a new transcript</h3>
              <p className="text-xs text-fb-textSecondary">
                Lists every finished course (graded or Incomplete). Courses without a grade yet are left off. Once issued, the
                transcript is frozen: later grade changes don't alter it. To correct one, revoke it and issue a new one.
              </p>
              {previewError && <p role="alert" className="text-sm font-bold text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {previewError}</p>}
              {!preview && !previewError && <p className="text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>}
              {preview && (preview.terms.length
                ? <>
                    <TranscriptTable content={preview} />
                    <form className="flex flex-col md:flex-row gap-2 pt-2" onSubmit={(e) => { e.preventDefault(); issue(); }}>
                      <label htmlFor="transcript-purpose" className="sr-only">Purpose (optional)</label>
                      <input id="transcript-purpose" name="purpose" autoComplete="off" maxLength={200} value={purpose} onChange={(e) => setPurpose(e.target.value)}
                        placeholder="Purpose (optional), e.g. For transfer…"
                        className="flex-1 border-2 border-fb-gray rounded-xl px-3 py-2.5 text-sm outline-none focus:border-fb-blue" />
                      <button type="submit" disabled={issuing}
                        className="px-5 py-2.5 bg-fb-blue text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-fb-blue/20 disabled:opacity-50 flex items-center justify-center gap-2">
                        {issuing && <RefreshCw size={12} className="animate-spin" />} Issue &amp; Download
                      </button>
                    </form>
                  </>
                : <p className="text-sm text-fb-textSecondary">This student has no finished courses yet, so there is nothing to put on a transcript.</p>)}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
