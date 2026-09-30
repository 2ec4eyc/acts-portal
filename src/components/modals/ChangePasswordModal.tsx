import React, { useState } from 'react';
import {
  CheckCircle,
  AlertCircle,
  RefreshCw,
  X,
  KeyRound,
} from 'lucide-react';
import { updatePassword } from 'firebase/auth';

import { FormField } from '../FormField';
import { auth } from '../../lib/firebase';

export const ChangePasswordModal = ({ onClose }: { onClose: () => void }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-fb-border p-8 text-center space-y-6 animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-fb-textPrimary tracking-tight">Password Updated</h2>
          <p className="text-fb-textSecondary font-medium text-sm leading-relaxed">Your password has been updated successfully. You can now use your new password for future logins.</p>
          <button onClick={onClose} className="w-full bg-fb-blue text-white py-4 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg shadow-fb-blue/20 active:scale-95">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-fb-border p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-fb-blue/10 text-fb-blue rounded-lg">
              <KeyRound size={24} />
            </div>
            <h2 className="text-xl font-bold text-fb-textPrimary tracking-tight">Update Password</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-fb-hover rounded-full transition-all">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleUpdate} className="space-y-6">
          {error && <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-bold flex items-center gap-2"><AlertCircle size={16} /><span>{error}</span></div>}
          <div className="space-y-4">
            <FormField label="New Password" name="newPassword" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" placeholder="Minimum 6 characters" />
            <FormField label="Confirm New Password" name="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" placeholder="Confirm new password" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-lg font-bold text-sm text-fb-textSecondary hover:bg-fb-hover transition-all">Cancel</button>
            <button type="submit" disabled={loading} className="bg-fb-blue text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-md hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2">
              {loading ? <RefreshCw className="animate-spin" size={18} /> : <CheckCircle size={18} />}
              {loading ? 'Updating...' : 'Save Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
