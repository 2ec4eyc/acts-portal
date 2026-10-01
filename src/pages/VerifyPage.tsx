import { useEffect, useState } from 'react';
import { BadgeCheck, CircleX, RefreshCw, SearchX } from 'lucide-react';

import { ActsLogo } from '../components/ActsLogo';
import { ApiError } from '../lib/api';
import { formatDate, verifyTranscript, type Verification } from '../lib/transcripts';

/** Public page behind the QR code on a transcript: /verify/<code>. No sign-in, no grades. */
export const VerifyPage = ({ code }: { code: string }) => {
  const [result, setResult] = useState<Verification | null>(null);
  const [state, setState] = useState<'loading' | 'found' | 'missing' | 'error'>('loading');

  useEffect(() => {
    document.title = 'Verify Transcript · ACTS Bible School';
    verifyTranscript(code)
      .then((r) => { setResult(r); setState('found'); })
      .catch((e) => setState(e instanceof ApiError && e.status === 404 ? 'missing' : 'error'));
  }, [code]);

  const valid = result?.status === 'valid';
  return (
    <main className="min-h-screen flex items-center justify-center bg-fb-gray p-4">
      <div className="w-full max-w-md bg-white p-8 md:p-10 rounded-[2rem] shadow-xl text-center space-y-6">
        <ActsLogo className="w-16 h-16 mx-auto" />
        <h1 className="text-xl font-black uppercase italic tracking-tight text-fb-textPrimary">Transcript Verification</h1>
        <p className="font-mono text-sm font-bold text-fb-textSecondary break-all" translate="no">{code}</p>

        {state === 'loading' && <p className="flex items-center justify-center gap-2 text-sm text-fb-textSecondary"><RefreshCw size={16} className="animate-spin" /> Checking…</p>}

        {state === 'found' && result && (
          <div aria-live="polite" className="space-y-5">
            <div className={`flex flex-col items-center gap-2 p-5 rounded-2xl ${valid ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
              {valid ? <BadgeCheck size={40} aria-hidden="true" /> : <CircleX size={40} aria-hidden="true" />}
              <p className="text-lg font-black">{valid ? 'Valid transcript' : 'This transcript has been revoked'}</p>
              {!valid && result.revokedAt && <p className="text-xs">Revoked on {formatDate(result.revokedAt)}. Ask the school for a current copy.</p>}
            </div>
            <dl className="text-left divide-y divide-fb-border border-y border-fb-border text-sm">
              {[
                ['School', result.school],
                ['Student', result.studentName],
                ['Student no.', result.studentNo ?? '—'],
                ['Issued', formatDate(result.issuedAt)],
                ['Issued by', result.issuedBy ?? '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-fb-textSecondary">{label}</dt>
                  <dd className="font-bold text-fb-textPrimary text-right break-words min-w-0">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-fb-textSecondary">
              This page confirms the transcript is genuine. It does not show grades: compare them with the printed copy
              you were given, and contact the school if anything differs.
            </p>
          </div>
        )}

        {state === 'missing' && (
          <div aria-live="polite" className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-amber-50 text-amber-900">
            <SearchX size={40} aria-hidden="true" />
            <p className="text-lg font-black">No transcript found</p>
            <p className="text-xs">Check that the code matches the one printed on the transcript. If it does, the document was not issued by this school.</p>
          </div>
        )}
        {state === 'error' && <p role="alert" className="text-sm font-bold text-red-700">Couldn't check right now. Please try again in a moment.</p>}
      </div>
    </main>
  );
};
