import { RefreshCw, ShieldAlert } from 'lucide-react';

export const PermissionDeniedGate = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-4 animate-in fade-in duration-500">
    <div className="p-4 bg-rose-50 text-rose-600 rounded-full">
      <ShieldAlert size={48} />
    </div>
    <h2 className="text-xl font-black uppercase italic tracking-tighter text-fb-textPrimary">Access Restricted</h2>
    <p className="text-fb-textSecondary text-sm max-w-md font-medium leading-relaxed">
      {message}. Your current role or Firestore security rules do not allow access to this resource.
    </p>
    <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-fb-blue text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center gap-2">
      <RefreshCw size={14} /> Refresh Application
    </button>
  </div>
);
