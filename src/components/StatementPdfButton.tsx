import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';

import type { Statement } from '../lib/finance';
import { downloadStatementPdf } from '../lib/statementPdf';
import { toast } from '../lib/toast';

/** Saves the statement of account shown on screen as a PDF. */
export const StatementPdfButton = ({ s }: { s: Statement | null }) => {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (!s) return;
    setBusy(true);
    try { await downloadStatementPdf(s); }
    catch (e) { toast.error(`Couldn't make the PDF: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={download} disabled={!s || busy}
      className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-fb-blue text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
      {busy ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />} Download statement (PDF)
    </button>
  );
};
