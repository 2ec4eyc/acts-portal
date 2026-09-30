import { CheckCircle, X } from 'lucide-react';

export const SuccessModal = ({ message, onClose }: { message: string, onClose: () => void }) => (
  <div className="fixed inset-0 bg-fb-textPrimary/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
      <div className="p-6 border-b border-fb-border flex justify-between items-center bg-fb-gray/50">
        <h3 className="font-black italic uppercase text-fb-textPrimary tracking-tight flex items-center gap-2">
          <CheckCircle className="text-emerald-500" size={20} />
          Success
        </h3>
        <button onClick={onClose} className="p-2 bg-white hover:bg-gray-100 rounded-full transition-all text-fb-textPrimary shadow-sm">
          <X size={16} />
        </button>
      </div>
      <div className="p-6">
        <p className="text-sm text-fb-textSecondary whitespace-pre-wrap leading-relaxed font-medium">
          {message}
        </p>
      </div>
      <div className="p-6 border-t border-fb-border bg-fb-gray/50 flex justify-end">
        <button onClick={onClose} className="px-6 py-2.5 bg-fb-blue text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md hover:shadow-lg active:scale-95">
          Close
        </button>
      </div>
    </div>
  </div>
);
