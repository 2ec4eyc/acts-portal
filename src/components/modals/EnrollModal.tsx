import React, { useState } from 'react';
import { RefreshCw, X, Check } from 'lucide-react';

import type { UserProfile } from '../../types';

export const EnrollModal = ({ 
  selectedUsers, 
  onClose, 
  onEnroll 
}: { 
  selectedUsers: UserProfile[], 
  onClose: () => void, 
  onEnroll: (yearLevel: string, batchName: string, schoolYear: string) => void 
}) => {
  const [yearLevel, setYearLevel] = useState('');
  const [batchName, setBatchName] = useState('');
  const [schoolYear, setSchoolYear] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const isValidSchoolYear = /^\d{4}-\d{4}$/.test(schoolYear);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitted(true);
    if (!yearLevel || !batchName || !schoolYear || !isValidSchoolYear) {
      return;
    }
    setIsSubmitting(true);
    await onEnroll(yearLevel, batchName, schoolYear);
    setIsSubmitting(false);
  };

  const studentCount = selectedUsers.filter(u => u.role === 'student').length;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-fb-border overflow-hidden">
        <div className="p-6 border-b border-fb-border bg-fb-gray/30 flex justify-between items-center">
          <h3 className="text-lg font-black text-fb-textPrimary uppercase tracking-widest">Mass Enroll Students</h3>
          <button onClick={onClose} className="p-2 hover:bg-fb-gray rounded-full transition-colors"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-fb-blue/5 text-fb-blue p-3 rounded-xl text-xs font-bold mb-4">
            You are about to enroll {studentCount} student{studentCount !== 1 ? 's' : ''}.
          </div>
          
          <div className="space-y-1">
            <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">Year Level</label>
            <select 
              value={yearLevel} 
              onChange={(e) => setYearLevel(e.target.value)}
              className={`w-full bg-fb-gray border ${hasSubmitted && !yearLevel ? 'border-red-500' : 'border-transparent'} rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-fb-blue text-xs font-semibold transition-all`}
            >
              <option value="" disabled>Select Year Level</option>
              <option value="1st Year">1st Year</option>
              <option value="2nd Year">2nd Year</option>
            </select>
          </div>
          
          <div className="space-y-1">
            <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">Batch Name</label>
            <input 
              type="text" 
              value={batchName} 
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g. Batch 2024"
              className={`w-full bg-fb-gray border ${hasSubmitted && !batchName ? 'border-red-500' : 'border-transparent'} rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-fb-blue text-xs font-semibold transition-all`}
            />
          </div>
          
          <div className="space-y-1">
            <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">{yearLevel || '1st Year'} School Year</label>
            <input 
              type="text" 
              value={schoolYear} 
              onChange={(e) => setSchoolYear(e.target.value)}
              placeholder="e.g. 2024-2025"
              className={`w-full bg-fb-gray border ${hasSubmitted && (!schoolYear || !isValidSchoolYear) ? 'border-red-500' : 'border-transparent'} rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-fb-blue text-xs font-semibold transition-all`}
            />
          </div>

          <div className="pt-4 flex flex-col gap-3">
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-xs bg-fb-gray text-fb-textPrimary hover:bg-gray-200 transition-all">Cancel</button>
              <button type="submit" disabled={isSubmitting || studentCount === 0} className="flex-1 py-3 rounded-xl font-bold text-xs bg-fb-blue text-white hover:bg-blue-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {isSubmitting ? <RefreshCw className="animate-spin" size={14} /> : <Check size={14} />}
                <span>Enroll</span>
              </button>
            </div>
            {hasSubmitted && (!yearLevel || !batchName || !schoolYear) ? (
              <p className="text-red-500 text-[10px] font-bold text-center uppercase tracking-widest animate-in fade-in">Please fill in the required fields.</p>
            ) : hasSubmitted && !isValidSchoolYear ? (
              <p className="text-red-500 text-[10px] font-bold text-center uppercase tracking-widest animate-in fade-in">Please follow this format: 2024-2025</p>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
};
