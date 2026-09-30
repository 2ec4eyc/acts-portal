import { User as UserIcon, X, Clock } from 'lucide-react';

import type { EditHistoryEntry } from '../../types';

export const HistoryModal = ({ history, onClose }: { history: EditHistoryEntry[], onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-[2.5rem] shadow-2xl border border-fb-border flex flex-col">
        <div className="p-8 border-b border-fb-border bg-fb-gray/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-fb-blue/10 text-fb-blue rounded-lg">
              <Clock size={24} />
            </div>
            <h2 className="text-xl font-bold text-fb-textPrimary tracking-tight">Update History</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-fb-hover rounded-full transition-all">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-4">
          {!history || history.length === 0 ? (
            <div className="py-20 text-center opacity-30">
              <p className="font-black uppercase text-[10px] tracking-widest italic">No history records found</p>
            </div>
          ) : (
            history.slice().reverse().map((entry) => (
              <div key={entry.id} className="p-5 rounded-2xl bg-fb-gray/30 border border-fb-border space-y-2">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-black text-fb-blue uppercase tracking-widest italic">{entry.action}</span>
                  <span className="text-[10px] font-bold text-fb-textSecondary uppercase italic">{entry.timestamp}</span>
                </div>
                <p className="text-sm font-bold text-fb-textPrimary">{entry.details}</p>
                <div className="flex items-center gap-2 pt-2 border-t border-fb-border/50">
                  <UserIcon size={12} className="text-fb-textSecondary" />
                  <span className="text-[10px] font-black text-fb-textSecondary uppercase tracking-tighter">Edited by: <span className="text-fb-textPrimary">{entry.editedBy}</span></span>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-6 border-t border-fb-border bg-fb-gray/5 flex justify-end">
          <button onClick={onClose} className="px-8 py-3 bg-white hover:bg-fb-hover text-fb-textPrimary border-2 border-fb-border rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">Close History</button>
        </div>
      </div>
    </div>
  );
};
