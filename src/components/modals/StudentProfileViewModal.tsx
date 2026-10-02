import {
  User as UserIcon,
  GraduationCap,
  X,
  ShieldAlert,
  BookOpen,
} from 'lucide-react';

import type { ReactNode } from 'react';

import { FormField } from '../FormField';
import { formatName } from '../../lib/format';
import type { UserProfile } from '../../types';

/** Read-only student profile. `extra` is shown above the profile details (for example a teacher's view of their courses). */
export const StudentProfileViewModal = ({ student, onClose, extra }: { student: UserProfile, onClose: () => void, extra?: ReactNode }) => {
  const SectionHeader = ({ title, icon: Icon }: { title: string, icon?: any }) => (
    <div className="col-span-full border-b border-fb-border pb-3 mt-8 first:mt-0 flex items-center gap-2">
      {Icon && <Icon className="text-fb-blue" size={18} />}
      <h3 className="text-xs font-black text-fb-blue uppercase tracking-widest italic">{title}</h3>
    </div>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={`Profile of ${formatName(student)}`} className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] shadow-2xl border border-fb-border custom-scrollbar relative">
        <button onClick={onClose} aria-label="Close" className="absolute top-6 right-6 p-3 bg-white hover:bg-fb-gray rounded-full transition-all border border-fb-border text-fb-textPrimary z-10"><X size={24} /></button>
        <div className="flex flex-col lg:flex-row min-h-full">
          {/* Left Sidebar */}
          <div className="w-full lg:w-80 lg:shrink-0 bg-fb-blue p-10 flex flex-col items-center text-white">
            <div className="w-40 h-40 rounded-[2.5rem] bg-white/20 border-4 border-white shadow-2xl flex items-center justify-center overflow-hidden mb-8">
              {student.photoURL ? (
                <img src={student.photoURL} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-5xl font-black opacity-40 uppercase">{student.firstName?.charAt(0) || formatName(student).charAt(0)}</span>
              )}
            </div>
            <div className="text-center space-y-4 w-full">
              <h2 className="text-2xl font-black capitalize italic tracking-tighter leading-tight border-b border-white/10 pb-6">{formatName(student)}</h2>
              <div className="px-5 py-2 bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest">
                {student.role} Account
              </div>
              <div className="text-[10px] font-bold opacity-60 uppercase tracking-widest">
                ID: {student.studentId || 'N/A'}
              </div>
            </div>
          </div>

          {/* Right Details */}
          <div className="flex-1 min-w-0 p-8 md:p-12">
            {extra}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <SectionHeader title="Student Information" icon={BookOpen} />
              <div className="md:col-span-3">
                <FormField label="Student ID No." name="studentId" value={student.studentId} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-3">
                <FormField label="Batch Name" name="batchName" value={student.batchName} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-3">
                <FormField label="School Type" name="schoolType" value={student.schoolType || 'N/A'} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-3">
                <FormField label="Year Level" name="yearLevel" value={student.yearLevel} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-6">
                <FormField label="1st Year SY" name="firstYearSchoolYear" value={student.firstYearSchoolYear} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-6">
                <FormField label="2nd Year SY" name="secondYearSchoolYear" value={student.secondYearSchoolYear} onChange={() => {}} disabled={true} />
              </div>

              <SectionHeader title="Personal Information" icon={UserIcon} />
              <div className="md:col-span-4">
                <FormField label="First Name" name="firstName" value={student.firstName} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-4">
                <FormField label="Middle Name" name="middleName" value={student.middleName} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-4">
                <FormField label="Last Name" name="lastName" value={student.lastName} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-12">
                <FormField label="Home Address" name="address" value={student.address} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-4">
                <FormField label="City" name="city" value={student.city} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-4">
                <FormField label="Province" name="province" value={student.province} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-4">
                <FormField label="ZIP Code" name="postalCode" value={student.postalCode} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-4">
                <FormField label="Gender" name="gender" value={student.gender} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-4">
                <FormField label="Birth Date" name="birthDate" value={student.birthDate} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-4">
                <FormField label="Contact No." name="contactNumber" value={student.contactNumber} onChange={() => {}} disabled={true} />
              </div>

              <SectionHeader title="Church Background" icon={GraduationCap} />
              <div className="md:col-span-6">
                <FormField label="Church Affiliation" name="church" value={student.church} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-6">
                <FormField label="Name of Pastor" name="pastorName" value={student.pastorName} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-6">
                <FormField label="Holy Ghost Baptism" name="holyGhostBaptismDate" value={student.holyGhostBaptismDate} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-6">
                <FormField label="HG Baptism Location" name="holyGhostBaptismLocation" value={student.holyGhostBaptismLocation} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-6">
                <FormField label="Water Baptism" name="waterBaptismDate" value={student.waterBaptismDate} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-6">
                <FormField label="Water Baptism Location" name="waterBaptismLocation" value={student.waterBaptismLocation} onChange={() => {}} disabled={true} />
              </div>

              <SectionHeader title="In Case of Emergency" icon={ShieldAlert} />
              <div className="md:col-span-6">
                <FormField label="First Name" name="emergencyFirstName" value={student.emergencyFirstName} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-6">
                <FormField label="Last Name" name="emergencyLastName" value={student.emergencyLastName} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-6">
                <FormField label="Relationship" name="emergencyRelationship" value={student.emergencyRelationship} onChange={() => {}} disabled={true} />
              </div>
              <div className="md:col-span-6">
                <FormField label="Emergency Phone" name="emergencyContactNumber" value={student.emergencyContactNumber} onChange={() => {}} disabled={true} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
