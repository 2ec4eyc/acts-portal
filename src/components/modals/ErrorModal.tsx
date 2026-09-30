import { AlertCircle, X } from 'lucide-react';

export const ErrorModal = ({ message, onClose }: { message: string, onClose: () => void }) => (
  <div className="fixed inset-0 bg-fb-textPrimary/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
      <div className="p-6 border-b border-fb-border flex justify-between items-center bg-red-50">
        <h3 className="font-black italic uppercase text-red-700 tracking-tight flex items-center gap-2">
          <AlertCircle className="text-red-500" size={20} />
          Error
        </h3>
        <button onClick={onClose} className="p-2 bg-white hover:bg-red-100 rounded-full transition-all text-red-700 shadow-sm">
          <X size={16} />
        </button>
      </div>
      <div className="p-6">
        <p className="text-sm text-fb-textSecondary whitespace-pre-wrap leading-relaxed font-medium">
          {message}
        </p>
      </div>
      <div className="p-6 border-t border-fb-border bg-fb-gray/50 flex justify-end">
        <button onClick={onClose} className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-md hover:shadow-lg active:scale-95">
          Close
        </button>
      </div>
    </div>
  </div>
);
