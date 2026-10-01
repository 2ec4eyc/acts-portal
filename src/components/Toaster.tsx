import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

import { dismissToast, subscribeToasts, type Toast } from '../lib/toast';

const STYLE = {
  success: { icon: CheckCircle, color: 'text-emerald-600', bar: 'border-l-emerald-500' },
  error: { icon: AlertCircle, color: 'text-red-600', bar: 'border-l-red-500' },
  info: { icon: Info, color: 'text-fb-blue', bar: 'border-l-fb-blue' },
};

/** Shows in-app notices (see src/lib/toast.ts): bottom of the screen on phones, top-right on desktop. */
export const Toaster = () => {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setItems), []);
  return (
    <div className="fixed z-[200] inset-x-4 bottom-4 sm:inset-x-auto sm:bottom-auto sm:top-4 sm:right-4 sm:w-96 flex flex-col gap-2 pointer-events-none">
      {items.map((t) => {
        const s = STYLE[t.kind];
        const Icon = s.icon;
        return (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto bg-white border border-fb-border border-l-4 ${s.bar} rounded-xl shadow-lg px-4 py-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-200`}>
            <Icon size={18} aria-hidden="true" className={`shrink-0 mt-0.5 ${s.color}`} />
            <p className="flex-1 text-sm font-semibold text-fb-textPrimary whitespace-pre-wrap break-words">{t.message}</p>
            <button type="button" onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="shrink-0 p-1 -m-1 rounded-lg text-fb-textSecondary hover:bg-fb-hover">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
