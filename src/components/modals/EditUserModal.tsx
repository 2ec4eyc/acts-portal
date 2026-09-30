import React, { useState } from 'react';
import { RefreshCw, X, Save, UserPlus } from 'lucide-react';

import { FormField } from '../FormField';
import type { UserProfile } from '../../types';

export const EditUserModal = ({ user, onClose, onSave, isNew = false }: { user: Partial<UserProfile>, onClose: () => void, onSave: (updated: Partial<UserProfile>) => Promise<void>, isNew?: boolean }) => {
  const [formData, setFormData] = useState<Partial<UserProfile & { tempPassword?: string }>>({ ...user, tempPassword: '' });
  const [saving, setSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const fullName = `${formData.firstName || ''} ${formData.middleName || ''} ${formData.lastName || ''}`.replace(/\s+/g, ' ').trim();
    await onSave({ ...formData, fullName });
    setSaving(false);
    onClose();
  };

  const SectionHeader = ({ title, children }: { title: string, children?: React.ReactNode }) => (
    <div className="col-span-full border-b border-fb-border pb-2 mt-4 flex items-center justify-between">
      <h3 className="text-xs font-black text-fb-blue uppercase tracking-widest italic">{title}</h3>
      {children}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className={`bg-white w-full ${isNew ? 'max-w-md' : 'max-w-5xl'} max-h-[95vh] overflow-y-auto rounded-2xl shadow-2xl border border-fb-border p-6 md:p-8 custom-scrollbar`}>
        <form onSubmit={handleSubmit} className="space-y-6">
          {isNew ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl md:text-2xl font-bold text-fb-textPrimary tracking-tight">Add Account</h2>
                <button type="button" onClick={onClose} className="p-2.5 bg-fb-gray hover:bg-gray-200 rounded-full transition-all text-fb-textPrimary"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="First Name" name="firstName" value={formData.firstName || ''} onChange={handleChange} placeholder="Enter First Name" />
                <FormField label="Last Name" name="lastName" value={formData.lastName || ''} onChange={handleChange} placeholder="Enter Last Name" />
              </div>
              <FormField label="Email Address" name="email" value={formData.email || ''} onChange={handleChange} type="email" placeholder="user@example.com" />
              <FormField label="Temporary Password" name="tempPassword" value={formData.tempPassword || ''} onChange={handleChange} type="password" placeholder="Min 6 characters" />
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-fb-textSecondary ml-1">User Role</label>
                <select name="role" value={formData.role} onChange={handleChange} className="w-full bg-fb-gray border border-fb-border rounded-lg px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-fb-blue outline-none transition-all appearance-none">
                  <option value="student">STUDENT</option>
                  <option value="admin">ADMIN</option>
                  <option value="president">PRESIDENT</option>
                  <option value="vice president">VICE PRESIDENT</option>
                  <option value="teacher">TEACHER</option>
                </select>
              </div>
              {formData.role === 'admin' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-fb-textSecondary ml-1">Admin Category</label>
                  <select name="adminCategory" value={formData.adminCategory || ''} onChange={handleChange} className="w-full bg-fb-gray border border-fb-border rounded-lg px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-fb-blue outline-none transition-all appearance-none">
                    <option value="">Select Admin Category</option>
                    <option value="Day Secretary">Day Secretary</option>
                    <option value="Night Secretary">Night Secretary</option>
                    <option value="Faculty">Faculty</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
              )}
              {formData.role === 'student' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-fb-textSecondary ml-1">School Type</label>
                  <select name="schoolType" value={formData.schoolType || ''} onChange={handleChange} className="w-full bg-fb-gray border border-fb-border rounded-lg px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-fb-blue outline-none transition-all appearance-none">
                    <option value="">Select School Type</option>
                    <option value="Day School">Day School</option>
                    <option value="Night School">Night School</option>
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-x-6 gap-y-6">
              <SectionHeader title="Update Record">
                <button type="button" onClick={onClose} className="p-2 bg-fb-gray hover:bg-gray-200 rounded-full transition-all text-fb-textPrimary"><X size={16} /></button>
              </SectionHeader>
              
              <div className="md:col-span-4">
                <FormField label="Email" name="email" value={formData.email || ''} onChange={handleChange} type="email" />
              </div>
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-xs font-bold text-fb-textSecondary ml-1">Account Role</label>
                <select name="role" value={formData.role} onChange={handleChange} className="w-full bg-fb-gray border border-fb-border rounded-lg px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-fb-blue outline-none transition-all appearance-none">
                  <option value="student">STUDENT</option>
                  <option value="admin">ADMIN</option>
                  <option value="president">PRESIDENT</option>
                  <option value="vice president">VICE PRESIDENT</option>
                  <option value="teacher">TEACHER</option>
                </select>
              </div>

              {formData.role === 'admin' && (
                <div className="md:col-span-4 space-y-1.5">
                  <label className="text-xs font-bold text-fb-textSecondary ml-1">Admin Category</label>
                  <select name="adminCategory" value={formData.adminCategory || ''} onChange={handleChange} className="w-full bg-fb-gray border border-fb-border rounded-lg px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-fb-blue outline-none transition-all appearance-none">
                    <option value="">Select Admin Category</option>
                    <option value="Day Secretary">Day Secretary</option>
                    <option value="Night Secretary">Night Secretary</option>
                    <option value="Faculty">Faculty</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
              )}

              {formData.role === 'student' && (
                <>
                  <div className="md:col-span-3">
                    <FormField label="Student ID" name="studentId" value={formData.studentId || ''} onChange={handleChange} />
                  </div>
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-xs font-bold text-fb-textSecondary ml-1">Year Level</label>
                    <select name="yearLevel" value={formData.yearLevel || ''} onChange={handleChange} className="w-full bg-fb-gray border border-fb-border rounded-lg px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-fb-blue outline-none transition-all appearance-none">
                      <option value="">Select Year</option>
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <FormField label="Batch Name" name="batchName" value={formData.batchName || ''} onChange={handleChange} placeholder="e.g. Batch 2024-A" />
                  </div>
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-xs font-bold text-fb-textSecondary ml-1">School Type</label>
                    <select name="schoolType" value={formData.schoolType || ''} onChange={handleChange} className="w-full bg-fb-gray border border-fb-border rounded-lg px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-fb-blue outline-none transition-all appearance-none">
                      <option value="">Select School Type</option>
                      <option value="Day School">Day School</option>
                      <option value="Night School">Night School</option>
                    </select>
                  </div>
                  <div className="md:col-span-6 space-y-1.5">
                    <label className="text-xs font-bold text-fb-textSecondary ml-1">1st Year School Year</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        maxLength={4} 
                        className="w-full bg-fb-gray border border-fb-border rounded-lg px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-fb-blue outline-none transition-all text-center" 
                        placeholder="YYYY"
                        value={formData.firstYearSchoolYear?.split('-')[0] || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          const currentEnd = formData.firstYearSchoolYear?.split('-')[1] || '';
                          setFormData(p => ({ ...p, firstYearSchoolYear: `${val}-${currentEnd}` }));
                        }}
                      />
                      <span className="font-bold text-fb-textSecondary">-</span>
                      <input 
                        type="text" 
                        maxLength={4} 
                        className="w-full bg-fb-gray border border-fb-border rounded-lg px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-fb-blue outline-none transition-all text-center" 
                        placeholder="YYYY"
                        value={formData.firstYearSchoolYear?.split('-')[1] || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          const currentStart = formData.firstYearSchoolYear?.split('-')[0] || '';
                          setFormData(p => ({ ...p, firstYearSchoolYear: `${currentStart}-${val}` }));
                        }}
                      />
                    </div>
                  </div>
                  <div className="md:col-span-6 space-y-1.5">
                    <label className="text-xs font-bold text-fb-textSecondary ml-1">2nd Year School Year</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        maxLength={4} 
                        className="w-full bg-fb-gray border border-fb-border rounded-lg px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-fb-blue outline-none transition-all text-center" 
                        placeholder="YYYY"
                        value={formData.secondYearSchoolYear?.split('-')[0] || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          const currentEnd = formData.secondYearSchoolYear?.split('-')[1] || '';
                          setFormData(p => ({ ...p, secondYearSchoolYear: `${val}-${currentEnd}` }));
                        }}
                      />
                      <span className="font-bold text-fb-textSecondary">-</span>
                      <input 
                        type="text" 
                        maxLength={4} 
                        className="w-full bg-fb-gray border border-fb-border rounded-lg px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-fb-blue outline-none transition-all text-center" 
                        placeholder="YYYY"
                        value={formData.secondYearSchoolYear?.split('-')[1] || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          const currentStart = formData.secondYearSchoolYear?.split('-')[0] || '';
                          setFormData(p => ({ ...p, secondYearSchoolYear: `${currentStart}-${val}` }));
                        }}
                      />
                    </div>
                  </div>
                </>
              )}

              <SectionHeader title="Personal Information" />
              <div className="md:col-span-4">
                <FormField label="First Name" name="firstName" value={formData.firstName || ''} onChange={handleChange} />
              </div>
              <div className="md:col-span-4">
                <FormField label="Middle Name" name="middleName" value={formData.middleName || ''} onChange={handleChange} />
              </div>
              <div className="md:col-span-4">
                <FormField label="Last Name" name="lastName" value={formData.lastName || ''} onChange={handleChange} />
              </div>
              
              <div className="md:col-span-12">
                <FormField label="Permanent Address" name="address" value={formData.address || ''} onChange={handleChange} placeholder="House No. / Street / Village" />
              </div>
              <div className="md:col-span-4">
                <FormField label="City / Municipality" name="city" value={formData.city || ''} onChange={handleChange} placeholder="City" />
              </div>
              <div className="md:col-span-4">
                <FormField label="Province" name="province" value={formData.province || ''} onChange={handleChange} placeholder="Province" />
              </div>
              <div className="md:col-span-4">
                <FormField label="Postal Code" name="postalCode" value={formData.postalCode || ''} onChange={handleChange} placeholder="ZIP Code" />
              </div>

              <div className="md:col-span-4 space-y-1.5">
                <label className="text-xs font-bold text-fb-textSecondary ml-1">Gender</label>
                <select name="gender" value={formData.gender || ''} onChange={handleChange} className="w-full bg-fb-gray border border-fb-border rounded-lg px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-fb-blue outline-none transition-all appearance-none">
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div className="md:col-span-4">
                <FormField label="Birth Date" name="birthDate" value={formData.birthDate || ''} onChange={handleChange} type="date" />
              </div>
              <div className="md:col-span-4">
                <FormField label="Contact Number" name="contactNumber" value={formData.contactNumber || ''} onChange={handleChange} />
              </div>

              <SectionHeader title="Additional Details" />
              <div className="md:col-span-6">
                <FormField label="Church Affiliation" name="church" value={formData.church || ''} onChange={handleChange} placeholder="Name of church" />
              </div>
              <div className="md:col-span-6">
                <FormField label="Name of Pastor" name="pastorName" value={formData.pastorName || ''} onChange={handleChange} placeholder="Lead Pastor" />
              </div>
              
              <div className="md:col-span-6">
                <FormField label="Holy Ghost Baptism Date" name="holyGhostBaptismDate" value={formData.holyGhostBaptismDate || ''} onChange={handleChange} type="date" />
              </div>
              <div className="md:col-span-6">
                <FormField label="Location of Holy Ghost Baptism" name="holyGhostBaptismLocation" value={formData.holyGhostBaptismLocation || ''} onChange={handleChange} placeholder="City/Church" />
              </div>
              
              <div className="md:col-span-6">
                <FormField label="Water Baptism Date" name="waterBaptismDate" value={formData.waterBaptismDate || ''} onChange={handleChange} type="date" />
              </div>
              <div className="md:col-span-6">
                <FormField label="Location of Water Baptism" name="waterBaptismLocation" value={formData.waterBaptismLocation || ''} onChange={handleChange} placeholder="City/Church" />
              </div>

              <SectionHeader title="Emergency Contact" />
              <div className="md:col-span-3">
                <FormField label="First Name" name="emergencyFirstName" value={formData.emergencyFirstName || ''} onChange={handleChange} />
              </div>
              <div className="md:col-span-3">
                <FormField label="Last Name" name="emergencyLastName" value={formData.emergencyLastName || ''} onChange={handleChange} />
              </div>
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-xs font-bold text-fb-textSecondary ml-1">Relationship</label>
                <select name="emergencyRelationship" value={formData.emergencyRelationship || ''} onChange={handleChange} className="w-full bg-fb-gray border border-fb-border rounded-lg px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-fb-blue outline-none transition-all appearance-none">
                  <option value="">Select</option>
                  <option value="Parent">Parent</option>
                  <option value="Spouse">Spouse</option>
                  <option value="Sibling">Sibling</option>
                  <option value="Guardian">Guardian</option>
                  <option value="Friend">Friend</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <FormField label="Contact Number" name="emergencyContactNumber" value={formData.emergencyContactNumber || ''} onChange={handleChange} />
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row justify-end gap-3 pt-8 border-t border-fb-border mt-8">
            <button type="button" onClick={onClose} className="w-full md:w-auto px-6 py-2.5 rounded-lg font-bold text-sm text-fb-textSecondary hover:bg-fb-hover transition-all order-2 md:order-1">Cancel</button>
            <button type="submit" disabled={saving} className="w-full md:w-auto bg-fb-blue text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-md hover:bg-blue-600 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 order-1 md:order-2">
              {saving ? <RefreshCw className="animate-spin" size={18} /> : (isNew ? <UserPlus size={18} /> : <Save size={18} />)}
              {saving ? 'Processing...' : (isNew ? 'Create Account' : 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
