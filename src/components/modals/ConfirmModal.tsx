export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

export const ConfirmModal = ({
  isOpen,
  title,
  message,
  confirmText,
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  variant = 'info'
}: ConfirmModalProps) => {
  if (!isOpen) return null;

  const btnColors = {
    danger: 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-400',
    info: 'bg-fb-blue hover:bg-blue-600 text-white focus:ring-fb-blue'
  }[variant];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-[2rem] max-w-md w-full p-6 border border-fb-border shadow-2xl space-y-6 animate-in zoom-in-95 duration-200 text-left">
        <div className="space-y-2">
          <h3 className="text-xl font-black text-fb-textPrimary uppercase italic tracking-tight">{title}</h3>
          <p className="text-fb-textSecondary text-sm font-semibold leading-relaxed">{message}</p>
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-fb-border text-fb-textSecondary hover:bg-fb-gray transition-all text-xs font-black uppercase tracking-wider cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2.5 rounded-xl transition-all text-xs font-black uppercase tracking-wider shadow-md active:scale-95 cursor-pointer ${btnColors}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
