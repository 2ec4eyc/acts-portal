import React, { useState, useEffect, useCallback, useRef } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import {
  User as UserIcon,
  GraduationCap,
  CheckCircle,
  RefreshCw,
  X,
  Edit2,
  KeyRound,
  ShieldAlert,
  Camera,
  BookOpen,
} from 'lucide-react';

import { FormField } from '../components/FormField';
import { ChangePasswordModal } from '../components/modals/ChangePasswordModal';
import { SuccessModal } from '../components/modals/SuccessModal';
import { PROFILE_SELF_EDITABLE_FIELDS } from '../constants';
import { fetchCourses, updateMyProfile } from '../lib/data';
import { live } from '../lib/live';
import { formatName } from '../lib/format';
import { getCroppedImg } from '../lib/image';
import type { Course, UserProfile } from '../types';
import { toast } from '../lib/toast';

export const ProfilePage = ({ profile }: { profile: UserProfile | null }) => {
  const [formData, setFormData] = useState<Partial<UserProfile>>(profile || {});
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Crop states
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setFormData(profile || {}); }, [profile]);

  const [assignedCourses, setAssignedCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);

  useEffect(() => {
    if (profile && profile.role === 'teacher') {
      setCoursesLoading(true);
      return live(fetchCourses, (courses) => {
        setAssignedCourses(courses.filter((c) => c.instructorId === profile.uid || c.professor === formatName(profile)));
        setCoursesLoading(false);
      }, (error) => {
        console.error("Error loading assigned courses for teacher:", error);
        setCoursesLoading(false);
      });
    }
  }, [profile]);

  if (!profile) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePhotoClick = () => {
    if (!isEditing) return;
    fileInputRef.current?.click();
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageToCrop(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleApplyCrop = async () => {
    if (imageToCrop && croppedAreaPixels) {
      try {
        const croppedImage = await getCroppedImg(imageToCrop, croppedAreaPixels);
        setFormData(prev => ({ ...prev, photoURL: croppedImage }));
        setImageToCrop(null);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const fullName = `${formData.firstName || ''} ${formData.middleName || ''} ${formData.lastName || ''}`.replace(/\s+/g, ' ').trim();
    // Only send fields the user may edit (the API rejects anything else).
    const editableFields: readonly string[] = profile.role === 'admin'
      ? [...PROFILE_SELF_EDITABLE_FIELDS, 'adminCategory']
      : PROFILE_SELF_EDITABLE_FIELDS;
    const updates: Record<string, unknown> = { fullName };
    for (const key of editableFields) {
      const value = formData[key as keyof UserProfile];
      if (value !== undefined) updates[key] = value;
    }
    try {
      await updateMyProfile(updates as Partial<UserProfile>);
      setSuccessMessage("Your profile has been updated and saved.");
      setIsEditing(false);
    } catch (err) {
      toast.error(`Failed to update profile. ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const SectionHeader = ({ title, icon: Icon }: { title: string, icon?: any }) => (
    <div className="col-span-full border-b border-fb-border pb-3 mt-8 first:mt-0 flex items-center gap-2">
      {Icon && <Icon className="text-fb-blue" size={18} />}
      <h3 className="text-xs font-black text-black uppercase tracking-widest italic">{title}</h3>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-20 animate-in fade-in duration-500">
      <div className="bg-white rounded-[2.5rem] border border-fb-border shadow-sm overflow-hidden flex flex-col md:flex-row">
        {/* Left Sidebar Management */}
        <div className="w-full md:w-80 md:shrink-0 bg-fb-blue p-10 flex flex-col items-center text-white">
          <div className={`relative group mb-8 ${isEditing ? 'cursor-pointer' : 'cursor-default'}`} onClick={handlePhotoClick}>
            <div className="w-40 h-40 rounded-[2.5rem] bg-white/20 border-4 border-white shadow-2xl flex items-center justify-center overflow-hidden transition-transform group-hover:scale-105">
              {formData.photoURL ? (
                <img src={formData.photoURL} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-5xl font-black opacity-40 uppercase">{formData.firstName?.charAt(0) || formatName(profile).charAt(0)}</span>
              )}
            </div>
            {isEditing && (
              <div className="absolute inset-0 bg-black/40 opacity-100 flex flex-col items-center justify-center rounded-[2.5rem] transition-all text-center p-4">
                <Camera className="text-white mb-2" size={28} />
                <span className="text-[10px] font-black uppercase tracking-widest">Upload New Photo</span>
                <span className="text-[8px] opacity-60 uppercase mt-1">1:1 Ratio Required</span>
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handlePhotoChange} className="hidden" accept="image/*" />
          </div>

          <div className="text-center space-y-8 w-full">
            <h2 className="text-2xl font-black capitalize italic tracking-tighter leading-tight border-b border-white/10 pb-6">{formData.firstName} {formData.lastName}</h2>
            
            <div className="space-y-3 w-full pt-4">
              <button 
                type="button" 
                onClick={() => setIsChangingPassword(true)} 
                className="w-full bg-white text-fb-blue py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-black/10"
              >
                <KeyRound size={16} /> Update Password
              </button>

              {!isEditing ? (
                <button 
                  type="button" 
                  onClick={() => setIsEditing(true)} 
                  className="w-full bg-white text-fb-blue py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-black/10"
                >
                  <Edit2 size={16} /> Edit Profile
                </button>
              ) : (
                <>
                  <button 
                    type="button" 
                    onClick={() => setIsEditing(false)} 
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-red-900/20"
                  >
                    <X size={16} /> Cancel Edit
                  </button>
                  <button 
                    type="button" 
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-emerald-400 text-emerald-950 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-black/10 disabled:opacity-50"
                  >
                    {saving ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle size={16} />} 
                    Save Updates
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Details Area */}
        <div className="flex-1 min-w-0 p-8 md:p-12">
          <div className="space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {profile.role === 'student' && (
                <>
                  <SectionHeader title="Student Information" icon={BookOpen} />
                  <div className="md:col-span-3">
                    <FormField label="Student ID No." name="studentId" value={formData.studentId} onChange={() => {}} disabled={true} />
                  </div>
                  <div className="md:col-span-3">
                    <FormField label="Batch Name" name="batchName" value={formData.batchName} onChange={() => {}} disabled={true} />
                  </div>
                  <div className="md:col-span-3">
                    <FormField label="School Type" name="schoolType" value={formData.schoolType || 'N/A'} onChange={() => {}} disabled={true} />
                  </div>
                  <div className="md:col-span-3">
                    <FormField label="Year Level" name="yearLevel" value={formData.yearLevel} onChange={() => {}} disabled={true} />
                  </div>
                  <div className="md:col-span-6">
                    <FormField label="1st Year SY" name="firstYearSchoolYear" value={formData.firstYearSchoolYear} onChange={() => {}} disabled={true} />
                  </div>
                  <div className="md:col-span-6">
                    <FormField label="2nd Year SY" name="secondYearSchoolYear" value={formData.secondYearSchoolYear} onChange={() => {}} disabled={true} />
                  </div>
                </>
              )}

              {profile.role === 'admin' && (
                <>
                  <SectionHeader title="Administrator Information" icon={BookOpen} />
                  <div className="md:col-span-4 space-y-1.5">
                    <label className="text-[10px] font-black text-black ml-1 uppercase tracking-widest">Admin Category</label>
                    <select name="adminCategory" value={formData.adminCategory || ''} onChange={handleChange} disabled={!isEditing} className={`w-full bg-white border-2 border-fb-gray rounded-2xl px-5 py-3.5 text-sm font-bold outline-none focus:border-fb-blue transition-all appearance-none shadow-sm text-black ${!isEditing ? 'bg-fb-gray/40 cursor-not-allowed opacity-80' : ''}`}>
                      <option value="">Select Category</option>
                      <option value="Day Secretary">Day Secretary</option>
                      <option value="Night Secretary">Night Secretary</option>
                      <option value="Faculty">Faculty</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </div>
                </>
              )}

              <SectionHeader title="Personal Information" icon={UserIcon} />
              <div className="md:col-span-4">
                <FormField label="First Name" name="firstName" value={formData.firstName} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="md:col-span-4">
                <FormField label="Middle Name" name="middleName" value={formData.middleName} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="md:col-span-4">
                <FormField label="Last Name" name="lastName" value={formData.lastName} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="md:col-span-12">
                <FormField label="Home Address" name="address" value={formData.address} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="md:col-span-4">
                <FormField label="City" name="city" value={formData.city} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="md:col-span-4">
                <FormField label="Province" name="province" value={formData.province} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="md:col-span-4">
                <FormField label="ZIP Code" name="postalCode" value={formData.postalCode} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-[10px] font-black text-black ml-1 uppercase tracking-widest">Gender</label>
                <select name="gender" value={formData.gender} onChange={handleChange} disabled={!isEditing} className={`w-full bg-white border-2 border-fb-gray rounded-2xl px-5 py-3.5 text-sm font-bold outline-none focus:border-fb-blue transition-all appearance-none shadow-sm text-black ${!isEditing ? 'bg-fb-gray/40 cursor-not-allowed opacity-80' : ''}`}>
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div className="md:col-span-4">
                <FormField label="Birth Date" name="birthDate" type="date" value={formData.birthDate} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="md:col-span-4">
                <FormField label="Contact No." name="contactNumber" value={formData.contactNumber} onChange={handleChange} disabled={!isEditing} />
              </div>

              {profile.role === 'teacher' && (
                <>
                  <SectionHeader title="Assigned Courses" icon={BookOpen} />
                  <div className="col-span-full">
                    {coursesLoading ? (
                      <div className="flex justify-center py-6">
                        <RefreshCw className="animate-spin text-fb-blue" size={24} />
                      </div>
                    ) : assignedCourses.length === 0 ? (
                      <div className="text-center py-8 bg-fb-gray/5 rounded-2xl border border-dashed border-fb-border">
                        <p className="text-xs text-fb-textSecondary font-black uppercase tracking-wider">No Courses Assigned Currently</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {assignedCourses.map((course) => (
                          <div key={course.id} className="bg-fb-blue/[0.02] border border-fb-border hover:border-fb-blue/30 rounded-2xl p-5 flex flex-col justify-between transition-all shadow-sm">
                            <div>
                              <h4 className="font-black text-sm text-fb-textPrimary capitalize italic mb-1.5">{course.name}</h4>
                              <p className="text-[10px] font-black text-fb-blue uppercase tracking-widest mb-1">
                                {course.yearLevel} • {course.semester}
                              </p>
                              {course.schoolYear && (
                                <p className="text-[10px] font-bold text-fb-textSecondary uppercase">
                                  School Year: {course.schoolYear}
                                </p>
                              )}
                            </div>
                            <div className="mt-4 pt-3 border-t border-fb-border flex items-center justify-between text-[10px] font-bold text-fb-textSecondary uppercase tracking-wider">
                              <span>{course.isRecurring ? 'Weekly Schedule' : 'Single Session'}</span>
                              <span>{course.startTime} - {course.endTime}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {profile.role === 'student' && (
                <>
                  <SectionHeader title="Church Background" icon={GraduationCap} />
                  <div className="md:col-span-6">
                    <FormField label="Church Affiliation" name="church" value={formData.church} onChange={handleChange} disabled={!isEditing} />
                  </div>
                  <div className="md:col-span-6">
                    <FormField label="Name of Pastor" name="pastorName" value={formData.pastorName} onChange={handleChange} disabled={!isEditing} />
                  </div>
                  <div className="md:col-span-6">
                    <FormField label="Holy Ghost Baptism" type="date" name="holyGhostBaptismDate" value={formData.holyGhostBaptismDate} onChange={handleChange} disabled={!isEditing} />
                  </div>
                  <div className="md:col-span-6">
                    <FormField label="HG Baptism Location" name="holyGhostBaptismLocation" value={formData.holyGhostBaptismLocation} onChange={handleChange} disabled={!isEditing} />
                  </div>
                  <div className="md:col-span-6">
                    <FormField label="Water Baptism" type="date" name="waterBaptismDate" value={formData.waterBaptismDate} onChange={handleChange} disabled={!isEditing} />
                  </div>
                  <div className="md:col-span-6">
                    <FormField label="Water Baptism Location" name="waterBaptismLocation" value={formData.waterBaptismLocation} onChange={handleChange} disabled={!isEditing} />
                  </div>
                </>
              )}

              <SectionHeader title="In Case of Emergency" icon={ShieldAlert} />
              <div className="md:col-span-6">
                <FormField label="First Name" name="emergencyFirstName" value={formData.emergencyFirstName} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="md:col-span-6">
                <FormField label="Last Name" name="emergencyLastName" value={formData.emergencyLastName} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="md:col-span-6 space-y-1.5">
                <label className="text-[10px] font-black text-black ml-1 uppercase tracking-widest">Relationship</label>
                <select name="emergencyRelationship" value={formData.emergencyRelationship} onChange={handleChange} disabled={!isEditing} className={`w-full bg-white border-2 border-fb-gray rounded-2xl px-5 py-3.5 text-sm font-bold outline-none focus:border-fb-blue transition-all appearance-none shadow-sm text-black ${!isEditing ? 'bg-fb-gray/40 cursor-not-allowed opacity-80' : ''}`}>
                   <option value="">Select</option>
                   <option value="Parent">Parent</option>
                   <option value="Spouse">Spouse</option>
                   <option value="Sibling">Sibling</option>
                   <option value="Guardian">Guardian</option>
                   <option value="Friend">Friend</option>
                   <option value="Other">Other</option>
                </select>
              </div>
              <div className="md:col-span-6">
                <FormField label="Emergency Phone" name="emergencyContactNumber" value={formData.emergencyContactNumber} onChange={handleChange} disabled={!isEditing} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Crop Modal */}
      {imageToCrop && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[80vh]">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest italic text-fb-textPrimary">Adjust Profile Image</h3>
              <button onClick={() => setImageToCrop(null)} className="p-2 hover:bg-fb-gray rounded-full transition-all"><X size={20}/></button>
            </div>
            <div className="flex-1 relative bg-black/5">
              <Cropper
                image={imageToCrop}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">
                  <span>Zoom Level</span>
                  <span>{Math.round(zoom * 100)}%</span>
                </div>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full h-2 bg-fb-gray rounded-lg appearance-none cursor-pointer accent-fb-blue"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setImageToCrop(null)} className="px-6 py-4 font-black text-xs uppercase text-fb-textSecondary">Cancel</button>
                <button onClick={handleApplyCrop} className="px-10 py-4 bg-fb-blue text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-fb-blue/20">Apply Crop</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isChangingPassword && <ChangePasswordModal onClose={() => setIsChangingPassword(false)} />}
      {successMessage && <SuccessModal message={successMessage} onClose={() => setSuccessMessage(null)} />}
    </div>
  );
};
