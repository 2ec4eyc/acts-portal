import { useState } from 'react';
import {
  CheckCircle,
  RefreshCw,
  X,
  KeyRound,
  Mail,
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';

import { auth } from '../../lib/firebase';
import type { UserProfile } from '../../types';
import { toast } from '../../lib/toast';

export const PasswordResetModal = ({ user, onClose }: { user: UserProfile, onClose: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSendReset = async () => {
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setSent(true);
    } catch (err: any) {
      toast.error("Failed to send reset link: " + err.message);
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-fb-border p-8 text-center space-y-6 animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-fb-textPrimary tracking-tight">Email Sent</h2>
          <p className="text-fb-textSecondary font-medium text-sm leading-relaxed">
            A password reset link has been sent to <span className="text-fb-textPrimary font-bold">{user.email}</span>. 
            The user can follow the instructions in the email to reset their password.
          </p>
          <button onClick={onClose} className="w-full bg-fb-blue text-white py-4 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg shadow-fb-blue/20 active:scale-95">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-fb-border p-8 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-fb-blue/10 text-fb-blue rounded-lg">
              <KeyRound size={24} />
            </div>
            <h2 className="text-xl font-bold text-fb-textPrimary tracking-tight">Password Reset</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-fb-hover rounded-full transition-all">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm font-semibold text-fb-textSecondary mb-8 leading-relaxed">
          Are you sure you want to send a password reset link to <span className="text-fb-textPrimary font-bold">{user.email}</span>? 
          This will allow the user to choose a new password themselves.
        </p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-lg font-bold text-sm text-fb-textSecondary hover:bg-fb-hover transition-all">Cancel</button>
          <button 
            onClick={handleSendReset} 
            disabled={loading} 
            className="bg-fb-blue text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-md hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <RefreshCw className="animate-spin" size={18} /> : <Mail size={18} />}
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </div>
      </div>
    </div>
  );
};
