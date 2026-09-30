import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import Cropper, { Area } from 'react-easy-crop';
import { 
  LayoutDashboard, 
  User as UserIcon, 
  Users,
  GraduationCap, 
  Calendar as CalendarIcon, 
  Search, 
  ChevronLeft,
  ChevronRight, 
  Plus, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  Filter, 
  X, 
  Save, 
  Edit2, 
  UserPlus, 
  KeyRound, 
  Menu,
  Briefcase,
  ChevronDown,
  Trash2,
  Repeat,
  List,
  Check,
  CheckSquare,
  RotateCcw,
  LogOut,
  Archive,
  Clock,
  Layers,
  Settings,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Database,
  ShieldAlert,
  Camera,
  BookOpen,
  UserCheck,
  MoreVertical,
  Phone,
  MapPin,
  Mail,
  Copy,
  Upload,
  Download,
  FileText,
  Bell
} from 'lucide-react';

// Firebase Imports
import { initializeApp, deleteApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  updatePassword,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence,
  User as FirebaseUser
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, updateDoc, 
  collection, 
  onSnapshot, 
  query,
  where,
  Timestamp,
  deleteDoc,
  getDoc,
  getDocs
} from "firebase/firestore";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyASk304evj73LHi7cdiqz_Yzc6IVFuJYjk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "acts-bible-school-portal.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "acts-bible-school-portal",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "acts-bible-school-portal.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "370934730766",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:370934730766:web:161e8329df3d89d7146c5f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
};

// --- Image Processing Helpers ---

const getCroppedImg = async (imageSrc: string, pixelCrop: Area): Promise<string> => {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve) => (image.onload = resolve));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) return '';

  const targetSize = 400;
  canvas.width = targetSize;
  canvas.height = targetSize;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetSize,
    targetSize
  );

  return canvas.toDataURL('image/jpeg', 0.7);
};

// --- Logo Component ---
const HIDDEN_ADMIN_EMAILS = ['actsportal2026@gmail.com'];

const ActsLogo = ({ className = "", imgClassName = "w-full h-full object-contain" }: { className?: string, imgClassName?: string }) => (
  <div className={`block ${className}`}>
    <img src='https://i.postimg.cc/N20vMztm/ACTS-Logo.png' alt='ACTS-Logo' className={imgClassName} />
  </div>
);

// --- Types ---
interface Grade {
  id: string;
  courseName: string;
  gradeValue: number | '';
  isIncomplete: boolean;
  dateReleased: string;
  yearLevel?: '1st Year' | '2nd Year';
  semester?: '1st Semester' | '2nd Semester' | '3rd Semester';
}

interface EditHistoryEntry {
  id: string;
  editedBy: string;
  action: string;
  timestamp: string;
  details: string;
}

interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  photoURL?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  studentId?: string;
  contactNumber?: string;
  batchName?: string;
  yearLevel?: '1st Year' | '2nd Year';
  firstYearSchoolYear?: string;
  secondYearSchoolYear?: string;
  gender?: 'Male' | 'Female';
  birthDate?: string;
  address?: string;
  city?: string;
  currentSessionId?: string;
  province?: string;
  postalCode?: string;
  church?: string;
  pastorName?: string;
  holyGhostBaptismDate?: string;
  holyGhostBaptismLocation?: string;
  waterBaptismDate?: string;
  waterBaptismLocation?: string;
  emergencyFirstName?: string;
  emergencyLastName?: string;
  emergencyRelationship?: string;
  emergencyContactNumber?: string;
  role: 'student' | 'admin' | 'vice president' | 'president' | 'teacher';
  adminCategory?: 'Day Secretary' | 'Night Secretary' | 'Faculty' | 'Admin';
  schoolType?: 'Day School' | 'Night School';
  status: 'Active' | 'Pending' | 'Archived';
  grades: Grade[];
  editHistory?: EditHistoryEntry[];
  archivedAt?: any;
}

const toTitleCase = (str: string) => {
  if (!str) return '';
  return str.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
};

const formatName = (user: UserProfile | Partial<UserProfile> | null | undefined) => {
  if (!user) return 'Unknown User';
  if (user.lastName && user.firstName) {
    return `${toTitleCase(user.lastName)}, ${toTitleCase(user.firstName)}`;
  }
  return toTitleCase(user.fullName || 'Unknown User');
};

interface Course {
  id: string;
  name: string;
  professor: string;
  instructorId?: string;
  date: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  daysOfWeek?: string[];
  frequency: 'Daily' | 'Weekly' | 'Bi-weekly' | 'Monthly';
  yearLevel: '1st Year' | '2nd Year';
  semester: '1st Semester' | '2nd Semester' | '3rd Semester';
  schoolYear?: string;
  createdAt: any;
  archivedAt?: any;
  archivedBy?: string;
  status?: 'active' | 'archived'; 
}

interface AttendanceRecord {
  id: string;
  courseId: string;
  date: string;
  studentId: string;
  status: 'present' | 'absent';
  isExcused?: boolean;
  notes?: string;
  createdAt: any;
}

// --- Shared Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick: () => void }) => (
  <div className="px-2">
    <button 
      onClick={onClick}
      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
        active 
        ? 'active-sidebar-item' 
        : 'text-fb-textSecondary hover:bg-fb-hover'
      }`}
    >
      <div className={`p-2 rounded-full ${active ? 'bg-transparent' : 'bg-fb-hover group-hover:bg-gray-200'}`}>
        <Icon size={20} className={active ? 'text-fb-blue' : 'text-fb-textPrimary'} />
      </div>
      <span className={`font-semibold text-sm ${active ? 'text-fb-blue' : 'text-fb-textPrimary'}`}>{label}</span>
    </button>
  </div>
);

const Card = ({ children, title, className = "", noPadding = false, key }: { children?: React.ReactNode, title?: string, className?: string, noPadding?: boolean, key?: React.Key }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-fb-border overflow-hidden ${className}`}>
    {title && (
      <div className="px-5 py-4 border-b border-fb-border flex items-center justify-between">
        <h3 className="text-base font-bold text-fb-textPrimary tracking-tight">
          {title}
        </h3>
      </div>
    )}
    <div className={noPadding ? '' : 'p-4 md:p-5'}>
      {children}
    </div>
  </div>
);

const FormField = ({ label, name, value, onChange, type = "text", placeholder = "", disabled = false }: { 
  label: string, 
  name: string, 
  value: any, 
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void,
  type?: string, 
  placeholder?: string,
  disabled?: boolean
}) => (
  <div className="space-y-1.5 flex-1 min-w-[140px]">
    <label className="text-[10px] font-black text-black ml-1 uppercase tracking-widest">{label}</label>
    {type === 'textarea' ? (
      <textarea 
        name={name} 
        value={value || ''} 
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        className={`w-full border-2 border-fb-gray rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all placeholder:text-gray-300 resize-none text-black ${
          disabled 
          ? 'bg-fb-gray/40 cursor-not-allowed opacity-80' 
          : 'bg-white focus:border-fb-blue focus:shadow-[0_0_0_4px_rgba(24,119,242,0.1)]'
        }`}
      />
    ) : (
      <input 
        type={type} 
        name={name} 
        value={value || ''} 
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full border-2 border-fb-gray rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all placeholder:text-gray-300 text-black ${
          disabled 
          ? 'bg-fb-gray/40 cursor-not-allowed opacity-80' 
          : 'bg-white focus:border-fb-blue focus:shadow-[0_0_0_4px_rgba(24,119,242,0.1)]'
        }`}
      />
    )}
  </div>
);

const PermissionDeniedGate = ({ message }: { message: string }) => (
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

// --- Modals ---

const SuccessModal = ({ message, onClose }: { message: string, onClose: () => void }) => (
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

const ErrorModal = ({ message, onClose }: { message: string, onClose: () => void }) => (
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

const PasswordResetModal = ({ user, onClose }: { user: UserProfile, onClose: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSendReset = async () => {
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setSent(true);
    } catch (err: any) {
      alert("Failed to send reset link: " + err.message);
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

const ChangePasswordModal = ({ onClose }: { onClose: () => void }) => {
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

const EditUserModal = ({ user, onClose, onSave, isNew = false }: { user: Partial<UserProfile>, onClose: () => void, onSave: (updated: Partial<UserProfile>) => Promise<void>, isNew?: boolean }) => {
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

const HistoryModal = ({ history, onClose }: { history: EditHistoryEntry[], onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-[2.5rem] shadow-2xl border border-fb-border flex flex-col">
        <div className="p-8 border-b border-fb-border bg-fb-gray/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-fb-blue/10 text-fb-blue rounded-lg">
              <Clock size={24} />
            </div>
            <h2 className="text-xl font-bold text-fb-textPrimary tracking-tight">Update History</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-fb-hover rounded-full transition-all">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-4">
          {!history || history.length === 0 ? (
            <div className="py-20 text-center opacity-30">
              <p className="font-black uppercase text-[10px] tracking-widest italic">No history records found</p>
            </div>
          ) : (
            history.slice().reverse().map((entry) => (
              <div key={entry.id} className="p-5 rounded-2xl bg-fb-gray/30 border border-fb-border space-y-2">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-black text-fb-blue uppercase tracking-widest italic">{entry.action}</span>
                  <span className="text-[10px] font-bold text-fb-textSecondary uppercase italic">{entry.timestamp}</span>
                </div>
                <p className="text-sm font-bold text-fb-textPrimary">{entry.details}</p>
                <div className="flex items-center gap-2 pt-2 border-t border-fb-border/50">
                  <UserIcon size={12} className="text-fb-textSecondary" />
                  <span className="text-[10px] font-black text-fb-textSecondary uppercase tracking-tighter">Edited by: <span className="text-fb-textPrimary">{entry.editedBy}</span></span>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-6 border-t border-fb-border bg-fb-gray/5 flex justify-end">
          <button onClick={onClose} className="px-8 py-3 bg-white hover:bg-fb-hover text-fb-textPrimary border-2 border-fb-border rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">Close History</button>
        </div>
      </div>
    </div>
  );
};

const StudentProfileViewModal = ({ student, onClose }: { student: UserProfile, onClose: () => void }) => {
  const SectionHeader = ({ title, icon: Icon }: { title: string, icon?: any }) => (
    <div className="col-span-full border-b border-fb-border pb-3 mt-8 first:mt-0 flex items-center gap-2">
      {Icon && <Icon className="text-fb-blue" size={18} />}
      <h3 className="text-xs font-black text-fb-blue uppercase tracking-widest italic">{title}</h3>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] shadow-2xl border border-fb-border custom-scrollbar relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-3 bg-white hover:bg-fb-gray rounded-full transition-all border border-fb-border text-fb-textPrimary z-10"><X size={24} /></button>
        <div className="flex flex-col md:flex-row min-h-full">
          {/* Left Sidebar */}
          <div className="w-full md:w-80 md:shrink-0 bg-fb-blue p-10 flex flex-col items-center text-white">
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

const calculateGPA = (student: UserProfile) => {
  if (!student.grades || student.grades.length === 0) return 'N/A';

  let relevantGrades = [];
  if (student.yearLevel === '1st Year') {
    relevantGrades = student.grades.filter(g => g.yearLevel === '1st Year' && typeof g.gradeValue === 'number');
  } else if (student.yearLevel === '2nd Year') {
    relevantGrades = student.grades.filter(g => (g.yearLevel === '1st Year' || g.yearLevel === '2nd Year') && typeof g.gradeValue === 'number');
  } else {
    relevantGrades = student.grades.filter(g => typeof g.gradeValue === 'number');
  }

  if (relevantGrades.length === 0) return 'N/A';

  const sum = relevantGrades.reduce((acc, curr) => acc + (curr.gradeValue as number), 0);
  const gpa = sum / relevantGrades.length;
  
  return gpa.toFixed(2);
};

const GradesModal = ({ student: propStudent, adminProfile, onClose }: { student: UserProfile, adminProfile: UserProfile, onClose: () => void }) => {
  const [student, setStudent] = useState<UserProfile>(propStudent);
  const [courses, setCourses] = useState([] as Course[]);
  const [editingGradeId, setEditingGradeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [yearLevelFilter, setYearLevelFilter] = useState(propStudent.yearLevel || '1st Year' as '1st Year' | '2nd Year');
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState([] as any[]);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "attendance"), where("studentId", "==", propStudent.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [] as any[];
      snapshot.forEach(docSnap => {
        list.push({ ...docSnap.data(), id: docSnap.id });
      });
      setAttendanceRecords(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "attendance");
    });
    return () => unsub();
  }, [propStudent.uid]);

  const [editFormData, setEditFormData] = useState<{gradeValue: number | '', isIncomplete: boolean}>({
    gradeValue: '',
    isIncomplete: false
  });

  // Listen to student document changes for realtime updates
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "users", propStudent.uid), (docSnap) => {
      if (docSnap.exists()) {
        setStudent({ ...docSnap.data(), uid: docSnap.id } as UserProfile);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${propStudent.uid}`);
    });
    return () => unsub();
  }, [propStudent.uid]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "courses"), (snapshot) => {
      const list: Course[] = [];
      snapshot.forEach(docSnap => {
        list.push({ ...docSnap.data(), id: docSnap.id } as Course);
      });
      setCourses(list);
      setPermissionError(false);
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.warn("Permission denied for courses registry.");
        setPermissionError(true);
      }
      handleFirestoreError(error, OperationType.LIST, "courses");
    });
    return () => unsub();
  }, []);

  const getStatus = (gradeValue: number | '', isIncomplete: boolean) => {
    if (isIncomplete) return { label: 'Incomplete', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    if (gradeValue === '') return { label: 'Pending', color: 'bg-fb-gray text-fb-textSecondary' };
    if (gradeValue >= 75) return { label: `Passed - ${gradeValue}`, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    return { label: `Failed - ${gradeValue}`, color: 'bg-rose-100 text-rose-700 border-rose-200' };
  };


  const handleUpdateGrade = async (courseId: string, courseName: string, courseYear?: string, courseSem?: string) => {
    setLoading(true);
    try {
      const existingGrades = [...(student.grades || [])];
      const gradeIndex = existingGrades.findIndex(g => g.id === courseId);
      
      const gradeEntry: Grade = {
        id: courseId,
        courseName: courseName,
        gradeValue: editFormData.isIncomplete ? '' : (editFormData.gradeValue === '' ? '' : Number(editFormData.gradeValue)),
        isIncomplete: editFormData.isIncomplete,
        dateReleased: new Date().toISOString().split('T')[0],
        yearLevel: (courseYear as any) || yearLevelFilter,
        semester: (courseSem as any) || semesters[0] // Fallback if not provided
      };

      if (gradeIndex > -1) {
        existingGrades[gradeIndex] = gradeEntry;
      } else {
        existingGrades.push(gradeEntry);
      }

      // Record history
      const historyEntry: EditHistoryEntry = {
        id: `HIST-${Date.now()}`,
        editedBy: formatName(adminProfile) || adminProfile.email,
        action: `Updated grade for ${courseName}`,
        timestamp: new Date().toLocaleString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        details: `Grade: ${editFormData.isIncomplete ? 'Incomplete' : editFormData.gradeValue}`
      };

      const existingHistory = [...(student.editHistory || [])];
      existingHistory.push(historyEntry);

      await updateDoc(doc(db, "users", student.uid), { 
        grades: existingGrades,
        editHistory: existingHistory
      });
      setEditingGradeId(null);
    } catch (err) {
      alert("Failed to update records.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetGrade = async (courseId: string, courseName: string) => {
    setLoading(true);
    try {
      const existingGrades = [...(student.grades || [])];
      const updatedGrades = existingGrades.filter(g => g.id !== courseId);

      // Record history
      const historyEntry: EditHistoryEntry = {
        id: `HIST-${Date.now()}`,
        editedBy: formatName(adminProfile) || adminProfile.email,
        action: `Reset grade for ${courseName}`,
        timestamp: new Date().toLocaleString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        details: `Grade reset to Pending`
      };

      const existingHistory = [...(student.editHistory || [])];
      existingHistory.push(historyEntry);

      await updateDoc(doc(db, "users", student.uid), { 
        grades: updatedGrades,
        editHistory: existingHistory
      });
    } catch (err) {
      alert("Failed to reset grade.");
    } finally {
      setLoading(false);
    }
  };

  const semesters = ['1st Semester', '2nd Semester', '3rd Semester'] as const;

  const handleDownloadPDF = async () => {
    const container = document.getElementById('student-records-pdf-container');
    if (!container) return;
    
    try {
      const pages = container.querySelectorAll('.pdf-page');
      if (pages.length === 0) return;

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();

      for (let i = 0; i < pages.length; i++) {
        const pageElement = pages[i] as HTMLElement;
        const canvas = await html2canvas(pageElement, { 
          scale: 2,
          windowWidth: pageElement.scrollWidth,
          windowHeight: pageElement.scrollHeight
        });
        const imgData = canvas.toDataURL('image/png');
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;
        
        if (i > 0) {
          pdf.addPage();
        }
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight);
      }

      pdf.save(`${formatName(student)}_records.pdf`);
    } catch (err) {
      console.error("PDF generation failed", err);
      alert("Failed to generate PDF.");
    }
  };

  const pagesData: { yearLevel: string, semester: string, items: any[] }[] = [];

  // 1st Year
  semesters.forEach(sem => {
    const activeSemCourses = student.firstYearSchoolYear ? courses.filter(c => c.yearLevel === '1st Year' && c.semester === sem && c.schoolYear === student.firstYearSchoolYear) : [];
    const studentSemGrades = (student.grades || []).filter(g => g.yearLevel === '1st Year' && g.semester === sem);
    
    const combinedSemItems = [
      ...studentSemGrades.map(g => ({
        id: g.id,
        name: g.courseName,
        grade: g
      })),
      ...activeSemCourses.filter(c => !studentSemGrades.find(g => g.id === c.id)).map(c => ({
        id: c.id,
        name: c.name,
        grade: null
      }))
    ].sort((a, b) => a.name.localeCompare(b.name));

    if (combinedSemItems.length > 0) {
      pagesData.push({
        yearLevel: '1st Year',
        semester: sem,
        items: combinedSemItems
      });
    }
  });

  // 2nd Year
  if (student.yearLevel !== '1st Year') {
    semesters.forEach(sem => {
      const activeSemCourses = student.secondYearSchoolYear ? courses.filter(c => c.yearLevel === '2nd Year' && c.semester === sem && c.schoolYear === student.secondYearSchoolYear) : [];
      const studentSemGrades = (student.grades || []).filter(g => g.yearLevel === '2nd Year' && g.semester === sem);
      
      const combinedSemItems = [
        ...studentSemGrades.map(g => ({
          id: g.id,
          name: g.courseName,
          grade: g
        })),
        ...activeSemCourses.filter(c => !studentSemGrades.find(g => g.id === c.id)).map(c => ({
          id: c.id,
          name: c.name,
          grade: null
        }))
      ].sort((a, b) => a.name.localeCompare(b.name));

      if (combinedSemItems.length > 0) {
        pagesData.push({
          yearLevel: '2nd Year',
          semester: sem,
          items: combinedSemItems
        });
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-5xl max-h-[95vh] overflow-hidden rounded-[2.5rem] shadow-2xl border border-fb-border flex flex-col">
        <div className="p-5 md:p-6 border-b border-fb-border bg-gradient-to-br from-fb-blue/5 to-white relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white hover:bg-fb-gray rounded-full transition-all border border-fb-border text-fb-textPrimary"><X size={20} /></button>
          <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-[1.5rem] bg-white text-fb-blue flex items-center justify-center font-black text-2xl border-4 border-white shadow-xl overflow-hidden shrink-0">
              {student.photoURL ? <img src={student.photoURL} className="w-full h-full object-cover" alt="Profile" /> : <span className="opacity-40 uppercase">{student.firstName?.charAt(0) || formatName(student).charAt(0)}</span>}
            </div>
            <div className="flex-1 text-center md:text-left space-y-2 pt-1">
              <h2 className="text-xl md:text-2xl font-black text-fb-textPrimary capitalize italic tracking-tighter">{formatName(student)}</h2>
              <div className="flex flex-wrap justify-center md:justify-start gap-2">
                <div className="px-3 py-1.5 bg-fb-blue text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg shadow-fb-blue/20">Current: {student.yearLevel || 'N/A'}</div>
                <div className="px-3 py-1.5 bg-fb-gray text-fb-textSecondary rounded-lg text-[9px] font-black uppercase tracking-widest border border-fb-border">ID: {student.studentId || 'N/A'}</div>
                <div className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-[9px] font-black uppercase tracking-widest border border-red-200 shadow-sm">GPA: {calculateGPA(student)}</div>
                <button 
                  onClick={() => setShowHistory(true)}
                  className="px-3 py-1.5 bg-white text-fb-blue hover:bg-fb-blue hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest border border-fb-blue/20 shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Clock size={10} /> Edit history
                </button>
                <button 
                  onClick={() => setShowProfile(true)}
                  className="px-3 py-1.5 bg-white text-fb-blue hover:bg-fb-blue hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest border border-fb-blue/20 shadow-sm transition-all flex items-center gap-1.5"
                >
                  <UserIcon size={10} /> Profile
                </button>
                <button 
                  onClick={handleDownloadPDF}
                  className="px-3 py-1.5 bg-white text-fb-blue hover:bg-fb-blue hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest border border-fb-blue/20 shadow-sm transition-all flex items-center gap-1.5"
                >
                  <ArrowDown size={10} /> Download
                </button>
              </div>
            </div>
          </div>
        </div>

        {permissionError ? (
          <PermissionDeniedGate message="Insufficient permissions to load course registry for grading" />
        ) : (
          <>
            <div className="px-4 md:px-8 py-3 md:py-4 bg-fb-gray/30 border-b border-fb-border flex flex-col md:flex-row items-center justify-center gap-4">
              <div className="flex bg-white p-1 rounded-xl border border-fb-border shadow-sm w-full md:w-auto">
                {(['1st Year', '2nd Year'] as const).filter(y => {
                  if (student.yearLevel === '1st Year') return y === '1st Year';
                  return true;
                }).map(y => (
                  <button 
                    key={y}
                    onClick={() => setYearLevelFilter(y)}
                    className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${yearLevelFilter === y ? 'bg-fb-blue text-white shadow-md' : 'text-fb-textSecondary hover:bg-fb-gray'}`}
                  >
                    {y} Records
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-white p-4 md:p-10 space-y-8 md:space-y-12">
              {semesters.map((semester) => {
                const relevantYear = yearLevelFilter === '1st Year' ? student.firstYearSchoolYear : student.secondYearSchoolYear;
                const activeCourses = relevantYear ? courses.filter(c => c.yearLevel === yearLevelFilter && c.semester === semester && c.schoolYear === relevantYear) : [];
                const studentGrades = (student.grades || []).filter(g => g.yearLevel === yearLevelFilter && g.semester === semester);
                
                // Combine active courses and existing grades
                const combinedItems = [
                  ...studentGrades.map(g => {
                    const activeCourse = activeCourses.find(c => c.id === g.id);
                    return {
                      id: g.id,
                      name: g.courseName,
                      professor: activeCourse?.professor || 'N/A',
                      instructorId: activeCourse?.instructorId,
                      grade: g,
                      isOrphaned: !activeCourse,
                      yearLevel: g.yearLevel,
                      semester: g.semester
                    };
                  }),
                  ...activeCourses.filter(c => !studentGrades.find(g => g.id === c.id)).map(c => ({
                    id: c.id,
                    name: c.name,
                    professor: c.professor,
                    instructorId: c.instructorId,
                    grade: null,
                    isOrphaned: false,
                    yearLevel: c.yearLevel,
                    semester: c.semester
                  }))
                ].sort((a, b) => a.name.localeCompare(b.name));

                return (
                  <div key={semester} className="space-y-4 md:space-y-6">
                    <div className="flex items-center gap-4">
                      <span className="h-px flex-1 bg-fb-border"></span>
                      <h4 className="text-[10px] md:text-xs font-black text-fb-blue uppercase tracking-[0.3em] bg-fb-blue/5 px-4 md:px-6 py-2 rounded-full border border-fb-blue/10 italic">{semester}</h4>
                      <span className="h-px flex-1 bg-fb-border"></span>
                    </div>
                    {combinedItems.length === 0 ? (
                      <div className="py-10 text-center opacity-20"><p className="text-[10px] font-black uppercase tracking-widest italic">No courses defined for this term</p></div>
                    ) : (
                      <div className="space-y-3">
                        {combinedItems.map((item) => {
                          const grade = item.grade;
                          const isEditing = editingGradeId === item.id;
                          const canEditGrade = adminProfile.role !== 'teacher' || item.instructorId === adminProfile.uid || item.professor === formatName(adminProfile);
                          const courseAbsences = attendanceRecords.filter(r => r.courseId === item.id && r.status === 'absent');
                          const excusedCount = courseAbsences.filter(r => r.isExcused).length;
                          const isExpanded = expandedCourseId === item.id;

                          return (
                            <div key={item.id} className="bg-fb-gray/20 rounded-2xl p-4 md:px-6 md:py-4 border border-transparent hover:border-fb-blue/10 hover:bg-fb-gray/40 transition-all group">
                              
                              {/* Mobile View */}
                              <div className="md:hidden flex flex-col gap-1">
                                <div className="flex justify-between items-start">
                                  <div className="flex flex-col flex-1 mr-3">
                                    <span className="text-xs font-bold text-fb-textPrimary truncate capitalize italic leading-tight">{item.name}</span>
                                    {item.isOrphaned && <span className="text-[7px] font-black text-rose-500 uppercase tracking-tighter italic">Course Archived/Deleted</span>}
                                  </div>
                                  <div className="shrink-0 text-right">
                                    {isEditing ? (
                                      <input 
                                        type="number" 
                                        min="0"
                                        max="100"
                                        disabled={editFormData.isIncomplete}
                                        value={editFormData.isIncomplete ? '' : editFormData.gradeValue}
                                        onChange={(e) => {
                                          let val = Number(e.target.value);
                                          if (val > 100) val = 100;
                                          if (val < 0) val = 0;
                                          setEditFormData({...editFormData, gradeValue: val});
                                        }}
                                        className="w-12 text-center bg-white border border-fb-blue rounded-lg py-1 text-xs font-black outline-none disabled:bg-fb-gray"
                                        placeholder={editFormData.isIncomplete ? "-" : ""}
                                      />
                                    ) : (
                                      <span className="text-xs font-black text-fb-textPrimary">
                                        {grade ? (grade.isIncomplete ? "-" : grade.gradeValue) : "-"}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex justify-between items-start">
                                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                    <span className="text-[8px] font-bold text-fb-textSecondary opacity-60 capitalize tracking-tight">Prof. {item.professor}</span>
                                    {courseAbsences.length > 0 && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setExpandedCourseId(isExpanded ? null : item.id); }}
                                        className="flex items-center gap-1 text-[8px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded transition-all cursor-pointer"
                                      >
                                        <span>{courseAbsences.length} {courseAbsences.length === 1 ? 'Abs' : 'Absences'}</span>
                                        <span className="opacity-60 font-medium">({excusedCount} exc)</span>
                                        <ChevronDown size={8} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    {isEditing ? (
                                      <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border shadow-sm">
                                        <span className="text-[8px] font-black text-fb-textSecondary uppercase tracking-tighter">Inc?</span>
                                        <input 
                                          type="checkbox" 
                                          checked={editFormData.isIncomplete}
                                          onChange={(e) => setEditFormData({...editFormData, isIncomplete: e.target.checked})}
                                          className="w-3 h-3 accent-fb-blue cursor-pointer"
                                        />
                                      </div>
                                    ) : (
                                      <span className={`text-[8px] font-black uppercase tracking-widest ${grade ? (grade.isIncomplete ? 'text-amber-600' : grade.gradeValue === '' ? 'text-fb-textSecondary' : grade.gradeValue >= 75 ? 'text-emerald-600' : 'text-rose-600') : 'text-fb-textSecondary'}`}>
                                        {grade ? getStatus(grade.gradeValue, grade.isIncomplete).label : 'Pending'}
                                      </span>
                                    )}
                                    
                                    <div className="flex justify-end gap-2 mt-1">
                                      {canEditGrade && (
                                        isEditing ? (
                                          <>
                                            <button onClick={() => handleUpdateGrade(item.id!, item.name, item.yearLevel, item.semester)} className="p-1.5 bg-fb-blue text-white rounded-lg shadow-md hover:bg-blue-600 transition-all"><Check size={12} /></button>
                                            <button onClick={() => setEditingGradeId(null)} className="p-1.5 bg-white text-fb-textSecondary rounded-lg border hover:bg-fb-gray transition-all"><X size={12} /></button>
                                          </>
                                        ) : (
                                          confirmResetId === item.id ? (
                                            <>
                                              <button 
                                                onClick={() => {
                                                  handleResetGrade(item.id!, item.name);
                                                  setConfirmResetId(null);
                                                }} 
                                                className="p-1.5 bg-emerald-500 text-white rounded-lg shadow-md hover:bg-emerald-600 transition-all"
                                                title="Confirm Reset"
                                              >
                                                <Check size={12} />
                                              </button>
                                              <button 
                                                onClick={() => setConfirmResetId(null)} 
                                                className="p-1.5 bg-rose-500 text-white rounded-lg shadow-md hover:bg-rose-600 transition-all"
                                                title="Cancel"
                                              >
                                                <X size={12} />
                                              </button>
                                            </>
                                          ) : (
                                            <>
                                              <button 
                                                onClick={() => {
                                                  setEditingGradeId(item.id!);
                                                  setEditFormData({ gradeValue: grade?.gradeValue !== undefined ? grade.gradeValue : '', isIncomplete: grade?.isIncomplete || false });
                                                }}
                                                className="p-1.5 text-fb-textSecondary hover:bg-fb-blue hover:text-white rounded-lg transition-all bg-white border border-transparent shadow-sm"
                                                title="Edit Grade"
                                              >
                                                <Edit2 size={12} />
                                              </button>
                                              {grade && (adminProfile.role !== 'teacher' || canEditGrade) && (
                                                <button 
                                                  onClick={() => setConfirmResetId(item.id!)}
                                                  className="p-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all bg-white border border-transparent shadow-sm"
                                                  title="Reset Grade to Pending"
                                                >
                                                  <RotateCcw size={12} />
                                                </button>
                                              )}
                                            </>
                                          )
                                        )
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Desktop View */}
                              <div className="hidden md:grid grid-cols-12 items-center gap-0 w-full">
                                <div className="col-span-5 flex flex-col w-full">
                                  <span className="text-sm font-bold text-fb-textPrimary truncate capitalize italic leading-tight">{item.name}</span>
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <span className="text-[9px] font-bold text-fb-textSecondary opacity-60 capitalize tracking-tight">Prof. {item.professor}</span>
                                    {item.isOrphaned && <span className="text-[7px] font-black text-rose-500 uppercase tracking-tighter italic bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">Archived/Deleted</span>}
                                    {courseAbsences.length > 0 && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setExpandedCourseId(isExpanded ? null : item.id); }}
                                        className="flex items-center gap-1 text-[8px] md:text-[9px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded transition-all cursor-pointer"
                                      >
                                        <span>{courseAbsences.length} {courseAbsences.length === 1 ? 'Absence' : 'Absences'}</span>
                                        <span className="opacity-60 font-medium">({excusedCount} excused)</span>
                                        <ChevronDown size={8} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="col-span-2 flex justify-center">
                                  {isEditing ? (
                                    <input 
                                      type="number" 
                                      min="0"
                                      max="100"
                                      disabled={editFormData.isIncomplete}
                                      value={editFormData.isIncomplete ? '' : editFormData.gradeValue}
                                      onChange={(e) => {
                                        let val = Number(e.target.value);
                                        if (val > 100) val = 100;
                                        if (val < 0) val = 0;
                                        setEditFormData({...editFormData, gradeValue: val});
                                      }}
                                      className="w-20 text-center bg-white border-2 border-fb-blue rounded-xl py-1.5 text-sm font-black outline-none disabled:bg-fb-gray"
                                      placeholder={editFormData.isIncomplete ? "-" : ""}
                                    />
                                  ) : (
                                    <span className="text-sm font-black text-fb-textPrimary">
                                      {grade ? (grade.isIncomplete ? "-" : grade.gradeValue) : "-"}
                                    </span>
                                  )}
                                </div>
                                <div className="col-span-3 flex flex-col items-center">
                                  {isEditing ? (
                                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border shadow-sm">
                                      <span className="text-[10px] font-black text-fb-textSecondary uppercase tracking-tighter">Incomplete?</span>
                                      <input 
                                        type="checkbox" 
                                        checked={editFormData.isIncomplete}
                                        onChange={(e) => setEditFormData({...editFormData, isIncomplete: e.target.checked})}
                                        className="w-4 h-4 accent-fb-blue cursor-pointer"
                                      />
                                    </div>
                                  ) : (
                                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${grade ? getStatus(grade.gradeValue, grade.isIncomplete).color : 'bg-fb-gray text-fb-textSecondary'}`}>
                                      {grade ? getStatus(grade.gradeValue, grade.isIncomplete).label : 'Pending'}
                                    </span>
                                  )}
                                </div>
                                <div className="col-span-2 flex justify-end gap-2">
                                  {canEditGrade && (
                                    isEditing ? (
                                      <>
                                        <button onClick={() => handleUpdateGrade(item.id!, item.name, item.yearLevel, item.semester)} className="p-2.5 bg-fb-blue text-white rounded-xl shadow-md hover:bg-blue-600 transition-all"><Check size={16} /></button>
                                        <button onClick={() => setEditingGradeId(null)} className="p-2.5 bg-white text-fb-textSecondary rounded-xl border hover:bg-fb-gray transition-all"><X size={16} /></button>
                                      </>
                                    ) : (
                                      confirmResetId === item.id ? (
                                        <div className="flex items-center gap-1.5 bg-rose-50/50 border border-rose-100 p-1 rounded-xl">
                                          <span className="text-[9px] font-black uppercase text-rose-700 px-1">Reset?</span>
                                          <button 
                                            onClick={() => {
                                              handleResetGrade(item.id!, item.name);
                                              setConfirmResetId(null);
                                            }} 
                                            className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all"
                                            title="Confirm Reset"
                                          >
                                            <Check size={12} />
                                          </button>
                                          <button 
                                            onClick={() => setConfirmResetId(null)} 
                                            className="p-1.5 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-all"
                                            title="Cancel"
                                          >
                                            <X size={12} />
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <button 
                                            onClick={() => {
                                              setEditingGradeId(item.id!);
                                              setEditFormData({ gradeValue: grade?.gradeValue !== undefined ? grade.gradeValue : '', isIncomplete: grade?.isIncomplete || false });
                                            }}
                                            className="p-2.5 text-fb-textSecondary hover:bg-fb-blue hover:text-white rounded-xl transition-all"
                                            title="Edit Grade"
                                          >
                                            <Edit2 size={16} />
                                          </button>
                                          {grade && (adminProfile.role !== 'teacher' || canEditGrade) && (
                                            <button 
                                              onClick={() => setConfirmResetId(item.id!)}
                                              className="p-2.5 text-rose-600 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all"
                                              title="Reset Grade to Pending"
                                            >
                                              <RotateCcw size={16} />
                                            </button>
                                          )}
                                        </>
                                      )
                                    )
                                  )}
                                </div>
                              </div>

                              {/* Expanded Absences Details */}
                              {isExpanded && courseAbsences.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-fb-border/40 space-y-2 animate-in slide-in-from-top-2 duration-200">
                                  <p className="text-[8px] font-black uppercase tracking-widest text-fb-textSecondary">Absence History</p>
                                  <div className="space-y-1.5">
                                    {courseAbsences.map(abs => (
                                      <div key={abs.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-2 rounded-xl border border-fb-border/60 text-xs">
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono text-fb-textPrimary font-semibold text-[10px]">{abs.date}</span>
                                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${abs.isExcused ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                            {abs.isExcused ? 'Excused' : 'Unexcused'}
                                          </span>
                                        </div>
                                        {abs.notes ? (
                                          <span className="text-fb-textSecondary font-medium italic mt-1 sm:mt-0 max-w-md truncate text-[11px]">Reason: "{abs.notes}"</span>
                                        ) : (
                                          <span className="text-fb-textSecondary/40 italic mt-1 sm:mt-0 text-[11px]">No reason provided</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div className="hidden md:flex p-6 border-t border-fb-border bg-fb-gray/5 justify-end">
          <button onClick={onClose} className="px-10 py-4 bg-white hover:bg-fb-hover text-fb-textPrimary border-2 border-fb-border rounded-2xl font-black uppercase text-xs tracking-[0.2em] transition-all active:scale-95">Exit Records</button>
        </div>
      </div>
      {showHistory && <HistoryModal history={student.editHistory || []} onClose={() => setShowHistory(false)} />}
      {showProfile && <StudentProfileViewModal student={student} onClose={() => setShowProfile(false)} />}

      {/* Hidden PDF Template */}
      <div id="student-records-pdf-container" style={{ position: 'absolute', top: 0, left: '-9999px' }}>
        {pagesData.map((page, index) => (
          <div key={`${page.yearLevel}-${page.semester}`} className="pdf-page" style={{ width: '210mm', minHeight: '297mm', padding: '20mm', background: 'white', color: 'black', fontFamily: 'sans-serif' }}>
            {index === 0 ? (
              <div className="flex items-center gap-6 mb-8 border-b pb-6">
                <div className="w-24 h-24 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center">
                   {student.photoURL ? <img src={student.photoURL} className="w-full h-full object-cover" /> : <span className="text-2xl font-bold">{student.firstName?.charAt(0) || formatName(student).charAt(0)}</span>}
                </div>
                <div>
                  <h1 className="text-2xl font-bold uppercase">{formatName(student)}</h1>
                  <p className="text-sm text-gray-600 uppercase tracking-widest mt-1">ID: {student.studentId || 'N/A'}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">Generated on {new Date().toLocaleDateString()}</p>
                </div>
              </div>
            ) : (
              <div className="mb-8 border-b pb-6">
                <h1 className="text-xl font-bold uppercase">{formatName(student)} - Continued</h1>
                <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">ID: {student.studentId || 'N/A'}</p>
              </div>
            )}

            <div className="mb-8">
              <h3 className="text-sm font-black uppercase tracking-widest border-b pb-2 mb-4">{page.yearLevel} Records</h3>
              <div className="mb-4">
                <h4 className="text-xs font-bold uppercase text-gray-500 mb-2">{page.semester}</h4>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-300 text-left">
                      <th className="py-2 font-bold">Course</th>
                      <th className="py-2 font-bold text-right">Grade</th>
                      <th className="py-2 font-bold text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map(item => {
                      const g = item.grade;
                      const status = g ? getStatus(g.gradeValue, g.isIncomplete) : { label: 'Pending', color: '' };
                      return (
                        <tr key={item.id} className="border-b border-gray-100">
                          <td className="py-2">{item.name}</td>
                          <td className="py-2 text-right font-mono">{g ? (g.isIncomplete ? '-' : g.gradeValue) : '-'}</td>
                          <td className="py-2 text-right">{status.label}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- View Components ---

const StudentGradesView = ({ profile }: { profile: UserProfile }) => {
  const [courses, setCourses] = useState([] as Course[]);
  const [loading, setLoading] = useState(true);
  const [yearLevelFilter, setYearLevelFilter] = useState(profile.yearLevel || '1st Year' as '1st Year' | '2nd Year');
  const [attendanceRecords, setAttendanceRecords] = useState([] as any[]);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "attendance"), where("studentId", "==", profile.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [] as any[];
      snapshot.forEach(docSnap => {
        list.push({ ...docSnap.data(), id: docSnap.id });
      });
      setAttendanceRecords(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "attendance");
    });
    return () => unsub();
  }, [profile.uid]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "courses"), (snapshot) => {
      const list: Course[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Course;
        // Filter by student's school year history
        const relevantYear = yearLevelFilter === '1st Year' ? profile.firstYearSchoolYear : profile.secondYearSchoolYear;
        if (relevantYear && data.schoolYear === relevantYear) {
          list.push({ ...data, id: docSnap.id });
        }
      });
      setCourses(list);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, "courses");
    });
    return () => unsub();
  }, [yearLevelFilter, profile.firstYearSchoolYear, profile.secondYearSchoolYear]);

  const getStatus = (gradeValue: number | '', isIncomplete: boolean) => {
    if (isIncomplete) return { label: 'Incomplete', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    if (gradeValue === '') return { label: 'Pending', color: 'bg-fb-gray text-fb-textSecondary' };
    if (gradeValue >= 75) return { label: `Passed - ${gradeValue}`, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    return { label: `Failed - ${gradeValue}`, color: 'bg-rose-100 text-rose-700 border-rose-200' };
  };

  const semesters = ['1st Semester', '2nd Semester', '3rd Semester'] as const;

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw className="animate-spin text-fb-blue" size={32} /></div>;

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-fb-border overflow-hidden flex flex-col animate-in fade-in duration-500 mb-10">
      <div className="p-8 md:p-10 border-b border-fb-border bg-gradient-to-br from-fb-blue/5 to-white">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
          <div className="w-28 h-28 md:w-32 md:h-32 rounded-[2rem] bg-white text-fb-blue flex items-center justify-center font-black text-4xl border-4 border-white shadow-xl overflow-hidden shrink-0">
            {profile.photoURL ? <img src={profile.photoURL} className="w-full h-full object-cover" alt="Profile" /> : <span className="opacity-40 uppercase">{profile.firstName?.charAt(0) || formatName(profile).charAt(0)}</span>}
          </div>
          <div className="flex-1 text-center md:text-left space-y-4 pt-2">
            <h2 className="text-3xl font-black text-fb-textPrimary capitalize italic tracking-tighter">{formatName(profile)}</h2>
            <div className="flex flex-wrap justify-center md:justify-start gap-3">
              <div className="px-5 py-2 bg-fb-blue text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-fb-blue/20">Current: {profile.yearLevel || 'N/A'}</div>
              <div className="px-5 py-2 bg-fb-gray text-fb-textSecondary rounded-xl text-[10px] font-black uppercase tracking-widest border border-fb-border">ID: {profile.studentId || 'N/A'}</div>
              <div className="px-5 py-2 bg-red-100 text-red-700 rounded-xl text-[10px] font-black uppercase tracking-widest border border-red-200 shadow-sm">GPA: {calculateGPA(profile)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-4 bg-fb-gray/30 border-b border-fb-border flex flex-col md:flex-row items-center justify-center gap-4">
        <div className="flex bg-white p-1 rounded-xl border border-fb-border shadow-sm">
          {(['1st Year', '2nd Year'] as const).filter(y => {
            if (profile.yearLevel === '1st Year') return y === '1st Year';
            return true;
          }).map(y => (
            <button 
              key={y}
              onClick={() => setYearLevelFilter(y)}
              className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${yearLevelFilter === y ? 'bg-fb-blue text-white shadow-md' : 'text-fb-textSecondary hover:bg-fb-gray'}`}
            >
              {y} Records
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-white p-8 md:p-10 space-y-12">
        {semesters.map((semester) => {
          const activeCourses = courses.filter(c => c.yearLevel === yearLevelFilter && c.semester === semester);
          const studentGrades = (profile.grades || []).filter(g => g.yearLevel === yearLevelFilter && g.semester === semester);

          // Combine active courses and existing grades
          const combinedItems = [
            ...studentGrades.map(g => {
              const activeCourse = activeCourses.find(c => c.id === g.id);
              return {
                id: g.id,
                name: g.courseName,
                professor: activeCourse?.professor || 'N/A',
                grade: g,
                isOrphaned: !activeCourse
              };
            }),
            ...activeCourses.filter(c => !studentGrades.find(g => g.id === c.id)).map(c => ({
              id: c.id,
              name: c.name,
              professor: c.professor,
              grade: null,
              isOrphaned: false
            }))
          ];

          return (
            <div key={semester} className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="h-px flex-1 bg-fb-border"></span>
                <h4 className="text-xs font-black text-fb-blue uppercase tracking-[0.3em] bg-fb-blue/5 px-6 py-2 rounded-full border border-fb-blue/10 italic">{semester}</h4>
                <span className="h-px flex-1 bg-fb-border"></span>
              </div>
              {combinedItems.length === 0 ? (
                <div className="py-10 text-center opacity-20"><p className="text-[10px] font-black uppercase tracking-widest italic">No courses defined for this term</p></div>
              ) : (
                <div className="space-y-3">
                  {combinedItems.map((item) => {
                    const grade = item.grade;
                    const courseAbsences = attendanceRecords.filter(r => r.courseId === item.id && r.status === 'absent');
                    const excusedCount = courseAbsences.filter(r => r.isExcused).length;
                    const isExpanded = expandedCourseId === item.id;

                    return (
                      <div key={item.id} className="bg-fb-gray/20 rounded-2xl p-4 md:p-6 border border-transparent hover:border-fb-blue/10 hover:bg-fb-gray/40 transition-all">
                        <div className="grid grid-cols-12 items-center gap-2">
                          <div className="col-span-6 md:col-span-5 flex flex-col">
                            <span className="text-xs md:text-sm font-bold text-fb-textPrimary truncate capitalize italic leading-none">{item.name}</span>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                              <span className="text-[8px] md:text-[9px] font-bold text-fb-textSecondary opacity-60 capitalize tracking-tight">{item.professor}</span>
                              {item.isOrphaned && <span className="text-[7px] font-black text-rose-500 uppercase tracking-tighter italic bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">Archived/Deleted</span>}
                              
                              {courseAbsences.length > 0 && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setExpandedCourseId(isExpanded ? null : item.id); }}
                                  className="flex items-center gap-1 text-[8px] md:text-[9px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded transition-all cursor-pointer"
                                >
                                  <span>{courseAbsences.length} {courseAbsences.length === 1 ? 'Absence' : 'Absences'}</span>
                                  <span className="opacity-60 font-medium">({excusedCount} excused)</span>
                                  <ChevronDown size={8} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="col-span-2 flex justify-center">
                            <span className="text-xs md:text-sm font-black text-fb-textPrimary">
                              {grade ? (grade.isIncomplete ? "-" : grade.gradeValue) : "-"}
                            </span>
                          </div>
                          <div className="col-span-4 md:col-span-5 flex justify-end items-center">
                            <span className={`px-2 md:px-4 py-1 md:py-1.5 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest border shadow-sm text-center ${grade ? getStatus(grade.gradeValue, grade.isIncomplete).color : 'bg-fb-gray text-fb-textSecondary'}`}>
                              {grade ? getStatus(grade.gradeValue, grade.isIncomplete).label : 'Pending'}
                            </span>
                          </div>
                        </div>

                        {isExpanded && courseAbsences.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-fb-border/40 space-y-2 animate-in slide-in-from-top-2 duration-200">
                            <p className="text-[8px] font-black uppercase tracking-widest text-fb-textSecondary">Absence History</p>
                            <div className="space-y-1.5">
                              {courseAbsences.map(abs => (
                                <div key={abs.id} className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-2.5 rounded-xl border border-fb-border/60 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-fb-textPrimary font-semibold text-[11px]">{abs.date}</span>
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${abs.isExcused ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                      {abs.isExcused ? 'Excused' : 'Unexcused'}
                                    </span>
                                  </div>
                                  {abs.notes ? (
                                    <span className="text-fb-textSecondary font-medium italic mt-1 md:mt-0 max-w-md truncate">Reason: "{abs.notes}"</span>
                                  ) : (
                                    <span className="text-fb-textSecondary/40 italic mt-1 md:mt-0">No reason provided</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StudentCalendarView = ({ profile }: { profile: UserProfile }) => {
  const [courses, setCourses] = useState([] as Course[]);
  const [loading, setLoading] = useState(true);
  const [dayDetailData, setDayDetailData] = useState(null as { date: string, courses: Course[] } | null);
  const [teachers, setTeachers] = useState([] as UserProfile[]);

  const enrolledIdsStr = JSON.stringify(profile.grades?.map(g => g.id) || []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "courses"), (snapshot) => {
      const list: Course[] = [];
      const enrolledIds = profile.grades?.map(g => g.id) || [];
      
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Course;
        // Only show active courses for the student's year level AND matching school year, or based on student enrollment
        let shouldInclude = false;
        if (profile.role === 'teacher') {
          shouldInclude = data.instructorId === profile.uid || data.professor === formatName(profile);
        } else if (profile.role === 'president' || profile.role === 'vice president' || profile.role === 'admin') {
          shouldInclude = true;
        } else if (profile.role === 'student') {
          shouldInclude = enrolledIds.includes(docSnap.id);
        } else {
          const relevantYear = profile.yearLevel === '1st Year' ? profile.firstYearSchoolYear : profile.secondYearSchoolYear;
          shouldInclude = data.yearLevel === profile.yearLevel && data.schoolYear === relevantYear;
        }
        
        if (shouldInclude && data.status !== 'archived') {
          list.push({ ...data, id: docSnap.id });
        }
      });
      setCourses(list);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, "courses");
    });
    return () => unsub();
  }, [profile.yearLevel, profile.firstYearSchoolYear, profile.secondYearSchoolYear, enrolledIdsStr]);

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw className="animate-spin text-fb-blue" size={32} /></div>;

  return (
    <div className="space-y-8 pb-10">
      <CourseCalendar 
        courses={courses} 
        onDayClick={(date, dayCourses) => setDayDetailData({ date, courses: dayCourses })} 
      />

      {dayDetailData && (
        <CalendarDayModal 
          data={dayDetailData} 
          onClose={() => setDayDetailData(null)} 
        />
      )}
    </div>
  );
};

// --- Profile Page Component ---

const ProfilePage = ({ profile }: { profile: UserProfile | null }) => {
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
      const q = query(collection(db, "courses"));
      const unsub = onSnapshot(q, (snapshot) => {
        const list: Course[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Course;
          if (data.status !== 'archived' && (data.instructorId === profile.uid || data.professor === formatName(profile))) {
            list.push({ ...data, id: docSnap.id });
          }
        });
        setAssignedCourses(list);
        setCoursesLoading(false);
      }, (error) => {
        console.error("Error loading assigned courses for teacher:", error);
        setCoursesLoading(false);
      });
      return () => unsub();
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
    try {
      await updateDoc(doc(db, "users", profile.uid), { ...formData, fullName });
      setSuccessMessage("Your profile has been updated and saved.");
      setIsEditing(false);
    } catch (err) {
      alert("Failed to update profile.");
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

// --- View Components for Home, Accounts, and Records ---

const EnrollModal = ({ 
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

const CleanUpRecordsModal = ({ students, onClose, onSuccess, onError }: { students: UserProfile[], onClose: () => void, onSuccess: (msg: string) => void, onError: (msg: string) => void }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const snap = await getDocs(collection(db, "courses"));
        const list: Course[] = [];
        snap.forEach(doc => {
          const data = doc.data() as Course;
          if (data.status !== 'archived') {
            list.push({ ...data, id: doc.id });
          }
        });
        setCourses(list);
      } catch (err) {
        console.error("Error fetching courses:", err);
      } finally {
        setLoadingCourses(false);
      }
    };
    fetchCourses();
  }, []);

  const handleCleanUp = async () => {
    if (selectedStudents.length === 0) return;
    setIsProcessing(true);
    try {
      const activeCourseIds = new Set(courses.map(c => c.id));
      const promises = selectedStudents.map(async (uid) => {
        const student = students.find(s => s.uid === uid);
        if (!student || !student.grades) return;
        
        const originalGrades = student.grades;
        const cleanedGrades = originalGrades.filter(g => activeCourseIds.has(g.id));
        
        if (originalGrades.length !== cleanedGrades.length) {
          await updateDoc(doc(db, "users", uid), { grades: cleanedGrades });
        }
      });
      await Promise.all(promises);
      onSuccess("Successfully cleaned up selected students' records.");
      onClose();
    } catch (err: any) {
      onError("Cleanup failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleStudent = (uid: string) => {
    setSelectedStudents(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const filteredStudents = students.filter(s => 
    s.role === 'student' && 
    formatName(s).toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => formatName(a).localeCompare(formatName(b)));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl border border-fb-border flex flex-col">
        <div className="p-6 border-b border-fb-border flex justify-between items-center bg-fb-gray/50">
          <h2 className="text-xl font-bold text-fb-textPrimary tracking-tight flex items-center gap-2">
            <RefreshCw className="text-fb-blue" size={20} />
            Clean Up Student Records
          </h2>
          <button onClick={onClose} className="p-2 bg-white hover:bg-gray-100 rounded-full transition-all text-fb-textPrimary shadow-sm">
            <X size={16} />
          </button>
        </div>
        
        <div className="p-6 flex flex-col gap-4 flex-1 overflow-hidden">
          <p className="text-sm text-fb-textSecondary leading-relaxed font-medium">
            Select students to clean up their enrolled courses. This will remove any course from their records that is no longer active or does not exist in the course list.
          </p>
          
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-fb-textSecondary" size={16} />
            <input 
              type="text" 
              placeholder="Search students..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-fb-gray border border-transparent rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-fb-blue text-sm font-semibold transition-all"
            />
          </div>

          <div className="flex-1 overflow-y-auto border border-fb-border rounded-xl custom-scrollbar">
            {loadingCourses ? (
              <div className="flex items-center justify-center h-full p-8">
                <RefreshCw className="animate-spin text-fb-blue" size={24} />
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="p-8 text-center text-fb-textSecondary text-sm font-bold">No students found.</div>
            ) : (
              <div className="divide-y divide-fb-border">
                {filteredStudents.map(student => (
                  <label key={student.uid} className="flex items-center gap-3 p-4 hover:bg-fb-gray/50 cursor-pointer transition-colors">
                    <input 
                      type="checkbox" 
                      checked={selectedStudents.includes(student.uid)}
                      onChange={() => toggleStudent(student.uid)}
                      className="w-4 h-4 rounded border-gray-300 text-fb-blue focus:ring-fb-blue"
                    />
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-fb-textPrimary">{formatName(student)}</span>
                      <span className="text-xs text-fb-textSecondary">{student.email}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-fb-border bg-fb-gray/50 flex justify-between items-center">
          <span className="text-xs font-bold text-fb-textSecondary uppercase tracking-widest">
            {selectedStudents.length} Selected
          </span>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-6 py-2.5 bg-white text-fb-textPrimary border border-fb-border rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-fb-gray transition-all">
              Cancel
            </button>
            <button 
              onClick={handleCleanUp} 
              disabled={isProcessing || selectedStudents.length === 0 || loadingCourses}
              className="px-6 py-2.5 bg-fb-blue text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              {isProcessing ? <RefreshCw className="animate-spin" size={14} /> : <CheckCircle size={14} />}
              {isProcessing ? 'Cleaning...' : 'Clean Up Records'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminPanel = ({ profile }: { profile: UserProfile }) => {
  const [allUsers, setAllUsers] = useState([] as UserProfile[]);
  const [archivedUsers, setArchivedUsers] = useState([] as UserProfile[]);
  const [isViewArchive, setIsViewArchive] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all' as 'all' | 'admin' | 'student');
  const [permissionError, setPermissionError] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [resettingPasswordUser, setResettingPasswordUser] = useState<UserProfile | null>(null);
  const [selectedToArchiveUsers, setSelectedToArchiveUsers] = useState([] as string[]);
  const [selectedToRestoreUsers, setSelectedToRestoreUsers] = useState([] as string[]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [yearLevelFilter, setYearLevelFilter] = useState('all' as 'all' | '1st Year' | '2nd Year' | 'none');
  const [sortOrder, setSortOrder] = useState('none' as 'none' | 'asc' | 'desc');
  const itemsPerPage = 10;

  const canManageAccounts = profile?.role === 'admin';

  const toggleSort = () => {
    setSortOrder(prev => prev === 'none' ? 'asc' : prev === 'asc' ? 'desc' : 'none');
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, yearLevelFilter, isViewArchive]);

  useEffect(() => {
    const unsubActive = onSnapshot(collection(db, "users"), (snapshot) => {
      const usersData = [] as UserProfile[];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as UserProfile;
        if (data && (data.email || formatName(data))) {
          usersData.push({ ...data, uid: docSnap.id });
        }
      });
      setAllUsers(usersData);
      setPermissionError(false);
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.warn("Permission denied for active user list.");
        setPermissionError(true);
      }
      handleFirestoreError(error, OperationType.LIST, "users");
    });

    const unsubArchived = onSnapshot(collection(db, "archived_users"), (snapshot) => {
      const archivedData = [] as UserProfile[];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as UserProfile;
        if (data && (data.email || formatName(data))) {
          archivedData.push({ ...data, uid: docSnap.id });
        }
      });
      setArchivedUsers(archivedData);
    }, (error) => {
      console.warn("Archived Users collection check:", error.message);
      handleFirestoreError(error, OperationType.LIST, "archived_users");
    });

    return () => { unsubActive(); unsubArchived(); };
  }, []);

  const syncStudentToCourses = async (uid: string, profile: UserProfile) => {
    if (profile.role !== 'student') return;
    
    let sy = "";
    if (profile.yearLevel === '1st Year') sy = profile.firstYearSchoolYear || "";
    else if (profile.yearLevel === '2nd Year') sy = profile.secondYearSchoolYear || "";
    
    if (!sy || !profile.yearLevel) return;

    try {
      const q = query(
        collection(db, "courses"),
        where("yearLevel", "==", profile.yearLevel),
        where("schoolYear", "==", sy)
      );
      const snap = await getDocs(q);
      
      // Get fresh data to avoid stale state
      const freshDoc = await getDoc(doc(db, "users", uid));
      if (!freshDoc.exists()) return;
      const freshData = freshDoc.data() as UserProfile;
      
      const existingGrades = freshData.grades || [];
      let updated = false;
      const newGrades = [...existingGrades];

      snap.docs.forEach(courseDoc => {
        const course = courseDoc.data() as Course;
        const hasCourse = existingGrades.some(g => g.id === courseDoc.id);
        if (!hasCourse) {
          newGrades.push({
            id: courseDoc.id,
            courseName: course.name,
            gradeValue: '',
            isIncomplete: false,
            dateReleased: new Date().toISOString().split('T')[0],
            yearLevel: course.yearLevel as any,
            semester: course.semester as any
          });
          updated = true;
        }
      });

      if (updated) {
        await updateDoc(doc(db, "users", uid), { grades: newGrades });
      }
    } catch (err) {
      console.error("Error syncing student to courses:", err);
    }
  };

  const handleSaveUser = async (updatedFields: Partial<UserProfile>) => {
    if (!editingUser) return;
    const coll = isViewArchive ? "archived_users" : "users";
    
    if (updatedFields.email && updatedFields.email !== editingUser.email) {
      const newEmail = updatedFields.email;
      const tempPassword = Math.random().toString(36).slice(-8) + "A1!";
      
      try {
        const secondaryApp = initializeApp(firebaseConfig, "secondary-email-update-" + Date.now());
        const secondaryAuth = getAuth(secondaryApp);
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, tempPassword);
        const newUid = userCredential.user.uid;
        
        await signOut(secondaryAuth);
        await deleteApp(secondaryApp);

        const newProfileData = {
          ...editingUser,
          ...updatedFields,
          uid: newUid,
          email: newEmail,
        };
        
        await setDoc(doc(db, coll, newUid), newProfileData);
        await deleteDoc(doc(db, coll, editingUser.uid));
        
        // Sync courses if student
        if (newProfileData.role === 'student') {
          await syncStudentToCourses(newUid, newProfileData as UserProfile);
        }
        
        setSuccessMsg(`Email updated successfully The new temporary password for ${newEmail} is:\n\n${tempPassword}\n\nPlease provide this to the user. They can no longer log in with their old email.`);
        setEditingUser(null);
      } catch (err: any) {
        if (err.code === 'auth/email-already-in-use') {
          alert("Cannot update email: The email address is already in use by another account. Please use a different email address.");
        } else {
          alert("Failed to update email: " + err.message);
        }
        return;
      }
    } else {
      try { 
        await updateDoc(doc(db, coll, editingUser.uid), updatedFields); 
        
        // Sync courses if student and relevant fields changed
        if (editingUser.role === 'student') {
          const freshProfile = { ...editingUser, ...updatedFields } as UserProfile;
          await syncStudentToCourses(editingUser.uid, freshProfile);
        }

        alert("Updated successfully."); 
        setEditingUser(null);
      } catch (err: any) {
        alert("Failed to update: " + err.message);
      }
    }
  };

  const handleCreateUser = async (newFields: Partial<UserProfile & { tempPassword?: string }>) => {
    const { email, tempPassword, role, firstName, lastName, ...otherData } = newFields;
    if (!email || !tempPassword || !firstName || !lastName) {
      setErrorMsg("First Name, Last Name, Email, and temporary password are required.");
      return;
    }

    try {
      const secondaryApp = initializeApp(firebaseConfig, "secondary-signup-" + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
      const uid = userCredential.user.uid;
      
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);

      const fullName = `${firstName} ${lastName}`.trim();
      const profileData = {
        ...otherData,
        firstName,
        lastName,
        uid,
        email,
        role: role || 'student',
        status: "Active",
        grades: [],
        fullName,
        createdAt: Timestamp.now()
      };
      
      await setDoc(doc(db, "users", uid), profileData);
      
      // Sync courses if student
      if (profileData.role === 'student') {
        await syncStudentToCourses(uid, profileData as UserProfile);
      }

      setSuccessMsg(`Account created and registered successfully for ${email}`);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setErrorMsg("Cannot create account: The email address is already in use by another account. Please use a different email address.");
      } else {
        setErrorMsg(`Account creation failed: ${err.message}`);
      }
    }
  };

  const handleBatchArchiveUsers = async () => {
    if (selectedToArchiveUsers.length === 0) return;
    setIsProcessing(true);
    try {
      const promises = selectedToArchiveUsers.map(async (uid) => {
        const user = allUsers.find(u => u.uid === uid);
        if (user) {
          await setDoc(doc(db, "archived_users", uid), {
            ...user,
            status: "Archived",
            archivedAt: Timestamp.now()
          });
          await deleteDoc(doc(db, "users", uid));
        }
      });
      await Promise.all(promises);
      setSelectedToArchiveUsers([]);
      alert("Selected accounts archived.");
    } catch (err: any) {
      alert("Archive failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchRestoreUsers = async () => {
    if (selectedToRestoreUsers.length === 0) return;
    setIsProcessing(true);
    try {
      const promises = selectedToRestoreUsers.map(async (uid) => {
        const user = archivedUsers.find(u => u.uid === uid);
        if (user) {
          const { archivedAt, ...cleanData } = user as any;
          await setDoc(doc(db, "users", uid), {
            ...cleanData,
            status: "Active"
          });
          await deleteDoc(doc(db, "archived_users", uid));
        }
      });
      await Promise.all(promises);
      setSelectedToRestoreUsers([]);
      alert("Selected accounts restored.");
    } catch (err: any) {
      alert("Restore failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEnroll = async (yearLevel: string, batchName: string, schoolYear: string) => {
    if (selectedToArchiveUsers.length === 0) {
      alert("No students selected.");
      return;
    }

    setIsProcessing(true);
    try {
      const promises = selectedToArchiveUsers.map(async (uid) => {
        const user = allUsers.find(u => u.uid === uid);
        if (user && user.role === 'student') {
          const updatedFields: Partial<UserProfile> = {
            yearLevel: yearLevel as any,
            batchName: batchName,
          };
          if (yearLevel === '1st Year') {
            updatedFields.firstYearSchoolYear = schoolYear;
          } else if (yearLevel === '2nd Year') {
            updatedFields.secondYearSchoolYear = schoolYear;
          }
          
          await updateDoc(doc(db, "users", uid), updatedFields);
          
          // Sync courses
          const freshProfile = { ...user, ...updatedFields } as UserProfile;
          await syncStudentToCourses(uid, freshProfile);
        }
      });
      
      await Promise.all(promises);
      setSelectedToArchiveUsers([]);
      setIsEnrolling(false);
      alert("Successfully enrolled selected students.");
    } catch (err: any) {
      alert("Enrollment failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleUserSelection = (uid: string) => {
    if (isViewArchive) {
      setSelectedToRestoreUsers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
    } else {
      setSelectedToArchiveUsers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
    }
  };

  const currentUsers = isViewArchive ? archivedUsers : allUsers;
  const filteredUsers = useMemo(() => {
    return currentUsers.filter(u => {
      // Hide specific admin accounts from the interface
      if (HIDDEN_ADMIN_EMAILS.includes(u.email || '')) return false;
      
      const term = search.toLowerCase();
      const matchesSearch = formatName(u).toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term);
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesYear = 
        yearLevelFilter === 'all' ? true : 
        yearLevelFilter === 'none' ? !u.yearLevel : 
        u.yearLevel === yearLevelFilter;
      return matchesSearch && matchesRole && matchesYear;
    }).sort((a, b) => {
      const nameA = formatName(a).toLowerCase();
      const nameB = formatName(b).toLowerCase();
      if (sortOrder === 'asc') return nameA.localeCompare(nameB);
      if (sortOrder === 'desc') return nameB.localeCompare(nameA);
      return nameA.localeCompare(nameB);
    });
  }, [currentUsers, search, roleFilter, yearLevelFilter, sortOrder]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (permissionError) return <PermissionDeniedGate message="Insufficient permissions to load user directory" />;

  const isAnySelected = isViewArchive ? selectedToRestoreUsers.length > 0 : selectedToArchiveUsers.length > 0;

  return (
    <div className="space-y-6 pb-10">
      <Card noPadding>
        {/* Uniform Header Layout matching Course Page - 40/15/15/15/15 grid */}
        <div className="p-3 md:p-4 lg:p-5 flex flex-col md:flex-row gap-3 md:gap-4 border-b border-fb-border items-start">
          {/* Search Box - 30% */}
          <div className="w-full md:w-[30%] relative">
            <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-fb-textSecondary" size={14} />
            <input 
              type="text" 
              placeholder="Search users..." 
              className="w-full h-full bg-fb-gray border border-transparent rounded-full pl-9 md:pl-10 pr-9 md:pr-10 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[10px] md:text-xs font-semibold transition-all" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white rounded-full text-fb-textSecondary transition-all"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Role Filter - 15% */}
          <div className="w-full md:w-[15%] relative">
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as any)} className="w-full h-full bg-fb-gray border border-transparent rounded-full px-3 md:px-4 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[9px] md:text-[10px] font-bold transition-all appearance-none cursor-pointer">
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="president">President</option>
              <option value="vice president">Vice President</option>
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
            </select>
          </div>

          {/* Year Level Filter - 15% */}
          <div className="w-full md:w-[15%] relative">
            <select value={yearLevelFilter} onChange={(e) => setYearLevelFilter(e.target.value as any)} className="w-full h-full bg-fb-gray border border-transparent rounded-full px-3 md:px-4 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[9px] md:text-[10px] font-bold transition-all appearance-none cursor-pointer">
              <option value="all">All Years</option>
              <option value="1st Year">1st Year</option>
              <option value="2nd Year">2nd Year</option>
              <option value="none">No Year Level</option>
            </select>
          </div>
          
          {/* Registry/Archive Toggle - 15% */}
          {canManageAccounts ? (
            <button 
              onClick={() => { setIsViewArchive(!isViewArchive); setSearch(''); setSelectedToArchiveUsers([]); setSelectedToRestoreUsers([]); }}
              className={`w-full md:w-[15%] py-1.5 md:py-2 rounded-full font-bold text-[9px] md:text-[10px] shadow-sm transition-all flex items-center justify-center gap-2 border ${isViewArchive ? 'bg-fb-textPrimary text-white' : 'bg-white text-fb-textSecondary hover:bg-fb-hover'}`}
            >
              {isViewArchive ? <Database size={12} /> : <Archive size={12} />}
              <span>{isViewArchive ? "Registry" : "Archive"}</span>
            </button>
          ) : (
            <div className="w-full md:w-[15%]"></div>
          )}

          {/* Action Column - 25% */}
          <div className="w-full md:w-[25%] flex flex-col gap-2">
            {canManageAccounts && (
              <>
                <div className="flex gap-2 w-full">
                  <button onClick={() => setIsCreating(true)} className="flex-1 bg-fb-blue text-white py-1.5 md:py-2 rounded-full font-bold text-[9px] md:text-[10px] shadow-md hover:bg-blue-600 transition-all flex items-center justify-center gap-1">
                    <UserPlus size={14} /><span>Add Account</span>
                  </button>
                  <button onClick={() => setIsCleaningUp(true)} className="flex-1 bg-amber-500 text-white py-1.5 md:py-2 rounded-full font-bold text-[9px] md:text-[10px] shadow-md hover:bg-amber-600 transition-all flex items-center justify-center gap-1">
                    <RefreshCw size={14} /><span>Clean Up</span>
                  </button>
                </div>
                
                {isAnySelected && (
                  <div className="flex flex-col gap-2 w-full animate-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-2 w-full">
                      {!isViewArchive && (
                        <button 
                          onClick={() => setIsEnrolling(true)}
                          disabled={isProcessing}
                          className="flex-1 flex items-center justify-center gap-1 py-1 md:py-1.5 rounded-full text-[8px] md:text-[9px] font-black uppercase transition-all shadow-md bg-emerald-500 text-white hover:bg-emerald-600"
                        >
                          <GraduationCap size={10} />
                          <span>Enroll</span>
                        </button>
                      )}
                      <button 
                        onClick={isViewArchive ? handleBatchRestoreUsers : handleBatchArchiveUsers}
                        disabled={isProcessing}
                        className={`flex-1 flex items-center justify-center gap-1 py-1 md:py-1.5 rounded-full text-[8px] md:text-[9px] font-black uppercase transition-all shadow-md ${isViewArchive ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-red-600 text-white hover:bg-red-700'}`}
                      >
                        {isProcessing ? <RefreshCw className="animate-spin" size={10}/> : (isViewArchive ? <RotateCcw size={10}/> : <Archive size={10}/>)}
                        <span>{isViewArchive ? `Restore` : `Archive`}</span>
                      </button>
                    </div>
                    <div className="flex justify-center">
                      <span className="text-fb-textSecondary text-[8px] font-black uppercase whitespace-nowrap tracking-tighter">
                        {isViewArchive ? selectedToRestoreUsers.length : selectedToArchiveUsers.length} Selected
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead className="bg-fb-gray/50 border-b">
              <tr className="text-left font-black uppercase text-fb-textSecondary tracking-widest">
                <th className="py-4 px-6">
                  <div className="flex items-center gap-2">
                    <span>User</span>
                    <button onClick={toggleSort} className={`p-1 rounded transition-all ${sortOrder !== 'none' ? 'text-fb-blue' : 'hover:bg-fb-gray'}`}>
                      {sortOrder === 'none' ? <ArrowUpDown size={12}/> : sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>}
                    </button>
                  </div>
                </th>
                <th className="py-4 px-6">Role</th>
                {isViewArchive && <th className="py-4 px-6 text-center">Archived Date</th>}
                {canManageAccounts && <th className="py-4 px-6 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedUsers.map(u => {
                const isSelected = isViewArchive ? selectedToRestoreUsers.includes(u.uid) : selectedToArchiveUsers.includes(u.uid);
                return (
                  <tr key={u.uid} className={`hover:bg-fb-hover transition-all ${isSelected ? 'bg-fb-blue/5' : ''}`}>
                    <td className="py-4 px-6">
                      <div className="flex flex-col">
                        <p className="font-bold text-fb-textPrimary capitalize italic">{formatName(u)}</p>
                        <p className="text-[10px] text-fb-textSecondary opacity-60 font-medium">{u.email}</p>
                        {u.studentId && <p className="text-[9px] font-black uppercase text-fb-blue mt-0.5 tracking-tighter">ID: {u.studentId}</p>}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${u.role === 'admin' ? 'bg-amber-50 text-amber-600' : 'bg-fb-blue/5 text-fb-blue'}`}>{u.role}</span>
                        {u.role === 'admin' && u.adminCategory && (
                          <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-100/50 px-2 py-0.5 rounded border border-amber-200">{u.adminCategory}</span>
                        )}
                      </div>
                    </td>
                    {isViewArchive && (
                      <td className="py-4 px-6 text-center">
                        <span className="text-[10px] font-bold text-fb-textSecondary uppercase italic">
                          {u.archivedAt ? (u.archivedAt instanceof Timestamp ? u.archivedAt.toDate() : new Date(u.archivedAt.seconds * 1000)).toLocaleDateString() : 'N/A'}
                        </span>
                      </td>
                    )}
                    {canManageAccounts && (
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-6">
                          {!isViewArchive && canManageAccounts && (
                            <>
                              <div className="flex flex-col items-center gap-1 group">
                                <button onClick={() => setEditingUser(u)} className="p-2 hover:bg-fb-gray rounded-lg transition-colors">
                                  <Edit2 size={16} className="text-fb-textSecondary group-hover:text-fb-blue" />
                                </button>
                                <span className="text-[8px] font-black uppercase text-fb-textSecondary opacity-60">Edit</span>
                              </div>
                              <div className="flex flex-col items-center gap-1 group">
                                <button onClick={() => setResettingPasswordUser(u)} className="p-2 hover:bg-fb-gray rounded-lg transition-colors">
                                  <KeyRound size={16} className="text-fb-textSecondary group-hover:text-fb-blue" />
                                </button>
                                <span className="text-[8px] font-black uppercase text-fb-textSecondary opacity-60 text-center w-16 leading-tight">Password Reset</span>
                              </div>
                            </>
                          )}
                          {canManageAccounts && (
                            <div className="flex flex-col items-center gap-1">
                              <div className="p-2">
                                <input 
                                  type="checkbox" 
                                  checked={isSelected}
                                  onChange={() => toggleUserSelection(u.uid)}
                                  className="w-4 h-4 rounded border-fb-border text-fb-blue focus:ring-fb-blue cursor-pointer"
                                />
                              </div>
                              <span className="text-[8px] font-black uppercase text-fb-textSecondary opacity-60">
                                {isViewArchive ? "Restore" : "Select"}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={2 + (isViewArchive ? 1 : 0) + (canManageAccounts ? 1 : 0)} className="py-20 text-center opacity-30">
                    <div className="flex flex-col items-center">
                      <Users size={48} className="mb-4" />
                      <p className="font-black uppercase text-[10px] tracking-widest italic">No accounts found in {isViewArchive ? 'Archive' : 'Registry'}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile List View */}
        <div className="md:hidden flex flex-col divide-y">
          {paginatedUsers.map(u => {
            const isSelected = isViewArchive ? selectedToRestoreUsers.includes(u.uid) : selectedToArchiveUsers.includes(u.uid);
            return (
              <div key={u.uid} className={`p-4 flex flex-col gap-3 ${isSelected ? 'bg-fb-blue/5' : ''}`}>
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <p className="font-bold text-fb-textPrimary text-sm capitalize italic">{formatName(u)}</p>
                    <p className="text-xs text-fb-textSecondary opacity-60 font-medium">{u.email}</p>
                    {u.studentId && <p className="text-[10px] font-black uppercase text-fb-blue mt-1 tracking-tighter">ID: {u.studentId}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${u.role === 'admin' ? 'bg-amber-50 text-amber-600' : 'bg-fb-blue/5 text-fb-blue'}`}>{u.role}</span>
                    {u.role === 'admin' && u.adminCategory && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-100/50 px-2 py-0.5 rounded border border-amber-200">{u.adminCategory}</span>
                    )}
                  </div>
                </div>
                
                {isViewArchive && (
                  <div className="text-[10px] font-bold text-fb-textSecondary uppercase italic">
                    Archived: {u.archivedAt ? (u.archivedAt instanceof Timestamp ? u.archivedAt.toDate() : new Date(u.archivedAt.seconds * 1000)).toLocaleDateString() : 'N/A'}
                  </div>
                )}

                {canManageAccounts && (
                  <div className="flex items-center justify-end gap-4 pt-2 border-t border-dashed border-fb-border/50">
                    {!isViewArchive && canManageAccounts && (
                      <>
                        <button onClick={() => setEditingUser(u)} className="flex items-center gap-1.5 px-3 py-1.5 bg-fb-gray rounded-lg text-[10px] font-bold text-fb-textSecondary uppercase">
                          <Edit2 size={12} /> Edit
                        </button>
                        <button onClick={() => setResettingPasswordUser(u)} className="flex items-center gap-1.5 px-3 py-1.5 bg-fb-gray rounded-lg text-[10px] font-bold text-fb-textSecondary uppercase">
                          <KeyRound size={12} /> Password Reset
                        </button>
                      </>
                    )}
                    {canManageAccounts && (
                      <label className="flex items-center gap-2 px-3 py-1.5 bg-fb-gray rounded-lg cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => toggleUserSelection(u.uid)}
                          className="w-3 h-3 rounded border-fb-border text-fb-blue focus:ring-fb-blue"
                        />
                        <span className="text-[10px] font-bold text-fb-textSecondary uppercase">
                          {isViewArchive ? "Restore" : "Select"}
                        </span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredUsers.length === 0 && (
            <div className="py-16 text-center opacity-30">
              <div className="flex flex-col items-center">
                <Users size={32} className="mb-3" />
                <p className="font-black uppercase text-[10px] tracking-widest italic">No accounts found</p>
              </div>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-fb-border flex items-center justify-between bg-white">
            <p className="text-[10px] font-black uppercase text-fb-textSecondary opacity-60">
              Showing {Math.min(filteredUsers.length, (currentPage - 1) * itemsPerPage + 1)} to {Math.min(filteredUsers.length, currentPage * itemsPerPage)} of {filteredUsers.length} accounts
            </p>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`p-2 rounded-lg transition-all ${currentPage === 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-fb-gray text-fb-blue'}`}
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === page ? 'bg-fb-blue text-white shadow-md' : 'hover:bg-fb-gray text-fb-textSecondary'}`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className={`p-2 rounded-lg transition-all ${currentPage === totalPages ? 'opacity-30 cursor-not-allowed' : 'hover:bg-fb-gray text-fb-blue'}`}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </Card>
      {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSave={handleSaveUser} />}
      {isCreating && <EditUserModal isNew={true} user={{ role: 'student' }} onClose={() => setIsCreating(false)} onSave={handleCreateUser} />}
      {isCleaningUp && <CleanUpRecordsModal students={allUsers} onClose={() => setIsCleaningUp(false)} onSuccess={(msg) => setSuccessMsg(msg)} onError={(msg) => setErrorMsg(msg)} />}
      {isEnrolling && (
        <EnrollModal 
          selectedUsers={allUsers.filter(u => selectedToArchiveUsers.includes(u.uid))}
          onClose={() => setIsEnrolling(false)} 
          onEnroll={handleEnroll} 
        />
      )}
      {resettingPasswordUser && <PasswordResetModal user={resettingPasswordUser} onClose={() => setResettingPasswordUser(null)} />}
      {successMsg && <SuccessModal message={successMsg} onClose={() => setSuccessMsg(null)} />}
      {errorMsg && <ErrorModal message={errorMsg} onClose={() => setErrorMsg(null)} />}
    </div>
  );
};

const BulkUploadModal = ({ studentData, adminProfile, onClose }: { studentData: UserProfile[], adminProfile: UserProfile, onClose: () => void }) => {
  const [courses, setCourses] = useState([] as Course[]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filterYearLevel, setFilterYearLevel] = useState('All');
  const [filterSemester, setFilterSemester] = useState('All');
  const [filterSchoolYear, setFilterSchoolYear] = useState('All');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const schoolYears = Array.from(new Set(studentData.flatMap(s => [s.firstYearSchoolYear, s.secondYearSchoolYear]).filter(Boolean))) as string[];
  schoolYears.sort((a, b) => b.localeCompare(a));

  const enrolledStudentsList = studentData.filter(s => s.yearLevel === '1st Year' || s.yearLevel === '2nd Year');
  enrolledStudentsList.sort((a, b) => formatName(a).localeCompare(formatName(b)));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsStudentDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "courses"), (snapshot) => {
      const list: Course[] = [];
      snapshot.forEach(docSnap => {
        list.push({ ...docSnap.data(), id: docSnap.id } as Course);
      });
      setCourses(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "courses");
    });
    return () => unsub();
  }, []);

  const generateTemplate = () => {
    const headers = ["Student ID", "Student Name", "Year Level", "Semester", "Course ID", "Course Name", "Grade", "Incomplete (TRUE/FALSE)"];
    let csvContent = headers.join(",") + "\n";
    
    let enrolledStudents = studentData.filter(s => s.yearLevel === '1st Year' || s.yearLevel === '2nd Year');

    if (selectedStudents.length > 0) {
      enrolledStudents = enrolledStudents.filter(s => selectedStudents.includes(s.uid));
    }

    enrolledStudents.forEach(student => {
      let studentCourses = [];
      if (student.yearLevel === '2nd Year') {
        studentCourses = courses.filter(c => c.yearLevel === '1st Year' || c.yearLevel === '2nd Year');
      } else {
        studentCourses = courses.filter(c => c.yearLevel === student.yearLevel);
      }

      if (filterYearLevel !== 'All') {
        studentCourses = studentCourses.filter(c => c.yearLevel === filterYearLevel);
      }
      if (filterSemester !== 'All') {
        studentCourses = studentCourses.filter(c => c.semester === filterSemester);
      }
      if (filterSchoolYear !== 'All') {
        studentCourses = studentCourses.filter(c => {
          if (c.yearLevel === '1st Year') return student.firstYearSchoolYear === filterSchoolYear;
          if (c.yearLevel === '2nd Year') return student.secondYearSchoolYear === filterSchoolYear;
          return false;
        });
      }

      studentCourses.forEach(course => {
          const row = [
            `"${student.studentId || ''}"`,
            `"${formatName(student)}"`,
            `"${course.yearLevel || ''}"`,
            `"${course.semester || ''}"`,
            `"${course.id}"`,
            `"${course.name}"`,
            '', // Grade placeholder
            'FALSE' // Incomplete placeholder
          ];
          csvContent += row.join(",") + "\n";
      });
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `grades_template_${filterYearLevel.replace(' ', '_')}_${filterSemester.replace(' ', '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").filter(line => line.trim() !== "");
      if (lines.length <= 1) {
        alert("CSV file is empty or missing data.");
        return;
      }

      const rows = lines.slice(1);
      const updates: Record<string, { grades: Grade[], history: EditHistoryEntry[] }> = {};

      for (const row of rows) {
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < row.length; i++) {
          const char = row[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());

        if (values.length < 7) continue;

        const studentId = values[0];
        const studentName = values[1];
        const yearLevel = values[2] as any;
        const semester = values[3] as any;
        const courseId = values[4];
        const courseName = values[5];
        const gradeStr = values[6];
        const gradeValue = gradeStr === '' ? '' : Number(gradeStr);
        const isIncomplete = values[7] ? values[7].toUpperCase() === 'TRUE' : false;

        if (gradeValue !== '' && isNaN(gradeValue as number) && !isIncomplete) continue;
        if (gradeValue === '' && !isIncomplete) continue; // Skip if no grade and not incomplete

        // Try to find student by ID first, then by name if ID is empty
        let student = null;
        if (studentId) {
          student = studentData.find(s => s.studentId === studentId);
        }
        if (!student && studentName) {
          student = studentData.find(s => formatName(s).toLowerCase() === studentName.toLowerCase());
        }
        
        if (!student) continue;

        if (!updates[student.uid]) {
          updates[student.uid] = { 
            grades: [...(student.grades || [])], 
            history: [...(student.editHistory || [])] 
          };
        }

        const existingGradeIndex = updates[student.uid].grades.findIndex(g => g.id === courseId);
        const newGrade: Grade = {
          id: courseId,
          courseName: courseName,
          gradeValue: isIncomplete ? '' : gradeValue,
          isIncomplete: isIncomplete,
          dateReleased: new Date().toISOString().split('T')[0],
          yearLevel,
          semester
        };

        if (existingGradeIndex > -1) {
          updates[student.uid].grades[existingGradeIndex] = newGrade;
        } else {
          updates[student.uid].grades.push(newGrade);
        }

        updates[student.uid].history.push({
          id: `HIST-${Date.now()}-${Math.random()}`,
          editedBy: formatName(adminProfile) || adminProfile.email,
          action: `Bulk Upload: Updated grade for ${courseName}`,
          timestamp: new Date().toLocaleString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          details: `Grade: ${isIncomplete ? 'Incomplete' : gradeValue}`
        });
      }

      if (Object.keys(updates).length === 0) {
        alert("No valid grade updates found in the CSV. Make sure you entered grades or set Incomplete to TRUE.");
        return;
      }

      setIsProcessing(true);
      try {
        const promises = Object.entries(updates).map(([uid, data]) => 
          updateDoc(doc(db, "users", uid), { 
            grades: data.grades,
            editHistory: data.history
          })
        );
        await Promise.all(promises);
        alert("Bulk grades updated successfully.");
        onClose();
      } catch (err) {
        alert("Failed to update bulk grades.");
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsText(selectedFile);
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-fb-border p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div />
          <button onClick={onClose} className="p-2 hover:bg-fb-hover rounded-full transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-3 bg-fb-gray/20 p-4 rounded-2xl border border-fb-border">
            <h3 className="text-[10px] font-black text-fb-textPrimary uppercase tracking-widest flex items-center gap-2">
              <Filter size={14} /> Template Filters
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <select 
                value={filterYearLevel} 
                onChange={e => setFilterYearLevel(e.target.value)}
                className="w-full p-2.5 bg-white border border-fb-border rounded-xl text-xs font-medium text-fb-textPrimary focus:ring-2 focus:ring-fb-blue outline-none"
              >
                <option value="All">All Year Levels</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
              </select>
              <select 
                value={filterSemester} 
                onChange={e => setFilterSemester(e.target.value)}
                className="w-full p-2.5 bg-white border border-fb-border rounded-xl text-xs font-medium text-fb-textPrimary focus:ring-2 focus:ring-fb-blue outline-none"
              >
                <option value="All">All Semesters</option>
                <option value="1st Semester">1st Semester</option>
                <option value="2nd Semester">2nd Semester</option>
                <option value="3rd Semester">3rd Semester</option>
              </select>
              <select 
                value={filterSchoolYear} 
                onChange={e => setFilterSchoolYear(e.target.value)}
                className="w-full p-2.5 bg-white border border-fb-border rounded-xl text-xs font-medium text-fb-textPrimary focus:ring-2 focus:ring-fb-blue outline-none"
              >
                <option value="All">All School Years</option>
                {schoolYears.map(sy => <option key={sy} value={sy}>{sy}</option>)}
              </select>
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsStudentDropdownOpen(!isStudentDropdownOpen)}
                  className="w-full p-2.5 bg-white border border-fb-border rounded-xl text-xs font-medium text-fb-textPrimary focus:ring-2 focus:ring-fb-blue outline-none text-left flex justify-between items-center"
                >
                  <span className="truncate">
                    {selectedStudents.length === 0 
                      ? "All Students" 
                      : `${selectedStudents.length} Student${selectedStudents.length > 1 ? 's' : ''} Selected`}
                  </span>
                  <ChevronDown size={14} className="text-fb-textSecondary" />
                </button>
                {isStudentDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-fb-border rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                    <div 
                      className="p-2.5 text-xs font-medium text-fb-textPrimary hover:bg-fb-gray cursor-pointer flex items-center gap-2"
                      onClick={() => setSelectedStudents([])}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedStudents.length === 0 ? 'bg-fb-blue border-fb-blue text-white' : 'border-fb-border'}`}>
                        {selectedStudents.length === 0 && <Check size={12} />}
                      </div>
                      All Students
                    </div>
                    {enrolledStudentsList.map(s => (
                      <div 
                        key={s.uid}
                        className="p-2.5 text-xs font-medium text-fb-textPrimary hover:bg-fb-gray cursor-pointer flex items-center gap-2"
                        onClick={() => {
                          setSelectedStudents(prev => 
                            prev.includes(s.uid) ? prev.filter(id => id !== s.uid) : [...prev, s.uid]
                          );
                        }}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedStudents.includes(s.uid) ? 'bg-fb-blue border-fb-blue text-white' : 'border-fb-border'}`}>
                          {selectedStudents.includes(s.uid) && <Check size={12} />}
                        </div>
                        {formatName(s)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button 
              onClick={generateTemplate}
              className="w-full py-3 bg-fb-gray hover:bg-fb-hover text-fb-textPrimary rounded-xl font-black uppercase text-[10px] tracking-[0.2em] transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} /> Download Filtered Template
            </button>
          </div>

          <div className="p-6 bg-fb-gray/30 rounded-2xl border-2 border-dashed border-fb-border flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-white rounded-full shadow-sm text-fb-blue">
              <Plus size={32} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-fb-textPrimary">Upload CSV File</p>
              <p className="text-[10px] font-medium text-fb-textSecondary uppercase tracking-widest">Max file size: 5MB</p>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept=".csv" 
            />
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs font-bold text-fb-blue">{selectedFile.name}</p>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] text-fb-textSecondary hover:underline"
                >
                  Change File
                </button>
              </div>
            ) : (
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="px-6 py-2.5 bg-fb-blue text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center gap-2"
              >
                <Search size={14} />
                Select File
              </button>
            )}
          </div>

          <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertCircle size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Instructions</span>
            </div>
            <p className="text-[10px] font-medium text-amber-800 leading-relaxed">
              1. Download the template below.<br />
              2. Fill in the grade values and set Incomplete to TRUE or FALSE.<br />
              3. Save as CSV and upload here.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-4">
          {selectedFile && (
            <button 
              onClick={handleUpload}
              disabled={isProcessing}
              className="w-full py-4 bg-fb-blue text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
            >
              {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <Database size={16} />}
              {isProcessing ? 'Uploading...' : 'Upload Grades'}
            </button>
          )}
          <button 
            onClick={onClose} 
            className="w-full py-4 text-fb-textSecondary font-black uppercase text-[10px] tracking-[0.2em] hover:bg-fb-gray rounded-2xl transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const AttendanceTracker = ({ profile }: { profile: UserProfile }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecord>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [courseSearch, setCourseSearch] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [schoolYearFilter, setSchoolYearFilter] = useState('');
  const [isCourseDropdownOpen, setIsCourseDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCourseDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  useEffect(() => {
    const unsubCourses = onSnapshot(query(collection(db, "courses")), (snapshot) => {
      const list: Course[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Course;
        if (data.status !== 'archived') {
          list.push({ ...data, id: docSnap.id });
        }
      });
      setCourses(list);
    }, (error) => {
      console.error("Error fetching courses:", error);
    });
    
    const unsubStudents = onSnapshot(query(collection(db, "users"), where("role", "==", "student")), (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach(docSnap => {
        list.push({ ...docSnap.data() as UserProfile, uid: docSnap.id });
      });
      setStudents(list);
    }, (error) => {
      console.error("Error fetching students:", error);
    });

    return () => {
      unsubCourses();
      unsubStudents();
    };
  }, []);

  useEffect(() => {
    if (selectedCourse && selectedDate) {
      setLoading(true);
      const q = query(collection(db, "attendance"), where("courseId", "==", selectedCourse), where("date", "==", selectedDate));
      const unsub = onSnapshot(q, (snapshot) => {
        const records: Record<string, AttendanceRecord> = {};
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as AttendanceRecord;
          records[data.studentId] = { ...data, id: docSnap.id };
        });
        setAttendanceRecords(records);
        setLoading(false);
      }, (error) => {
        console.error("Error fetching attendance:", error);
        setLoading(false);
      });
      return () => unsub();
    } else {
      setAttendanceRecords({});
    }
  }, [selectedCourse, selectedDate]);

  const course = courses.find(c => c.id === selectedCourse);
  const enrolledStudents = useMemo(() => {
    if (!course) return [];
    const syField = course.yearLevel === '1st Year' ? 'firstYearSchoolYear' : 'secondYearSchoolYear';
    return students.filter(s => 
      s.yearLevel === course.yearLevel && s[syField as keyof UserProfile] === course.schoolYear
    );
  }, [course, students]);

  const handleRecordChange = (studentId: string, field: keyof AttendanceRecord, value: any) => {
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || { studentId, courseId: selectedCourse, date: selectedDate, status: 'present', isExcused: false, notes: '' }),
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    if (!selectedCourse || !selectedDate) return;
    setSaving(true);
    try {
      const finalRecords = enrolledStudents.map(student => {
        const existing = attendanceRecords[student.uid];
        return existing || {
          studentId: student.uid,
          courseId: selectedCourse,
          date: selectedDate,
          status: 'present',
          isExcused: false,
          notes: ''
        };
      });

      const promises = finalRecords.map((record: any) => {
        const docId = record.id || `${selectedCourse}_${selectedDate}_${record.studentId}`;
        const ref = doc(db, "attendance", docId);
        return setDoc(ref, {
          ...record,
          id: docId,
          courseId: selectedCourse,
          date: selectedDate,
          createdAt: record.createdAt || new Date().toISOString()
        }, { merge: true });
      });
      await Promise.all(promises);
      alert("Attendance saved successfully!");
    } catch (error: any) {
      alert("Error saving attendance: " + error.message);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-8 border border-fb-border shadow-sm">
        <h2 className="text-xl font-black italic uppercase text-fb-textPrimary mb-6 flex items-center gap-3"><CheckSquare className="text-fb-blue" size={24} /> Attendance Tracker</h2>
        
        <div className="space-y-4 mb-8 p-4 bg-fb-gray/50 rounded-2xl border border-fb-border">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">Filter Semester</label>
              <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)} className="w-full bg-white border border-fb-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-fb-blue transition-all appearance-none">
                <option value="">All Semesters</option>
                {Array.from(new Set(courses.map(c => c.semester))).filter(Boolean).sort().map(sem => (
                  <option key={sem} value={sem}>{sem}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">Filter School Year</label>
              <select value={schoolYearFilter} onChange={(e) => setSchoolYearFilter(e.target.value)} className="w-full bg-white border border-fb-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-fb-blue transition-all appearance-none">
                <option value="">All School Years</option>
                {Array.from(new Set(courses.map(c => c.schoolYear))).filter(Boolean).sort().reverse().map(sy => (
                  <option key={sy} value={sy}>{sy}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-fb-border">
            <div className="space-y-1.5" ref={dropdownRef}>
              <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">Select Course</label>
              <div className="relative">
                <div 
                  className="w-full bg-white border border-fb-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-fb-blue transition-all cursor-pointer flex justify-between items-center"
                  onClick={() => setIsCourseDropdownOpen(!isCourseDropdownOpen)}
                >
                  <span className={selectedCourse ? "text-fb-textPrimary" : "text-fb-textSecondary"}>
                    {selectedCourse ? (courses.find(c => c.id === selectedCourse)?.name + " (" + courses.find(c => c.id === selectedCourse)?.schoolYear + " - " + courses.find(c => c.id === selectedCourse)?.semester + ")") : "-- Choose Course --"}
                  </span>
                  <ChevronDown size={16} className={`text-fb-textSecondary transition-transform ${isCourseDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
                {isCourseDropdownOpen && (
                  <div className="absolute z-50 mt-2 w-full bg-white border border-fb-border rounded-xl shadow-xl overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-fb-border sticky top-0 bg-white">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-fb-textSecondary" size={16} />
                        <input 
                          type="text" 
                          placeholder="Search course name..." 
                          value={courseSearch} 
                          onChange={(e) => setCourseSearch(e.target.value)} 
                          className="w-full pl-9 pr-3 py-2 bg-fb-gray/50 border border-fb-border rounded-lg text-sm font-semibold outline-none focus:border-fb-blue transition-all" 
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2">
                      {courses.filter(c => {
                        const matchSearch = c.name.toLowerCase().includes(courseSearch.toLowerCase());
                        const matchSem = semesterFilter === '' || c.semester === semesterFilter;
                        const matchSY = schoolYearFilter === '' || c.schoolYear === schoolYearFilter;
                        return matchSearch && matchSem && matchSY;
                      }).length === 0 ? (
                        <div className="p-3 text-sm text-fb-textSecondary text-center italic">No courses found</div>
                      ) : (
                        courses.filter(c => {
                          const matchSearch = c.name.toLowerCase().includes(courseSearch.toLowerCase());
                          const matchSem = semesterFilter === '' || c.semester === semesterFilter;
                          const matchSY = schoolYearFilter === '' || c.schoolYear === schoolYearFilter;
                          return matchSearch && matchSem && matchSY;
                        }).map(c => (
                          <div 
                            key={c.id} 
                            onClick={() => {
                              setSelectedCourse(c.id);
                              setIsCourseDropdownOpen(false);
                            }}
                            className={`px-3 py-2 text-sm font-semibold rounded-lg cursor-pointer transition-all ${selectedCourse === c.id ? 'bg-fb-blue text-white' : 'hover:bg-fb-gray text-fb-textPrimary'}`}
                          >
                            {c.name} ({c.schoolYear} - {c.semester})
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">Select Date</label>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full bg-white border border-fb-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-fb-blue transition-all" />
            </div>
          </div>
        </div>



        {selectedCourse && selectedDate && (
          <div>
            <h3 className="text-xs font-black uppercase text-fb-textSecondary tracking-widest mb-4 border-b border-fb-border pb-2">Enrolled Students ({enrolledStudents.length})</h3>
            {loading ? (
              <div className="py-8 flex justify-center"><RefreshCw className="animate-spin text-fb-blue" size={24} /></div>
            ) : enrolledStudents.length === 0 ? (
              <div className="text-center py-12 bg-fb-gray rounded-2xl">
                <p className="text-xs font-bold text-fb-textSecondary uppercase tracking-widest">No students enrolled in this course.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {enrolledStudents.map(student => {
                  const record = attendanceRecords[student.uid] || { status: 'present', isExcused: false, notes: '' };
                  const isAbsent = record.status === 'absent';
                  
                  return (
                    <div key={student.uid} className="bg-fb-gray/50 border border-fb-border rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all">
                      <div className="flex-1">
                        <p className="font-black text-sm capitalize italic">{formatName(student)}</p>
                        <p className="text-[10px] font-bold text-fb-textSecondary uppercase tracking-wider">{student.studentId || 'No ID'}</p>
                      </div>
                      <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                        <div className="flex bg-white rounded-xl overflow-hidden border border-fb-border">
                          <button onClick={() => handleRecordChange(student.uid, 'status', 'present')} className={`px-6 py-2 text-xs font-black uppercase tracking-wider transition-all ${!isAbsent ? 'bg-emerald-100 text-emerald-700' : 'hover:bg-fb-gray text-fb-textSecondary'}`}>Present</button>
                          <button onClick={() => handleRecordChange(student.uid, 'status', 'absent')} className={`px-6 py-2 text-xs font-black uppercase tracking-wider transition-all ${isAbsent ? 'bg-rose-100 text-rose-700' : 'hover:bg-fb-gray text-fb-textSecondary'}`}>Absent</button>
                        </div>
                        {isAbsent && (
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={record.isExcused} onChange={(e) => handleRecordChange(student.uid, 'isExcused', e.target.checked)} className="w-4 h-4 text-fb-blue rounded focus:ring-fb-blue" />
                              <span className="text-[10px] font-black uppercase text-fb-textSecondary tracking-wider">Excused</span>
                            </label>
                            <input type="text" placeholder="Reason / Notes" value={record.notes || ''} onChange={(e) => handleRecordChange(student.uid, 'notes', e.target.value)} className="bg-white border border-fb-border rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus:border-fb-blue" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {enrolledStudents.length > 0 && (
              <div className="mt-8 flex justify-end">
                <button onClick={handleSave} disabled={saving} className="px-8 py-3 bg-fb-blue text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-xl shadow-fb-blue/20 hover:shadow-fb-blue/40 transition-all disabled:opacity-50 flex items-center gap-2">
                  {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                  <span>Save Attendance</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


const SubmitGrades = ({ adminProfile }: { adminProfile: UserProfile }) => {
  const [studentData, setStudentData] = useState([] as UserProfile[]);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [permissionError, setPermissionError] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [yearFilter, setYearFilter] = useState('All' as 'All' | '1st Year' | '2nd Year');
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [sortOrder, setSortOrder] = useState('none' as 'none' | 'asc' | 'desc');

  const toggleSort = () => {
    setSortOrder(prev => prev === 'none' ? 'asc' : prev === 'asc' ? 'desc' : 'none');
  };

  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "student"));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = [] as UserProfile[];
      snapshot.forEach((docSnap) => {
        const item = docSnap.data() as UserProfile;
        if (item && (formatName(item) || item.email)) {
          data.push({ ...item, uid: docSnap.id });
        }
      });
      setStudentData(data);
      setPermissionError(false);
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.warn("Permission denied for student database.");
        setPermissionError(true);
      }
      handleFirestoreError(error, OperationType.LIST, "users");
    });
    return () => unsub();
  }, []);

  if (permissionError) return <PermissionDeniedGate message="Insufficient permissions to load student database" />;

  const filteredStudents = studentData.filter(s => {
    const term = studentSearchTerm.toLowerCase();
    const matchesSearch = formatName(s).toLowerCase().includes(term) || (s.email || '').toLowerCase().includes(term);
    const matchesYear = yearFilter === 'All' || s.yearLevel === yearFilter;
    return matchesSearch && matchesYear;
  }).sort((a, b) => {
    const nameA = formatName(a).toLowerCase();
    const nameB = formatName(b).toLowerCase();
    if (sortOrder === 'asc') return nameA.localeCompare(nameB);
    if (sortOrder === 'desc') return nameB.localeCompare(nameA);
    return nameA.localeCompare(nameB);
  });

  return (
    <div className="space-y-8 pb-10">
      <Card noPadding>
        {/* Uniform Header Layout matching Course Page - 40/15/15/15/15 grid */}
        <div className="p-3 md:p-4 lg:p-5 flex flex-col md:flex-row gap-3 md:gap-4 border-b border-fb-border items-start">
          {/* Search Box - 40% */}
          <div className="w-full md:w-[40%] relative">
            <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-fb-textSecondary" size={14} />
            <input 
              type="text" 
              placeholder="Search student registry..." 
              className="w-full h-full bg-fb-gray border border-transparent rounded-full pl-9 md:pl-10 pr-9 md:pr-10 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[10px] md:text-xs font-semibold transition-all" 
              value={studentSearchTerm} 
              onChange={(e) => setStudentSearchTerm(e.target.value)} 
            />
            {studentSearchTerm && (
              <button 
                onClick={() => setStudentSearchTerm('')}
                className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white rounded-full text-fb-textSecondary transition-all"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Year Filter - 15% */}
          <div className="w-full md:w-[15%] relative">
            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value as any)} className="w-full h-full bg-fb-gray border border-transparent rounded-full px-3 md:px-4 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[9px] md:text-[10px] font-bold transition-all appearance-none cursor-pointer">
              <option value="All">All Years</option>
              <option value="1st Year">1st Year</option>
              <option value="2nd Year">2nd Year</option>
            </select>
          </div>

          {/* Filler Spacer - 15% */}
          <div className="hidden md:block md:w-[15%]"></div>
          
          {/* Filler Spacer - 15% */}
          <div className="hidden md:block md:w-[15%]"></div>

          {/* Action Column - 15% */}
          {adminProfile.role === 'admin' ? (
            <div className="w-full md:w-[15%] flex flex-col gap-2">
              <button 
                onClick={() => setIsBulkUploading(true)}
                className="w-full bg-fb-blue text-white py-1.5 md:py-2 rounded-full font-bold text-[9px] md:text-[10px] shadow-md hover:bg-blue-600 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <Database size={14} /><span>Upload Grades</span>
              </button>
            </div>
          ) : (
            <div className="hidden md:block md:w-[15%]"></div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-fb-gray/50 border-b text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">
              <tr>
                <th className="px-8 py-5">
                  <div className="flex items-center gap-2">
                    <span>Student</span>
                    <button onClick={toggleSort} className={`p-1 rounded transition-all ${sortOrder !== 'none' ? 'text-fb-blue' : 'hover:bg-fb-gray'}`}>
                      {sortOrder === 'none' ? <ArrowUpDown size={12}/> : sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>}
                    </button>
                  </div>
                </th>
                <th className="px-8 py-5">Batch / Year</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredStudents.map((student) => (
                <tr key={student.uid} className="hover:bg-fb-hover transition-all">
                  <td className="px-8 py-5 font-bold capitalize italic text-sm">{formatName(student)}</td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-1 items-start">
                      <span className="px-4 py-1.5 bg-fb-gray rounded-xl text-[10px] font-black uppercase border tracking-widest shadow-sm">
                        {student.yearLevel || 'N/A'}
                      </span>
                      {student.batchName && (
                        <span className="text-[10px] font-bold text-fb-textSecondary capitalize italic">
                          Batch: {student.batchName}
                        </span>
                      )}
                      {student.schoolType && (
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                          student.schoolType === 'Day School' 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                            : 'bg-indigo-50 text-indigo-600 border-indigo-200'
                        }`}>
                          {student.schoolType}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button onClick={() => setSelectedStudent(student)} className="px-3 md:px-4 py-1.5 md:py-2 bg-fb-blue/5 text-fb-blue hover:bg-fb-blue hover:text-white rounded-xl font-black uppercase text-[9px] md:text-[10px] tracking-widest transition-all">Records <ChevronRight className="inline" size={12} /></button>
                  </td>
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-24 text-center opacity-30">
                    <div className="flex flex-col items-center">
                      <GraduationCap size={48} className="mb-4" />
                      <p className="font-black uppercase text-[10px] tracking-widest italic">No student records found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile List View */}
        <div className="md:hidden flex flex-col divide-y">
          {filteredStudents.map((student) => (
            <div key={student.uid} className="p-4 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                  <p className="font-bold text-fb-textPrimary text-sm capitalize italic">{formatName(student)}</p>
                  {student.studentId && <p className="text-[10px] font-black uppercase text-fb-blue tracking-tighter">ID: {student.studentId}</p>}
                  {student.batchName && <p className="text-[10px] font-bold text-fb-textSecondary capitalize italic">Batch: {student.batchName}</p>}
                  {student.schoolType && (
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border self-start mt-0.5 ${
                      student.schoolType === 'Day School' 
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                        : 'bg-indigo-50 text-indigo-600 border-indigo-200'
                    }`}>
                      {student.schoolType}
                    </span>
                  )}
                </div>
                <span className="px-3 py-1 bg-fb-gray rounded-xl text-[10px] font-black uppercase border tracking-widest shadow-sm">{student.yearLevel || 'N/A'}</span>
              </div>
              
              <div className="flex items-center justify-end pt-2 border-t border-dashed border-fb-border/50">
                <button onClick={() => setSelectedStudent(student)} className="flex items-center gap-1.5 px-3 py-1.5 bg-fb-blue/5 text-fb-blue hover:bg-fb-blue hover:text-white rounded-xl font-black uppercase text-[9px] md:text-[10px] tracking-widest transition-all">
                  Records <ChevronRight size={10} />
                </button>
              </div>
            </div>
          ))}
          {filteredStudents.length === 0 && (
            <div className="py-16 text-center opacity-30">
              <div className="flex flex-col items-center">
                <GraduationCap size={32} className="mb-3" />
                <p className="font-black uppercase text-[10px] tracking-widest italic">No student records found</p>
              </div>
            </div>
          )}
        </div>
      </Card>
      {selectedStudent && <GradesModal student={selectedStudent} adminProfile={adminProfile} onClose={() => setSelectedStudent(null)} />}
      {isBulkUploading && <BulkUploadModal studentData={studentData} adminProfile={adminProfile} onClose={() => setIsBulkUploading(false)} />}
    </div>
  );
};

// --- Course Management Components ---

const CalendarDayModal = ({ 
  data, 
  onClose,
  onEditCourse
}: { 
  data: { date: string, courses: Course[] } | null, 
  onClose: () => void,
  onEditCourse?: (course: Course) => void
}) => {
  if (!data) return null;

  const formatProfessorName = (name: string) => {
    if (!name) return 'N/A';
    if (name.includes(',')) {
      const parts = name.split(',');
      return `${parts[1].trim()} ${parts[0].trim()}`;
    }
    return name;
  };

  const [courseNotes, setCourseNotes] = useState<{[courseId: string]: any[]}>({});
  const [notesLoading, setNotesLoading] = useState(false);

  useEffect(() => {
    if (!data || data.courses.length === 0) return;
    setNotesLoading(true);
    const courseIds = data.courses.map(c => c.id);
    const q = query(collection(db, "uploaded_files"), where("category", "==", "notes"));
    const unsub = onSnapshot(q, (snapshot) => {
      const notesMap: {[courseId: string]: any[]} = {};
      snapshot.forEach(docSnap => {
        const file = docSnap.data();
        if (courseIds.includes(file.courseId)) {
          if (!notesMap[file.courseId]) {
            notesMap[file.courseId] = [];
          }
          notesMap[file.courseId].push({ ...file, id: docSnap.id });
        }
      });
      setCourseNotes(notesMap);
      setNotesLoading(false);
    }, (error) => {
      console.error("Error fetching notes for calendar modal:", error);
      setNotesLoading(false);
      handleFirestoreError(error, OperationType.LIST, "uploaded_files");
    });

    return () => unsub();
  }, [data]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-fb-textPrimary/40 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden transform transition-all border border-fb-border">
        <div className="p-8 border-b bg-[#F0F2F5]/40 flex items-center justify-between">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-fb-blue italic mb-1">Academic Registry</h3>
            <h2 className="text-2xl font-black text-fb-textPrimary uppercase italic tracking-tighter">
              {new Date(data.date).toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}
            </h2>
          </div>
          <button onClick={onClose} className="p-3 bg-white hover:bg-fb-gray border border-fb-border rounded-full transition-all text-fb-textPrimary shadow-sm">
            <X size={20} />
          </button>
        </div>
        <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-4">
          {data.courses.length === 0 ? (
            <div className="py-16 text-center opacity-30">
              <p className="font-black uppercase text-[10px] tracking-widest italic">No classes scheduled for this date</p>
            </div>
          ) : (
            data.courses.map(c => (
              <div key={c.id} className="p-6 rounded-[2rem] bg-fb-gray/50 border border-fb-border hover:border-fb-blue/20 transition-all group hover:bg-white hover:shadow-xl hover:shadow-fb-blue/5">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-4">
                  <div className="space-y-1 min-w-0 flex-1">
                    <h4 className="font-black text-fb-textPrimary uppercase italic tracking-tight text-lg leading-none break-words">{c.name}</h4>
                    <p className="text-[9px] font-black text-fb-blue uppercase tracking-widest opacity-60 break-all">Course Reference: {c.id}</p>
                  </div>
                  <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shrink-0 self-start ${c.yearLevel === '1st Year' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                    {c.yearLevel}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                   <div className="flex items-center gap-3 text-xs font-bold text-fb-textSecondary">
                      <div className="p-2 bg-white rounded-xl shadow-sm"><Clock size={16} className="text-fb-blue" /></div>
                      <div className="flex flex-col">
                        <span className="text-[8px] uppercase opacity-40">Schedule</span>
                        <span>{c.startTime} - {c.endTime}</span>
                      </div>
                   </div>
                   <div className="flex items-center gap-3 text-xs font-bold text-fb-textSecondary">
                      <div className="p-2 bg-white rounded-xl shadow-sm"><UserIcon size={16} className="text-fb-blue" /></div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[8px] uppercase opacity-40">Instructor</span>
                        <span className="italic capitalize break-words">{formatProfessorName(c.professor)}</span>
                      </div>
                   </div>
                </div>

                {/* Notes & Materials Download Section */}
                <div className="mt-4 pt-4 border-t border-fb-border/40 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-fb-blue italic">
                    <FileText size={12} />
                    <span>Shared Class Notes</span>
                  </div>
                  {notesLoading ? (
                    <div className="flex justify-center py-2"><RefreshCw className="animate-spin text-fb-blue" size={14} /></div>
                  ) : !courseNotes[c.id] || courseNotes[c.id].length === 0 ? (
                    <p className="text-[10px] font-semibold text-fb-textSecondary opacity-60 italic pl-1">No shared notes available for this course.</p>
                  ) : (
                    <div className="space-y-2">
                      {courseNotes[c.id].map(file => (
                        <div key={file.id} className="flex justify-between items-center bg-white p-3 rounded-2xl border border-fb-border/60 hover:border-fb-blue/20 hover:shadow-sm transition-all">
                          <span className="text-[11px] font-bold text-fb-textPrimary truncate max-w-[160px] md:max-w-[200px]" title={file.fileName}>{file.fileName}</span>
                          <a 
                            href={file.fileData}
                            download={file.fileName}
                            className="flex items-center gap-1 py-2 px-3 bg-fb-blue hover:bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                          >
                            <Download size={10} />
                            <span>Download</span>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-fb-border/40 mt-4">
                  {c.isRecurring ? (
                    <div className="flex items-center gap-1.5 text-[9px] font-black text-fb-blue uppercase tracking-widest italic bg-fb-blue/5 px-3 py-1.5 rounded-full border border-fb-blue/10">
                      <Repeat size={12} /> <span>{c.frequency}</span>
                    </div>
                  ) : <div />}
                  
                  {onEditCourse && (
                    <div className="flex flex-col items-center gap-1 group/btn">
                      <button 
                        onClick={() => { onClose(); onEditCourse(c); }}
                        className="p-2.5 bg-white text-fb-textSecondary hover:bg-fb-blue hover:text-white rounded-xl transition-all shadow-sm border border-fb-border"
                      >
                        <Edit2 size={16} />
                      </button>
                      <span className="text-[8px] font-black uppercase text-fb-textSecondary opacity-60">Edit</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-6 border-t bg-fb-gray/10 flex justify-end">
          <button onClick={onClose} className="px-12 py-4 bg-white hover:bg-fb-hover text-fb-textPrimary border-2 border-fb-border rounded-2xl font-black uppercase text-xs tracking-widest shadow-sm transition-all active:scale-95">Dismiss</button>
        </div>
      </div>
    </div>
  );
};

const CourseCalendar = ({ courses, onDayClick }: { courses: Course[], onDayClick: (date: string, courses: Course[]) => void }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);
  const padding = Array.from({ length: firstDayOfMonth(year, month) }, (_, i) => null);

  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  const getCoursesForDay = (day: number) => {
    const d = new Date(year, month, day);
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeekShort = d.toLocaleString('default', { weekday: 'short' });

    return courses.filter(c => {
      if (!c.isRecurring) {
        return c.date === dateStr;
      } else {
        return c.daysOfWeek?.includes(dayOfWeekShort);
      }
    });
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-xl border border-fb-border overflow-hidden animate-in fade-in duration-500">
      <div className="bg-fb-blue p-4 md:p-8 flex items-center justify-between text-white">
        <div>
          <h3 className="text-lg md:text-2xl font-black uppercase italic tracking-tighter leading-none">{monthName}</h3>
          <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.4em] opacity-40 mt-1">{year}</p>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          <button onClick={prevMonth} className="p-2 md:p-3 hover:bg-white/20 rounded-full transition-all active:scale-90"><ChevronLeft size={20}/></button>
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 md:px-5 md:py-2 bg-white text-fb-blue rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-fb-gray transition-all shadow-lg active:scale-95">Today</button>
          <button onClick={nextMonth} className="p-2 md:p-3 hover:bg-white/20 rounded-full transition-all active:scale-90"><ChevronRight size={20}/></button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b bg-fb-gray/20">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="py-5 text-center text-[10px] font-black uppercase text-fb-textSecondary tracking-[0.2em] border-r last:border-r-0 border-fb-border/50">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 bg-white">
        {[...padding, ...days].map((day, idx) => {
          const coursesForDay = day ? getCoursesForDay(day) : [];
          const dateString = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : "";
          const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
          
          return (
            <div 
              key={idx} 
              onClick={() => day && onDayClick(dateString, coursesForDay)}
              className={`aspect-[3/4] md:aspect-auto md:min-h-[160px] border-r border-b p-1 md:p-3 transition-all relative group ${!day ? 'bg-fb-gray/20' : 'hover:bg-fb-blue/[0.02] cursor-pointer'} last:border-r-0 border-fb-border`}
            >
              {day && (
                <>
                  <div className="flex justify-between items-start mb-1 md:mb-3">
                    <span className={`inline-block w-6 h-6 md:w-8 md:h-8 leading-6 md:leading-8 text-center rounded-full text-xs md:text-sm font-black transition-all group-hover:scale-110 ${isToday ? 'bg-fb-blue text-white shadow-xl shadow-fb-blue/30' : 'text-fb-textPrimary'}`}>{day}</span>
                    {coursesForDay.length > 0 && <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-fb-blue animate-pulse shadow-[0_0_8px_rgba(24,119,242,0.8)]" />}
                  </div>
                  <div className="space-y-1 md:space-y-1.5 overflow-hidden max-h-[60%] md:max-h-[100px]">
                    {coursesForDay.slice(0, 3).map(c => (
                      <div key={c.id} className={`px-1.5 md:px-2.5 py-1 md:py-1.5 rounded-lg md:rounded-xl border-l-[2px] md:border-l-[3px] shadow-sm text-[6px] md:text-[8px] font-bold truncate transition-transform hover:translate-x-1 ${c.yearLevel === '1st Year' ? 'bg-blue-50 border-blue-400 text-blue-800' : 'bg-emerald-50 border-emerald-400 text-emerald-800'}`}>
                        <p className="uppercase italic leading-none">{c.name}</p>
                      </div>
                    ))}
                    {coursesForDay.length > 3 && (
                      <p className="text-[7px] md:text-[9px] font-black text-fb-textSecondary uppercase italic ml-1 md:ml-1.5 mt-1 md:mt-2 opacity-50">+{coursesForDay.length - 3}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};


const TeacherUploadFilesView = ({ profile }: { profile: UserProfile }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [category, setCategory] = useState<'notes' | 'exams' | 'activity'>('notes');
  const [fileName, setFileName] = useState('');
  const [fileData, setFileData] = useState<string>('');
  const [fileType, setFileType] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isViewTrash, setIsViewTrash] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    variant: 'info',
    onConfirm: () => {}
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "courses"), (snapshot) => {
      const list: Course[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Course;
        if (data.status !== 'archived' && (data.instructorId === profile.uid || data.professor === formatName(profile))) {
          list.push({ ...data, id: docSnap.id });
        }
      });
      setCourses(list);
      setCoursesLoading(false);
      if (list.length > 0 && !selectedCourseId) {
        setSelectedCourseId(list[0].id);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "courses");
    });
    return () => unsub();
  }, [profile.uid, selectedCourseId]);

  useEffect(() => {
    const q = query(collection(db, "uploaded_files"), where("teacherUid", "==", profile.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        list.push({ ...data, id: docSnap.id });
      });
      list.sort((a, b) => {
        const t1 = a.createdAt?.seconds || 0;
        const t2 = b.createdAt?.seconds || 0;
        return t2 - t1;
      });
      setUploadedFiles(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "uploaded_files");
    });
    return () => unsub();
  }, [profile.uid]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (file.size > 800 * 1024) {
      setErrorMsg("File size must be under 800KB for secure portal storage.");
      return;
    }
    setFileName(file.name);
    setFileType(file.type);
    
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      if (uploadEvent.target?.result) {
        setFileData(uploadEvent.target.result as string);
      }
    };
    reader.onerror = () => {
      setErrorMsg("Failed to read file.");
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedCourseId) {
      setErrorMsg("Please select a course.");
      return;
    }
    if (!fileData) {
      setErrorMsg("Please upload a file.");
      return;
    }
    if ((category === 'exams' || category === 'activity') && !eventDate) {
      setErrorMsg("Please specify the date for the activity or exam.");
      return;
    }

    setLoading(true);
    try {
      const course = courses.find(c => c.id === selectedCourseId);
      const courseName = course ? course.name : 'Unknown Course';

      const fileRef = doc(collection(db, "uploaded_files"));
      const newFilePayload: any = {
        id: fileRef.id,
        courseId: selectedCourseId,
        courseName,
        teacherName: formatName(profile),
        teacherUid: profile.uid,
        category,
        fileName,
        fileData,
        fileType,
        createdAt: Timestamp.now()
      };

      if (category === 'exams' || category === 'activity') {
        newFilePayload.eventDate = eventDate;
        if (instructions.trim()) {
          newFilePayload.instructions = instructions.trim();
        }
      }

      await setDoc(fileRef, newFilePayload);
      setSuccessMsg(`File "${fileName}" successfully uploaded under category "${category === 'notes' ? 'Notes' : category === 'exams' ? 'Exam' : 'Activity'}".`);
      
      setFileName('');
      setFileData('');
      setFileType('');
      setEventDate('');
      setInstructions('');
    } catch (err: any) {
      console.error("Upload error:", err);
      setErrorMsg("Failed to upload file to the database: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = (fileId: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Archive File?",
      message: `Are you sure you want to archive "${name}"? This will move it to the archive folder.`,
      confirmText: "Archive",
      variant: 'warning',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, "uploaded_files", fileId), { archived: true });
          setSuccessMsg(`File "${name}" has been successfully moved to the archive folder.`);
        } catch (err: any) {
          console.error("Archive error:", err);
          setErrorMsg("Failed to archive file: " + err.message);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleRestore = (fileId: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Restore File?",
      message: `Are you sure you want to restore "${name}" from the archive folder?`,
      confirmText: "Restore",
      variant: 'info',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, "uploaded_files", fileId), { archived: false });
          setSuccessMsg(`File "${name}" has been restored to active list.`);
        } catch (err: any) {
          console.error("Restore error:", err);
          setErrorMsg("Failed to restore file: " + err.message);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handlePermanentDelete = (fileId: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Permanently Delete?",
      message: `Are you sure you want to PERMANENTLY delete "${name}" from the database? This action cannot be undone.`,
      confirmText: "Delete",
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "uploaded_files", fileId));
          setSuccessMsg(`File "${name}" has been permanently deleted from the database.`);
        } catch (err: any) {
          console.error("Delete error:", err);
          setErrorMsg("Failed to permanently delete file: " + err.message);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const displayedFiles = useMemo(() => {
    return uploadedFiles.filter(file => isViewTrash ? !!file.archived : !file.archived);
  }, [uploadedFiles, isViewTrash]);

  return (
    <div className="space-y-10 pb-10">
      <div>
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-fb-blue italic mb-1">Teacher Portal</h3>
        <h2 className="text-3xl font-black text-fb-textPrimary uppercase italic tracking-tighter">Upload Course Files</h2>
        <p className="text-fb-textSecondary text-sm font-medium">Upload notes for students, or activities and exams for administrative notification.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white p-6 rounded-[2.5rem] border border-fb-border shadow-xl space-y-6">
          <h3 className="text-lg font-black text-fb-textPrimary uppercase italic tracking-tight">New Upload</h3>
          {errorMsg && <div className="p-4 bg-rose-50 text-rose-700 rounded-2xl text-xs font-bold border border-rose-100">{errorMsg}</div>}
          {successMsg && <div className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl text-xs font-bold border border-emerald-100">{successMsg}</div>}

          {coursesLoading ? (
            <div className="py-10 text-center"><RefreshCw className="animate-spin text-fb-blue mx-auto" size={24} /></div>
          ) : courses.length === 0 ? (
            <div className="p-4 bg-amber-50 text-amber-700 rounded-2xl text-xs font-bold border border-amber-100">
              You are not assigned as an instructor to any active courses. You must be assigned to a course to upload files.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary ml-1">Assigned Course</label>
                <select 
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full px-4 py-3 border border-fb-border rounded-xl focus:border-fb-blue bg-fb-gray/30 text-sm font-semibold outline-none transition-all"
                >
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.yearLevel})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary ml-1">Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['notes', 'exams', 'activity'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setCategory(cat);
                        setErrorMsg(null);
                      }}
                      className={`py-2 px-3 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${category === cat ? 'bg-fb-blue text-white border-fb-blue shadow-md' : 'bg-white hover:bg-fb-gray border-fb-border text-fb-textSecondary'}`}
                    >
                      {cat === 'notes' ? 'Notes' : cat === 'exams' ? 'Exam' : 'Activity'}
                    </button>
                  ))}
                </div>
              </div>

              {(category === 'exams' || category === 'activity') && (
                <div className="space-y-4 animate-in slide-in-from-top duration-200">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary ml-1">Event Date</label>
                    <input 
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="w-full px-4 py-3 border border-fb-border rounded-xl focus:border-fb-blue bg-fb-gray/30 text-sm font-semibold outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary ml-1">Instructions / Notes (Optional)</label>
                    <textarea 
                      placeholder="Enter specific instructions or notes for students/administrators..."
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border border-fb-border rounded-xl focus:border-fb-blue bg-fb-gray/30 text-xs font-semibold outline-none transition-all resize-none custom-scrollbar"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary ml-1">Upload File</label>
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${dragActive ? 'border-fb-blue bg-fb-blue/5' : 'border-fb-border hover:border-fb-blue/40 bg-fb-gray/10'}`}
                  onClick={() => document.getElementById('file-upload-input')?.click()}
                >
                  <input 
                    id="file-upload-input"
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="flex flex-col items-center space-y-2">
                    <div className="p-3 bg-white rounded-full border border-fb-border shadow-sm text-fb-blue">
                      <Upload size={20} />
                    </div>
                    {fileName ? (
                      <div className="space-y-1 max-w-full">
                        <p className="text-xs font-bold text-fb-textPrimary truncate">{fileName}</p>
                        <p className="text-[8px] font-black uppercase text-fb-blue">Click or drag to replace</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-fb-textPrimary">Drag & drop files here</p>
                        <p className="text-[9px] font-black text-fb-textSecondary uppercase opacity-60">or click to browse</p>
                        <p className="text-[8px] text-fb-textSecondary opacity-40">Max 800KB</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !fileData}
                className="w-full py-4 bg-fb-blue text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-600 transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="animate-spin" size={16} /> : <Upload size={16} />}
                <span>{loading ? 'Uploading...' : 'Submit Document'}</span>
              </button>
            </form>
          )}
        </div>

        <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-[2.5rem] border border-fb-border shadow-xl space-y-6 flex flex-col">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="text-lg font-black text-fb-textPrimary uppercase italic tracking-tight">
              {isViewTrash ? 'Archived Materials' : 'Your Uploaded Materials'}
            </h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsViewTrash(!isViewTrash)}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 border ${
                  isViewTrash 
                    ? 'bg-amber-50 text-amber-600 border-amber-200 shadow-sm' 
                    : 'bg-white text-fb-textSecondary hover:bg-fb-gray border-fb-border'
                }`}
              >
                <Archive size={12} />
                <span>{isViewTrash ? 'Active Files' : 'Archive Folder'}</span>
              </button>
              <span className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-fb-gray border border-fb-border text-fb-textSecondary shadow-sm">
                {displayedFiles.length} {isViewTrash ? 'Archived' : 'Active'}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[500px] space-y-4 pr-1">
            {displayedFiles.length === 0 ? (
              <div className="py-24 text-center text-fb-textSecondary/40 flex flex-col items-center justify-center space-y-3">
                <FileText size={48} className="stroke-[1.5]" />
                <p className="font-black uppercase text-[10px] tracking-widest italic">
                  {isViewTrash ? 'Archive Folder is Empty' : 'No files uploaded yet'}
                </p>
              </div>
            ) : (
              displayedFiles.map(file => (
                <div key={file.id} className="p-5 rounded-2xl bg-fb-gray/30 border border-fb-border/60 hover:bg-white hover:shadow-lg transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-1 min-w-0 flex-1 md:max-w-md">
                    <div className="flex items-center gap-2 min-w-0 w-full">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shrink-0 ${file.category === 'notes' ? 'bg-blue-50 text-blue-600 border border-blue-100' : file.category === 'exams' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                        {file.category === 'notes' ? 'Notes' : file.category === 'exams' ? 'Exam' : 'Activity'}
                      </span>
                      <span className="text-[10px] font-black text-fb-textSecondary truncate min-w-0 flex-1">{file.courseName}</span>
                    </div>
                    <h4 className="font-bold text-fb-textPrimary text-sm break-all whitespace-normal">{file.fileName}</h4>
                    <p className="text-[9px] text-fb-textSecondary/60 font-semibold">
                      Uploaded on: {file.createdAt ? new Date(file.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                    </p>
                    {(file.category === 'exams' || file.category === 'activity') && (
                      <div className="space-y-2 mt-2">
                        <div className="flex items-center gap-1.5 text-sm font-black text-fb-blue uppercase tracking-wider bg-fb-blue/5 px-3 py-1.5 rounded-full border border-fb-blue/10 w-fit">
                          <Clock size={14} /> <span>Event: {file.eventDate}{file.eventTime ? ` @ ${file.eventTime}` : ''}</span>
                        </div>
                        {file.instructions && (
                          <div className="text-sm text-fb-textSecondary bg-white/70 p-3 rounded-xl border border-fb-border/40 italic font-medium whitespace-pre-wrap max-w-sm md:max-w-md">
                            <span className="text-[10px] font-black uppercase tracking-wider block text-fb-blue not-italic mb-1">Instructions:</span>
                            {file.instructions}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto">
                    <a 
                      href={file.fileData}
                      download={file.fileName}
                      className="p-2.5 bg-white text-fb-blue hover:bg-fb-blue hover:text-white rounded-xl border border-fb-border transition-all shadow-sm flex items-center justify-center"
                      title="Download"
                    >
                      <Download size={14} />
                    </a>
                    {!isViewTrash ? (
                      <button 
                        onClick={() => handleArchive(file.id, file.fileName)}
                        className="p-2.5 bg-white text-amber-600 hover:bg-amber-50 rounded-xl border border-fb-border hover:border-amber-200 transition-all shadow-sm flex items-center justify-center"
                        title="Archive"
                      >
                        <Archive size={14} />
                      </button>
                    ) : (
                      <>
                        <button 
                          onClick={() => handleRestore(file.id, file.fileName)}
                          className="p-2.5 bg-white text-emerald-600 hover:bg-emerald-50 rounded-xl border border-fb-border hover:border-emerald-200 transition-all shadow-sm flex items-center justify-center"
                          title="Restore"
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button 
                          onClick={() => handlePermanentDelete(file.id, file.fileName)}
                          className="p-2.5 bg-white text-rose-600 hover:bg-rose-50 rounded-xl border border-fb-border hover:border-rose-200 transition-all shadow-sm flex items-center justify-center"
                          title="Permanently Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};


const TeacherGradesView = ({ profile }: { profile: UserProfile }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [courseFilter, setCourseFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');
  const [attendanceRecords, setAttendanceRecords] = useState([] as any[]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({ gradeValue: '' as number | string, isIncomplete: false });
  const [loading, setLoading] = useState(false);
  const [selectedStudentForProfile, setSelectedStudentForProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const unsubAttendance = onSnapshot(collection(db, "attendance"), (snapshot) => {
      const list = [] as any[];
      snapshot.forEach(docSnap => {
        list.push({ ...docSnap.data(), id: docSnap.id });
      });
      setAttendanceRecords(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "attendance");
    });

    const unsubCourses = onSnapshot(collection(db, "courses"), (snapshot) => {
      const list: Course[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Course;
        if (data.status !== 'archived' && (data.instructorId === profile.uid || data.professor === formatName(profile))) {
          list.push({ ...data, id: docSnap.id });
        }
      });
      setCourses(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "courses");
    });
    
    const q = query(collection(db, "users"), where("role", "==", "student"));
    const unsubStudents = onSnapshot(q, (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach(docSnap => {
        list.push({ ...docSnap.data() as UserProfile, uid: docSnap.id });
      });
      setStudents(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "users");
    });

    return () => {
      unsubAttendance();
      unsubCourses();
      unsubStudents();
    };
  }, [profile.uid, profile]);

  const rows: { student: UserProfile, course: Course, grade: any }[] = [];
  courses.forEach(course => {
    const syField = course.yearLevel === '1st Year' ? 'firstYearSchoolYear' : 'secondYearSchoolYear';
    const enrolledStudents = students.filter(s => 
      s.yearLevel === course.yearLevel && s[syField as keyof UserProfile] === course.schoolYear
    );
    enrolledStudents.forEach(student => {
      const grade = (student.grades || []).find((g: any) => g.id === course.id);
      rows.push({ student, course, grade });
    });
  });

  const filteredRows = rows.filter(row => {
    const matchSearch = formatName(row.student).toLowerCase().includes(searchTerm.toLowerCase());
    const matchCourse = courseFilter === 'All' || row.course.id === courseFilter;
    const matchYear = yearFilter === 'All' || row.course.yearLevel === yearFilter;
    return matchSearch && matchCourse && matchYear;
  });

  const getStatus = (gradeValue: number | '', isIncomplete: boolean) => {
    if (isIncomplete) return { label: 'Incomplete', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    if (gradeValue === '') return { label: 'Pending', color: 'bg-fb-gray text-fb-textSecondary' };
    if (gradeValue >= 75) return { label: `Passed - ${gradeValue}`, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    return { label: `Failed - ${gradeValue}`, color: 'bg-rose-100 text-rose-700 border-rose-200' };
  };

  const handleUpdateGrade = async (studentId: string, courseId: string, courseName: string, yearLevel: string, semester: string) => {
    if (editFormData.gradeValue === '' && !editFormData.isIncomplete) {
      alert("Please enter a valid grade or mark as incomplete.");
      return;
    }
    setLoading(true);
    try {
      const student = students.find(s => s.uid === studentId);
      if (!student) return;
      
      const studentRef = doc(db, "users", studentId);
      let updatedGrades = [...(student.grades || [])];
      const existingIndex = updatedGrades.findIndex(g => g.id === courseId);
      
      const newGradeData = {
        id: courseId,
        courseName,
        yearLevel,
        semester,
        gradeValue: editFormData.isIncomplete ? '' : Number(editFormData.gradeValue),
        isIncomplete: editFormData.isIncomplete,
        updatedAt: Timestamp.now()
      };
      
      if (existingIndex >= 0) {
        updatedGrades[existingIndex] = newGradeData;
      } else {
        updatedGrades.push(newGradeData);
      }

      // Record history
      const historyEntry: EditHistoryEntry = {
        id: `HIST-${Date.now()}`,
        editedBy: formatName(profile) || profile.email,
        action: `Updated grade for ${courseName}`,
        timestamp: new Date().toLocaleString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        details: `Grade: ${editFormData.isIncomplete ? 'Incomplete' : editFormData.gradeValue}`
      };

      const existingHistory = [...(student.editHistory || [])];
      existingHistory.push(historyEntry);
      
      await updateDoc(studentRef, { 
        grades: updatedGrades,
        editHistory: existingHistory
      });
      setEditingId(null);
    } catch (err: any) {
      console.error("Error updating grade:", err);
      alert("Failed to update grade. " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-fb-gray relative">
      <div className="flex items-center justify-between px-8 md:px-12 py-8 bg-white border-b border-fb-border sticky top-0 z-20 shadow-sm">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-black text-fb-textPrimary italic uppercase tracking-tighter flex items-center gap-3">
            <GraduationCap className="text-fb-blue" size={28} /> Grades
          </h2>
          <p className="text-fb-textSecondary text-xs font-bold capitalize tracking-tight">Manage your assigned students</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-fb-textSecondary" size={16} />
              <input 
                type="text" 
                placeholder="Search students..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border-2 border-transparent rounded-full pl-10 pr-4 py-3 outline-none focus:border-fb-blue text-sm font-bold shadow-sm transition-all"
              />
            </div>
            <div className="w-full md:w-48 relative">
              <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="w-full bg-white border-2 border-transparent rounded-full px-4 py-3 outline-none focus:border-fb-blue text-xs font-bold shadow-sm transition-all appearance-none cursor-pointer">
                <option value="All">All Courses</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="w-full md:w-48 relative">
              <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="w-full bg-white border-2 border-transparent rounded-full px-4 py-3 outline-none focus:border-fb-blue text-xs font-bold shadow-sm transition-all appearance-none cursor-pointer">
                <option value="All">All Years</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-fb-border overflow-hidden hidden md:block">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[800px]">
                <thead className="bg-fb-gray/50 border-b border-fb-border">
                  <tr>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-fb-textSecondary uppercase tracking-widest w-[30%]">Student</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-fb-textSecondary uppercase tracking-widest w-[30%]">Course</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black text-fb-textSecondary uppercase tracking-widest w-[20%]">Grade</th>
                    <th className="px-6 py-4 text-right text-[10px] font-black text-fb-textSecondary uppercase tracking-widest w-[20%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-fb-border">
                  {filteredRows.map((row, i) => {
                    const rowId = `${row.student.uid}_${row.course.id}`;
                    const isEditing = editingId === rowId;
                    const courseAbsences = attendanceRecords.filter(r => r.studentId === row.student.uid && r.courseId === row.course.id && r.status === 'absent');
                    const excusedCount = courseAbsences.filter(r => r.isExcused).length;
                    const isExpanded = expandedRowId === rowId;

                    return (
                      <React.Fragment key={rowId}>
                        <tr className="hover:bg-fb-hover transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-sm text-fb-textPrimary capitalize italic">{formatName(row.student)}</div>
                            <div className="flex flex-col gap-1 mt-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">{row.student.yearLevel}</span>
                                {courseAbsences.length > 0 && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setExpandedRowId(isExpanded ? null : rowId); }}
                                    className="flex items-center gap-1 text-[8px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded transition-all cursor-pointer animate-bounce-once"
                                  >
                                    <span>{courseAbsences.length} {courseAbsences.length === 1 ? 'Absence' : 'Absences'}</span>
                                    <span className="opacity-60 font-medium">({excusedCount} excused)</span>
                                    <ChevronDown size={8} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  </button>
                                )}
                              </div>
                              <button 
                                onClick={() => setSelectedStudentForProfile(row.student)}
                                className="text-[10px] font-black text-fb-blue hover:text-fb-blue/80 hover:underline uppercase tracking-widest cursor-pointer text-left self-start mt-0.5"
                              >
                                View Profile
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-sm text-fb-textPrimary capitalize">{row.course.name}</div>
                            <div className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest mt-1">{row.course.semester}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min="0" max="100"
                                    disabled={editFormData.isIncomplete}
                                    value={editFormData.isIncomplete ? '' : editFormData.gradeValue}
                                    onChange={(e) => setEditFormData({ ...editFormData, gradeValue: Math.max(0, Math.min(100, Number(e.target.value))) })}
                                    className="w-16 text-center border-2 border-fb-blue rounded-lg py-1.5 text-xs font-bold outline-none disabled:bg-fb-gray disabled:border-transparent"
                                    placeholder={editFormData.isIncomplete ? "-" : "Score"}
                                  />
                                  <label className="flex items-center gap-1.5 cursor-pointer bg-fb-gray px-2 py-1.5 rounded-lg border border-transparent hover:border-fb-border">
                                    <input 
                                      type="checkbox" 
                                      checked={editFormData.isIncomplete}
                                      onChange={(e) => setEditFormData({ ...editFormData, isIncomplete: e.target.checked })}
                                      className="w-3.5 h-3.5 accent-fb-blue"
                                    />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary mt-0.5">Inc</span>
                                  </label>
                                </div>
                              ) : (
                                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${row.grade ? getStatus(row.grade.gradeValue, row.grade.isIncomplete).color : 'bg-fb-gray text-fb-textSecondary'}`}>
                                  {row.grade ? getStatus(row.grade.gradeValue, row.grade.isIncomplete).label : 'Pending'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              {isEditing ? (
                                <>
                                  <button disabled={loading} onClick={() => handleUpdateGrade(row.student.uid, row.course.id, row.course.name, row.course.yearLevel, row.course.semester)} className="p-2 bg-fb-blue text-white rounded-lg shadow-sm hover:bg-blue-600 transition-all disabled:opacity-50"><Check size={14} /></button>
                                  <button disabled={loading} onClick={() => setEditingId(null)} className="p-2 bg-fb-gray text-fb-textSecondary rounded-lg border border-transparent hover:border-fb-border transition-all disabled:opacity-50"><X size={14} /></button>
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingId(rowId);
                                    setEditFormData({ 
                                      gradeValue: row.grade?.gradeValue !== undefined ? row.grade.gradeValue : '', 
                                      isIncomplete: row.grade?.isIncomplete || false 
                                    });
                                  }}
                                  className="p-2 bg-fb-blue/5 text-fb-blue rounded-lg hover:bg-fb-blue hover:text-white transition-all shadow-sm"
                                >
                                  <Edit2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && courseAbsences.length > 0 && (
                          <tr className="bg-fb-gray/10">
                            <td colSpan={4} className="px-6 py-4">
                              <div className="space-y-2 py-2 border-l-2 border-rose-300 pl-4 animate-in slide-in-from-top-1 duration-200">
                                <p className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary">Absence History</p>
                                <div className="space-y-1.5">
                                  {courseAbsences.map(abs => (
                                    <div key={abs.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-2.5 rounded-xl border border-fb-border/60 text-xs shadow-sm">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-fb-textPrimary font-semibold text-[11px]">{abs.date}</span>
                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${abs.isExcused ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                          {abs.isExcused ? 'Excused' : 'Unexcused'}
                                        </span>
                                      </div>
                                      {abs.notes ? (
                                        <span className="text-fb-textSecondary font-medium italic mt-1 sm:mt-0 max-w-md truncate">Reason: "{abs.notes}"</span>
                                      ) : (
                                        <span className="text-fb-textSecondary/40 italic mt-1 sm:mt-0">No reason provided</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-fb-textSecondary">
                        <div className="flex flex-col items-center gap-3 opacity-50">
                          <GraduationCap size={32} />
                          <p className="text-xs font-black uppercase tracking-widest">No assigned students found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile view: Responsive card list */}
          <div className="block md:hidden space-y-4">
            {filteredRows.map((row, i) => {
              const rowId = `${row.student.uid}_${row.course.id}`;
              const isEditing = editingId === rowId;
              const courseAbsences = attendanceRecords.filter(r => r.studentId === row.student.uid && r.courseId === row.course.id && r.status === 'absent');
              const excusedCount = courseAbsences.filter(r => r.isExcused).length;
              const isExpanded = expandedRowId === rowId;

              return (
                <div key={`mobile_${rowId}`} className="bg-white rounded-3xl p-5 border border-fb-border shadow-sm space-y-4">
                  {/* Student Details and Actions */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <div className="font-bold text-base text-fb-textPrimary capitalize italic leading-tight">{formatName(row.student)}</div>
                      <div className="flex flex-col gap-1.5 mt-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest bg-fb-gray px-2 py-0.5 rounded-md">{row.student.yearLevel}</span>
                          {courseAbsences.length > 0 && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); setExpandedRowId(isExpanded ? null : rowId); }}
                              className="flex items-center gap-1 text-[8px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded transition-all cursor-pointer"
                            >
                              <span>{courseAbsences.length} {courseAbsences.length === 1 ? 'Absence' : 'Absences'}</span>
                              <span className="opacity-60 font-medium">({excusedCount} excused)</span>
                              <ChevronDown size={8} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                        </div>
                        <button 
                          onClick={() => setSelectedStudentForProfile(row.student)}
                          className="text-[10px] font-black text-fb-blue hover:text-fb-blue/80 hover:underline uppercase tracking-widest cursor-pointer text-left self-start"
                        >
                          View Profile
                        </button>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex-shrink-0">
                      {isEditing ? (
                        <div className="flex gap-1.5">
                          <button disabled={loading} onClick={() => handleUpdateGrade(row.student.uid, row.course.id, row.course.name, row.course.yearLevel, row.course.semester)} className="p-2.5 bg-fb-blue text-white rounded-xl shadow-sm hover:bg-blue-600 transition-all disabled:opacity-50"><Check size={14} /></button>
                          <button disabled={loading} onClick={() => setEditingId(null)} className="p-2.5 bg-fb-gray text-fb-textSecondary rounded-xl border border-transparent hover:border-fb-border transition-all disabled:opacity-50"><X size={14} /></button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingId(rowId);
                            setEditFormData({ 
                              gradeValue: row.grade?.gradeValue !== undefined ? row.grade.gradeValue : '', 
                              isIncomplete: row.grade?.isIncomplete || false 
                            });
                          }}
                          className="p-2.5 bg-fb-blue/5 text-fb-blue rounded-xl hover:bg-fb-blue hover:text-white transition-all shadow-sm"
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Course Details */}
                  <div className="border-t border-fb-border pt-3">
                    <span className="text-[9px] font-black text-fb-textSecondary uppercase tracking-widest block mb-0.5">Course</span>
                    <div className="font-bold text-sm text-fb-textPrimary capitalize leading-snug">{row.course.name}</div>
                    <div className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest mt-0.5">{row.course.semester}</div>
                  </div>

                  {/* Grade Details */}
                  <div className="border-t border-fb-border pt-3 flex justify-between items-center gap-4">
                    <div>
                      <span className="text-[9px] font-black text-fb-textSecondary uppercase tracking-widest block">Grade Status</span>
                    </div>
                    <div className="flex-1 flex justify-end">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5 w-full max-w-[180px] justify-end">
                          <input
                            type="number"
                            min="0" max="100"
                            disabled={editFormData.isIncomplete}
                            value={editFormData.isIncomplete ? '' : editFormData.gradeValue}
                            onChange={(e) => setEditFormData({ ...editFormData, gradeValue: Math.max(0, Math.min(100, Number(e.target.value))) })}
                            className="w-16 text-center border-2 border-fb-blue rounded-lg py-1.5 text-xs font-bold outline-none disabled:bg-fb-gray disabled:border-transparent"
                            placeholder={editFormData.isIncomplete ? "-" : "Score"}
                          />
                          <label className="flex items-center gap-1.5 cursor-pointer bg-fb-gray px-2 py-1.5 rounded-lg border border-transparent hover:border-fb-border select-none flex-shrink-0">
                            <input 
                              type="checkbox" 
                              checked={editFormData.isIncomplete}
                              onChange={(e) => setEditFormData({ ...editFormData, isIncomplete: e.target.checked })}
                              className="w-3.5 h-3.5 accent-fb-blue"
                            />
                            <span className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary mt-0.5">Inc</span>
                          </label>
                        </div>
                      ) : (
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${row.grade ? getStatus(row.grade.gradeValue, row.grade.isIncomplete).color : 'bg-fb-gray text-fb-textSecondary'}`}>
                          {row.grade ? getStatus(row.grade.gradeValue, row.grade.isIncomplete).label : 'Pending'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Absences History List */}
                  {isExpanded && courseAbsences.length > 0 && (
                    <div className="border-t border-fb-border pt-3 space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary">Absence History</p>
                      <div className="space-y-1.5">
                        {courseAbsences.map(abs => (
                          <div key={abs.id} className="flex flex-col bg-fb-gray/50 p-2.5 rounded-xl border border-fb-border/60 text-xs shadow-sm space-y-1">
                            <div className="flex justify-between items-center gap-2">
                              <span className="font-mono text-fb-textPrimary font-semibold text-[11px]">{abs.date}</span>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${abs.isExcused ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                {abs.isExcused ? 'Excused' : 'Unexcused'}
                              </span>
                            </div>
                            {abs.notes ? (
                              <span className="text-fb-textSecondary font-medium italic truncate">Reason: "{abs.notes}"</span>
                            ) : (
                              <span className="text-fb-textSecondary/40 italic">No reason provided</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredRows.length === 0 && (
              <div className="bg-white rounded-3xl p-12 border border-fb-border shadow-sm text-center text-fb-textSecondary">
                <div className="flex flex-col items-center gap-3 opacity-50">
                  <GraduationCap size={32} />
                  <p className="text-xs font-black uppercase tracking-widest">No assigned students found</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {selectedStudentForProfile && (
        <StudentProfileViewModal 
          student={selectedStudentForProfile} 
          onClose={() => setSelectedStudentForProfile(null)} 
        />
      )}
    </div>
  );
};
const CourseManagementPage = ({ profile }: { profile: UserProfile | null }) => {
  const [courses, setCourses] = useState([] as Course[]);
  const [trashedCourses, setTrashedCourses] = useState([] as Course[]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isViewTrash, setIsViewTrash] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list' as 'list' | 'calendar');
  const [yearLevelFilter, setYearLevelFilter] = useState('All' as 'All' | '1st Year' | '2nd Year');
  const [semesterFilter, setSemesterFilter] = useState('All' as 'All' | '1st Semester' | '2nd Semester' | '3rd Semester');
  const [schoolYearFilter, setSchoolYearFilter] = useState('All');
  const [permissionError, setPermissionError] = useState(false);
  const [trashPermissionError, setTrashPermissionError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedToRestore, setSelectedToRestore] = useState([] as string[]);
  const [selectedToArchive, setSelectedToArchive] = useState([] as string[]);
  const [sortOrder, setSortOrder] = useState('none' as 'none' | 'asc' | 'desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  
  const [dayDetailData, setDayDetailData] = useState(null as { date: string, courses: Course[] } | null);
  const [teachers, setTeachers] = useState([] as UserProfile[]);
  
  const initialFormState: Partial<Course> = { 
    name: '', professor: '', date: new Date().toISOString().split('T')[0], startTime: '09:00', endTime: '10:30', isRecurring: false, frequency: 'Weekly', daysOfWeek: [], yearLevel: '1st Year', semester: '1st Semester', status: 'active', schoolYear: '' 
  };
  const [formData, setFormData] = useState(initialFormState);

  const profileUid = profile?.uid;
  const profileRole = profile?.role;

  useEffect(() => {
    if (!profileUid) return;

    const unsubActive = onSnapshot(collection(db, "courses"), (snapshot) => {
      const list: Course[] = []; 
      snapshot.forEach(docSnap => list.push({ ...docSnap.data() as Course, id: docSnap.id }));
      setCourses(list);
      setPermissionError(false);
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.warn("Permission denied for active course registry.");
        setPermissionError(true);
      }
      handleFirestoreError(error, OperationType.LIST, "courses");
    });

    const unsubTeachers = onSnapshot(query(collection(db, "users"), where("role", "==", "teacher")), (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach(docSnap => list.push({ ...docSnap.data() as UserProfile, uid: docSnap.id }));
      setTeachers(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "users");
    });
    let unsubTrash = () => {};
    if (profileRole === 'admin') {
      unsubTrash = onSnapshot(collection(db, "trash"), (snapshot) => {
        const list = [] as Course[]; 
        snapshot.forEach(docSnap => list.push({ ...docSnap.data() as Course, id: docSnap.id }));
        setTrashedCourses(list);
        setTrashPermissionError(false);
      }, (error) => {
        if (error.code === 'permission-denied') {
          console.warn("User has admin role but Firestore rules restrict access to the 'trash' collection.");
          setTrashPermissionError(true);
        }
        handleFirestoreError(error, OperationType.LIST, "trash");
      });
    }

    return () => { unsubActive(); unsubTrash(); unsubTeachers(); };
  }, [profileUid, profileRole]);

  const handleBatchRestore = async () => {
    if (selectedToRestore.length === 0) return;
    setIsProcessing(true);
    try {
      const promises = selectedToRestore.map(async (id) => {
        const course = trashedCourses.find(tc => tc.id === id);
        if (course) {
          const { archivedAt, archivedBy, ...cleanData } = course as any;
          await setDoc(doc(db, "courses", id), {
            ...cleanData,
            status: 'active',
            createdAt: Timestamp.now()
          });
          await deleteDoc(doc(db, "trash", id));
        }
      });
      await Promise.all(promises);
      setSelectedToRestore([]);
      alert("Selected courses restored to Academic Registry.");
    } catch (err: any) {
      alert("Batch restore failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchArchive = async () => {
    if (selectedToArchive.length === 0) return;
    setIsProcessing(true);
    try {
      const promises = selectedToArchive.map(async (id) => {
        const course = courses.find(c => c.id === id);
        if (course) {
          const trashDocRef = doc(db, "trash", id);
          await setDoc(trashDocRef, {
            ...course,
            status: 'archived',
            archivedAt: Timestamp.now(),
            archivedBy: profile?.email || 'Admin System'
          });
          await deleteDoc(doc(db, "courses", id));
        }
      });
      await Promise.all(promises);
      setSelectedToArchive([]);
      alert("Selected courses moved to Archive.");
    } catch (err: any) {
      alert("Batch archive failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const syncCourseToStudents = async (course: Course) => {
    if (!course.schoolYear || !course.yearLevel) return;
    try {
      let syField = "";
      if (course.yearLevel === '1st Year') syField = "firstYearSchoolYear";
      else if (course.yearLevel === '2nd Year') syField = "secondYearSchoolYear";
      
      if (!syField) return;

      // Only query students who are currently in this year level and have the matching school year set
      const q = query(
        collection(db, "users"), 
        where("role", "==", "student"), 
        where("yearLevel", "==", course.yearLevel),
        where(syField, "==", course.schoolYear)
      );
      
      const snap = await getDocs(q);
      const promises = snap.docs.map(async (studentDoc) => {
        const studentData = studentDoc.data() as UserProfile;
        const existingGrades = studentData.grades || [];
        
        const existingGradeIndex = existingGrades.findIndex(g => g.id === course.id);
        
        if (existingGradeIndex === -1) {
          const newGrade: Grade = {
            id: course.id,
            courseName: course.name,
            gradeValue: '',
            isIncomplete: false,
            dateReleased: new Date().toISOString().split('T')[0],
            yearLevel: course.yearLevel as any,
            semester: course.semester as any
          };
          await updateDoc(doc(db, "users", studentDoc.id), {
            grades: [...existingGrades, newGrade]
          });
        } else {
          // Update existing grade name if it changed
          if (existingGrades[existingGradeIndex].courseName !== course.name) {
            const updatedGrades = [...existingGrades];
            updatedGrades[existingGradeIndex] = {
              ...updatedGrades[existingGradeIndex],
              courseName: course.name
            };
            await updateDoc(doc(db, "users", studentDoc.id), {
              grades: updatedGrades
            });
          }
        }
      });
      await Promise.all(promises);
    } catch (err) {
      console.error("Error syncing course to students:", err);
    }
  };

  const handleDuplicate = (course: Course) => {
    const { id, createdAt, archivedAt, archivedBy, ...cleanData } = course as any;
    setFormData({
      ...cleanData,
      name: `${cleanData.name} (Copy)`,
      status: 'active'
    });
    setEditingId(null);
    setIsAdding(true);
  };

  const toggleRestoreSelection = (id: string) => {
    setSelectedToRestore(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleArchiveSelection = (id: string) => {
    setSelectedToArchive(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSort = () => {
    setSortOrder(prev => {
      if (prev === 'none') return 'asc';
      if (prev === 'asc') return 'desc';
      return 'none';
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const dataToSave = { ...formData, status: formData.status || 'active' };
      const id = editingId || `CRS-${Math.random().toString(36).substr(2, 5).toUpperCase()}-${Date.now().toString().slice(-4)}`;
      delete (dataToSave as any).id;

      if (editingId) {
        await updateDoc(doc(db, "courses", editingId), dataToSave);
        await syncCourseToStudents({ ...dataToSave, id: editingId } as Course);
      } else {
        const newCourse = { ...dataToSave, id, createdAt: Timestamp.now() } as Course;
        await setDoc(doc(db, "courses", id), newCourse);
        await syncCourseToStudents(newCourse);
      }
      
      setIsAdding(false); setEditingId(null); setFormData(initialFormState);
      alert("Records successfully published and synced to students.");
    } catch (err: any) { alert(err.message); }
    finally { setIsProcessing(false); }
  };

  const toggleDayOfWeek = (day: string) => {
    setFormData(prev => {
      const current = prev.daysOfWeek || [];
      let updated;
      if (prev.frequency === 'Daily') {
          updated = [day];
      } else {
          updated = current.includes(day) 
            ? current.filter(d => d !== day) 
            : [...current, day];
      }
      return { ...prev, daysOfWeek: updated };
    });
  };

  if (permissionError) return <PermissionDeniedGate message="Insufficient permissions to load course database" />;

  const listToDisplay = isViewTrash ? trashedCourses : courses;
  
  const filtered = listToDisplay.filter(c => {
    const matchesSearch = (c.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesYear = yearLevelFilter === 'All' || c.yearLevel === yearLevelFilter;
    const matchesSemester = semesterFilter === 'All' || c.semester === semesterFilter;
    const matchesSchoolYear = schoolYearFilter === 'All' || c.schoolYear === schoolYearFilter;
    const isNotArchived = isViewTrash || c.status !== 'archived'; 
    return matchesSearch && matchesYear && matchesSemester && matchesSchoolYear && isNotArchived;
  });

  const sorted = useMemo(() => {
    let result = [...filtered];
    if (sortOrder !== 'none') {
      result.sort((a, b) => {
        const valA = (a.name || '').toLowerCase();
        const valB = (b.name || '').toLowerCase();
        if (sortOrder === 'asc') return valA.localeCompare(valB);
        return valB.localeCompare(valA);
      });
    }
    return result;
  }, [filtered, sortOrder]);

  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const paginatedItems = sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, yearLevelFilter, semesterFilter, schoolYearFilter, isViewTrash]);

  const uniqueSchoolYears = useMemo(() => {
    const years = new Set<string>();
    courses.forEach(c => { if (c.schoolYear) years.add(c.schoolYear); });
    trashedCourses.forEach(c => { if (c.schoolYear) years.add(c.schoolYear); });
    return Array.from(years).sort().reverse();
  }, [courses, trashedCourses]);

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  return (
    <div className="space-y-8 pb-10">
      <Card noPadding>
        <div className="p-3 md:p-4 lg:p-5 flex flex-col md:flex-row gap-3 md:gap-4 border-b border-fb-border items-start">
          {/* Search Box - Proportionally adjusted */}
          <div className="w-full md:w-[25%] relative">
            <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-fb-textSecondary" size={14} />
            <input 
              type="text" 
              placeholder={isViewTrash ? "Search archived..." : "Search catalog..."}
              className="w-full h-full bg-fb-gray border border-transparent rounded-full pl-9 md:pl-10 pr-9 md:pr-10 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[10px] md:text-xs font-semibold transition-all" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white rounded-full text-fb-textSecondary transition-all"
              >
                <X size={12} />
              </button>
            )}
          </div>
          
          {/* Year Level Filter - Proportionally adjusted */}
          <div className="w-full md:w-[12%] relative">
            <select 
              value={yearLevelFilter} 
              onChange={(e) => setYearLevelFilter(e.target.value as any)}
              className="w-full h-full bg-fb-gray border border-transparent rounded-full px-3 md:px-4 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[9px] md:text-[10px] font-bold transition-all appearance-none cursor-pointer"
            >
              <option value="All">All Years</option>
              <option value="1st Year">1st Year</option>
              <option value="2nd Year">2nd Year</option>
            </select>
          </div>

          {/* Semester Filter - New Control Added here */}
          <div className="w-full md:w-[12%] relative">
            <select 
              value={semesterFilter} 
              onChange={(e) => setSemesterFilter(e.target.value as any)}
              className="w-full h-full bg-fb-gray border border-transparent rounded-full px-3 md:px-4 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[9px] md:text-[10px] font-bold transition-all appearance-none cursor-pointer"
            >
              <option value="All">All Semesters</option>
              <option value="1st Semester">1st Sem</option>
              <option value="2nd Semester">2nd Sem</option>
              <option value="3rd Semester">3rd Sem</option>
            </select>
          </div>

          {/* School Year Filter */}
          <div className="w-full md:w-[12%] relative">
            <select 
              value={schoolYearFilter} 
              onChange={(e) => setSchoolYearFilter(e.target.value)}
              className="w-full h-full bg-fb-gray border border-transparent rounded-full px-3 md:px-4 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[9px] md:text-[10px] font-bold transition-all appearance-none cursor-pointer"
            >
              <option value="All">All SY</option>
              {uniqueSchoolYears.map(sy => (
                <option key={sy} value={sy}>{sy}</option>
              ))}
            </select>
          </div>

          {/* View Mode Toggle - Proportionally adjusted */}
          <div className="w-full md:w-[12%]">
            <div className="flex bg-fb-gray p-1 rounded-full border border-transparent shadow-sm">
              <button 
                onClick={() => setViewMode('list')}
                className={`flex-1 flex justify-center py-1.5 md:py-2 rounded-full transition-all ${viewMode === 'list' ? 'bg-white text-fb-blue shadow-md' : 'text-fb-textSecondary hover:bg-fb-hover'}`}
              >
                <List size={14} />
              </button>
              <button 
                onClick={() => setViewMode('calendar')}
                className={`flex-1 flex justify-center py-1.5 md:py-2 rounded-full transition-all ${viewMode === 'calendar' ? 'bg-white text-fb-blue shadow-md' : 'text-fb-textSecondary hover:bg-fb-hover'}`}
              >
                <CalendarIcon size={14} />
              </button>
            </div>
          </div>

          {/* Registry/Archive Toggle - Proportionally adjusted */}
          <button 
            onClick={() => { setIsViewTrash(!isViewTrash); setSearchTerm(''); setSchoolYearFilter('All'); setSelectedToRestore([]); setSelectedToArchive([]); }} 
            className={`w-full md:w-[12%] py-1.5 md:py-2 rounded-full font-bold text-[9px] md:text-[10px] shadow-sm transition-all flex items-center justify-center gap-2 border ${isViewTrash ? 'bg-fb-textPrimary text-white' : 'bg-white text-fb-textSecondary hover:bg-fb-hover'}`}
          >
            {isViewTrash ? <Database size={14} /> : <Archive size={14} />}
            <span>{isViewTrash ? "Registry" : "Archive"}</span>
          </button>

          {/* Actions Column - Proportionally adjusted */}
          <div className="w-full md:w-[12%] flex flex-col gap-2">
            <button onClick={() => { setFormData(initialFormState); setIsAdding(true); }} className="w-full bg-fb-blue text-white py-1.5 md:py-2 rounded-full font-bold text-[9px] md:text-[10px] shadow-md hover:bg-blue-600 transition-all flex items-center justify-center gap-2 active:scale-95">
              <Plus size={14} /><span>New Entry</span>
            </button>
            
            {isViewTrash ? (
              selectedToRestore.length > 0 && (
                <button 
                  onClick={handleBatchRestore}
                  disabled={isProcessing}
                  className="w-full bg-emerald-500 text-white py-1 md:py-1.5 rounded-full font-black text-[8px] md:text-[9px] uppercase shadow-md hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 animate-in slide-in-from-top-2 duration-300"
                >
                  {isProcessing ? <RefreshCw className="animate-spin" size={12}/> : <RotateCcw size={12}/>}
                  <span>Restore ({selectedToRestore.length})</span>
                </button>
              )
            ) : (
              selectedToArchive.length > 0 && (
                <button 
                  onClick={handleBatchArchive}
                  disabled={isProcessing}
                  className="w-full bg-red-600 text-white py-1 md:py-1.5 rounded-full font-black text-[8px] md:text-[9px] uppercase shadow-md hover:bg-red-700 transition-all flex items-center justify-center gap-2 animate-in slide-in-from-top-2 duration-300"
                >
                  {isProcessing ? <RefreshCw className="animate-spin" size={12}/> : <Archive size={12}/>}
                  <span>Archive ({selectedToArchive.length})</span>
                </button>
              )
            )}
          </div>
        </div>

        {viewMode === 'calendar' ? (
          <div className="p-4 md:p-10">
            <CourseCalendar 
              courses={filtered} 
              onDayClick={(date, dayCourses) => setDayDetailData({ date, courses: dayCourses })} 
            />
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-fb-gray/50 border-b text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">
                  <tr>
                    <th className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <span>Course</span>
                        <button onClick={toggleSort} className={`p-1 rounded transition-all ${sortOrder !== 'none' ? 'text-fb-blue' : 'hover:bg-fb-gray'}`}>
                          {sortOrder === 'none' ? <ArrowUpDown size={12}/> : sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>}
                        </button>
                      </div>
                    </th>
                    <th className="px-8 py-5">{isViewTrash ? "Archive Date" : "Instructor"}</th>
                    <th className="px-8 py-5">Schedule</th>
                    <th className="px-8 py-5 text-center">Year / Term</th>
                    <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginatedItems.map(c => (
                    <tr key={c.id} className={`hover:bg-fb-hover transition-all ${isViewTrash ? 'hover:bg-rose-50/30' : ''}`}>
                      <td className="px-8 py-5">
                        <div className="flex flex-col">
                          <span className="font-black text-sm text-fb-textPrimary capitalize italic leading-none">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        {isViewTrash ? (
                          <span className="text-[10px] font-bold text-fb-textSecondary uppercase italic">
                            {c.archivedAt ? (c.archivedAt instanceof Timestamp ? c.archivedAt.toDate() : new Date(c.archivedAt.seconds * 1000)).toLocaleDateString() : 'N/A'}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-fb-textSecondary capitalize italic">{c.professor}</span>
                        )}
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-fb-textPrimary font-bold text-xs uppercase">
                            <Clock size={12} className="text-fb-blue" />
                            {c.startTime} - {c.endTime}
                          </div>
                          {c.isRecurring ? (
                            <div className="flex flex-wrap gap-1">
                              {c.daysOfWeek?.map(day => (
                                <span key={day} className="text-[8px] font-black text-fb-blue bg-fb-blue/5 px-1.5 py-0.5 rounded border border-fb-blue/10">{day}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-fb-textSecondary uppercase italic">{c.date}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <div className="flex flex-col gap-1 items-center">
                          <span className="px-4 py-1.5 bg-fb-gray rounded-xl text-[10px] font-black uppercase border tracking-widest shadow-sm">{c.yearLevel}</span>
                          <span className="text-[8px] font-black text-fb-textSecondary uppercase opacity-60">{c.semester}</span>
                          {c.schoolYear && <span className="text-[8px] font-black text-fb-blue uppercase opacity-80">SY {c.schoolYear}</span>}
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center justify-end gap-3">
                          {isViewTrash ? (
                            <div className="flex flex-col items-center gap-1 group">
                                <div className="p-2 md:p-2.5">
                                  <input 
                                    type="checkbox" 
                                    checked={selectedToRestore.includes(c.id)}
                                    onChange={() => toggleRestoreSelection(c.id)}
                                    className="w-3.5 h-3.5 md:w-4 md:h-4 rounded border-fb-border text-fb-blue focus:ring-fb-blue cursor-pointer"
                                  />
                                </div>
                                <span className="text-[8px] font-black uppercase text-fb-textSecondary opacity-60">Restore</span>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-col items-center gap-1 group">
                                <button 
                                  onClick={() => handleDuplicate(c)}
                                  disabled={isProcessing}
                                  className="p-2 md:p-2.5 text-fb-textSecondary hover:bg-emerald-500 hover:text-white rounded-xl transition-all shadow-sm border border-fb-border disabled:opacity-50"
                                >
                                  <Copy size={14} />
                                </button>
                                <span className="text-[8px] font-black uppercase text-fb-textSecondary opacity-60 group-hover:text-emerald-500">Duplicate</span>
                              </div>
                              <div className="flex flex-col items-center gap-1 group">
                                <button 
                                  onClick={() => { setEditingId(c.id); setFormData(c); setIsAdding(true); }}
                                  className="p-2 md:p-2.5 text-fb-textSecondary hover:bg-fb-blue hover:text-white rounded-xl transition-all shadow-sm border border-fb-border"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <span className="text-[8px] font-black uppercase text-fb-textSecondary opacity-60 group-hover:text-fb-blue">Edit</span>
                              </div>
                              <div className="flex flex-col items-center gap-1 group">
                                <div className="p-2 md:p-2.5">
                                  <input 
                                    type="checkbox" 
                                    checked={selectedToArchive.includes(c.id)}
                                    onChange={() => toggleArchiveSelection(c.id)}
                                    className="w-3.5 h-3.5 md:w-4 md:h-4 rounded border-fb-border text-fb-blue focus:ring-fb-blue cursor-pointer"
                                  />
                                </div>
                                <span className="text-[8px] font-black uppercase text-fb-textSecondary opacity-60 group-hover:text-fb-blue">Archive</span>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-24 text-center opacity-30">
                        <div className="flex flex-col items-center">
                          <Layers size={48} className="mb-4" />
                          <p className="font-black uppercase text-[10px] tracking-widest italic">{isViewTrash ? 'No Archived Records Found' : 'No Active Records Found'}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile List View */}
            <div className="md:hidden flex flex-col divide-y">
              {paginatedItems.map(c => (
                <div key={c.id} className={`p-4 flex flex-col gap-3 ${isViewTrash ? 'bg-rose-50/10' : ''}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="font-black text-sm text-fb-textPrimary capitalize italic leading-tight">{c.name}</span>
                      <span className="text-xs font-bold text-fb-textSecondary capitalize italic mt-1">{c.professor}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="px-3 py-1 bg-fb-gray rounded-xl text-[10px] font-black uppercase border tracking-widest shadow-sm">{c.yearLevel}</span>
                      <span className="text-[8px] font-black text-fb-textSecondary uppercase opacity-60">{c.semester}</span>
                      {c.schoolYear && <span className="text-[8px] font-black text-fb-blue uppercase opacity-80">SY {c.schoolYear}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-bold text-fb-textSecondary">
                    <div className="flex items-center gap-1.5">
                      <Clock size={12} className="text-fb-blue" />
                      {c.startTime} - {c.endTime}
                    </div>
                    {c.isRecurring ? (
                      <div className="flex flex-wrap gap-1">
                        {c.daysOfWeek?.map(day => (
                          <span key={day} className="text-[8px] font-black text-fb-blue bg-fb-blue/5 px-1.5 py-0.5 rounded border border-fb-blue/10">{day}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-fb-textSecondary uppercase italic">{c.date}</span>
                    )}
                  </div>

                  {isViewTrash && (
                    <div className="text-[10px] font-bold text-fb-textSecondary uppercase italic">
                      Archived: {c.archivedAt ? (c.archivedAt instanceof Timestamp ? c.archivedAt.toDate() : new Date(c.archivedAt.seconds * 1000)).toLocaleDateString() : 'N/A'}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-dashed border-fb-border/50">
                    {isViewTrash ? (
                      <label className="flex items-center gap-2 px-2.5 py-1 bg-fb-gray rounded-lg cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={selectedToRestore.includes(c.id)}
                          onChange={() => toggleRestoreSelection(c.id)}
                          className="w-3 h-3 rounded border-fb-border text-fb-blue focus:ring-fb-blue"
                        />
                        <span className="text-[9px] md:text-[10px] font-bold text-fb-textSecondary uppercase">Restore</span>
                      </label>
                    ) : (
                      <>
                        <button 
                          onClick={() => handleDuplicate(c)} 
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-fb-gray rounded-lg text-[9px] md:text-[10px] font-bold text-fb-textSecondary uppercase disabled:opacity-50"
                        >
                          <Copy size={10} /> Duplicate
                        </button>
                        <button onClick={() => { setEditingId(c.id!); setFormData(c); setIsAdding(true); }} className="flex items-center gap-1.5 px-2.5 py-1 bg-fb-gray rounded-lg text-[9px] md:text-[10px] font-bold text-fb-textSecondary uppercase">
                          <Edit2 size={10} /> Edit
                        </button>
                        <label className="flex items-center gap-2 px-2.5 py-1 bg-fb-gray rounded-lg cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={selectedToArchive.includes(c.id!)}
                            onChange={() => toggleArchiveSelection(c.id!)}
                            className="w-3 h-3 rounded border-fb-border text-fb-blue focus:ring-fb-blue"
                          />
                          <span className="text-[9px] md:text-[10px] font-bold text-fb-textSecondary uppercase">Archive</span>
                        </label>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {paginatedItems.length === 0 && (
                <div className="py-16 text-center opacity-30">
                  <div className="flex flex-col items-center">
                    <BookOpen size={32} className="mb-3" />
                    <p className="font-black uppercase text-[10px] tracking-widest italic">No courses found</p>
                  </div>
                </div>
              )}
            </div>

            {filtered.length > 0 && (
              <div className="p-6 bg-fb-gray/5 border-t flex flex-col md:flex-row items-center justify-between gap-4">
                <p className="text-[10px] font-black uppercase text-fb-textSecondary tracking-widest">
                  Showing <span className="text-fb-textPrimary">{Math.min(currentPage * itemsPerPage, sorted.length)}</span> of <span className="text-fb-textPrimary">{sorted.length}</span> entries
                </p>
                <div className="flex items-center gap-2">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="p-2 bg-white border rounded-xl hover:bg-fb-gray disabled:opacity-30 transition-all text-fb-textPrimary shadow-sm"
                  >
                    <ChevronLeft size={18}/>
                  </button>
                  <div className="flex gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-9 h-9 rounded-xl font-black text-[10px] transition-all ${currentPage === page ? 'bg-fb-blue text-white shadow-md shadow-fb-blue/20' : 'bg-white border hover:bg-fb-gray text-fb-textSecondary'}`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className="p-2 bg-white border rounded-xl hover:bg-fb-gray disabled:opacity-30 transition-all text-fb-textPrimary shadow-sm"
                  >
                    <ChevronRight size={18}/>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
      
      {isAdding && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-fb-textPrimary/20 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] md:rounded-[3rem] shadow-2xl overflow-hidden transform transition-all border border-fb-border">
            <form onSubmit={handleSubmit} className="px-8 md:px-12 pb-[15px] pt-[15px] space-y-[22px] max-h-[85vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-[22px]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField label="Course Name" name="name" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="Title of course" />
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-fb-textSecondary ml-1 uppercase tracking-widest">Professor</label>
                    <div className="relative group">
                      <select className="w-full bg-white border-2 border-fb-gray rounded-2xl px-5 py-3.5 text-sm font-bold outline-none focus:border-fb-blue transition-all appearance-none shadow-sm cursor-pointer" 
                        value={formData.instructorId || ""} 
                        onChange={(e) => {
                          const teacher = teachers.find(t => t.uid === e.target.value);
                          setFormData(p => ({ ...p, instructorId: e.target.value, professor: teacher ? formatName(teacher) : '' }));
                        }}>
                        <option value="" disabled>Select Instructor</option>
                        {teachers.map(t => (
                          <option key={t.uid} value={t.uid}>{formatName(t)}</option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-fb-textSecondary opacity-50 group-hover:opacity-100 transition-opacity">
                        <ChevronDown size={16} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-fb-textSecondary ml-1 uppercase tracking-widest">Year Level</label>
                    <div className="relative group">
                      <select className="w-full bg-white border-2 border-fb-gray rounded-2xl px-5 py-3.5 text-sm font-bold outline-none focus:border-fb-blue transition-all appearance-none uppercase shadow-sm cursor-pointer" value={formData.yearLevel} onChange={(e) => setFormData(p => ({ ...p, yearLevel: e.target.value as any }))}>
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-fb-textSecondary pointer-events-none" size={16} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-fb-textSecondary ml-1 uppercase tracking-widest">Semester</label>
                    <div className="relative group">
                      <select className="w-full bg-white border-2 border-fb-gray rounded-2xl px-5 py-3.5 text-sm font-bold outline-none focus:border-fb-blue transition-all appearance-none uppercase shadow-sm cursor-pointer" value={formData.semester} onChange={(e) => setFormData(p => ({ ...p, semester: e.target.value as any }))}>
                        <option value="1st Semester">1st Term</option>
                        <option value="2nd Semester">2nd Term</option>
                        <option value="3rd Semester">3rd Term</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-fb-textSecondary pointer-events-none" size={16} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-fb-textSecondary ml-1 uppercase tracking-widest">School Year</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        maxLength={4} 
                        className="w-full bg-white border-2 border-fb-gray rounded-2xl px-3 py-3.5 text-sm font-bold outline-none focus:border-fb-blue transition-all shadow-sm text-center" 
                        placeholder="YYYY"
                        value={formData.schoolYear?.split('-')[0] || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          const currentEnd = formData.schoolYear?.split('-')[1] || '';
                          setFormData(p => ({ ...p, schoolYear: `${val}-${currentEnd}` }));
                        }}
                      />
                      <span className="font-bold text-fb-textSecondary">-</span>
                      <input 
                        type="text" 
                        maxLength={4} 
                        className="w-full bg-white border-2 border-fb-gray rounded-2xl px-3 py-3.5 text-sm font-bold outline-none focus:border-fb-blue transition-all shadow-sm text-center" 
                        placeholder="YYYY"
                        value={formData.schoolYear?.split('-')[1] || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          const currentStart = formData.schoolYear?.split('-')[0] || '';
                          setFormData(p => ({ ...p, schoolYear: `${currentStart}-${val}` }));
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-[22px] pt-[22px] border-t border-fb-gray">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3 self-start">
                    <div className="p-2 bg-fb-blue/10 rounded-xl text-fb-blue">
                      <Repeat size={18} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fb-textPrimary italic">Recurrence</span>
                  </div>
                  <div className="flex bg-fb-gray p-1 rounded-2xl border-2 border-fb-border w-full md:w-auto">
                    <button type="button" onClick={() => setFormData(p => ({ ...p, isRecurring: false }))} className={`flex-1 md:flex-none px-5 md:px-7 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!formData.isRecurring ? 'bg-white text-fb-blue shadow-lg' : 'text-fb-textSecondary opacity-40 hover:opacity-100'}`}>Once</button>
                    <button type="button" onClick={() => setFormData(p => ({ ...p, isRecurring: true }))} className={`flex-1 md:flex-none px-5 md:px-7 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.isRecurring ? 'bg-fb-blue text-white shadow-lg' : 'text-fb-textSecondary opacity-40 hover:opacity-100'}`}>Recurring</button>
                  </div>
                </div>

                <div className="bg-fb-gray/30 p-6 md:p-8 rounded-[2rem] border-2 border-fb-border space-y-[22px]">
                  {!formData.isRecurring ? (
                    <div className="space-y-[22px] animate-in slide-in-from-top-4 duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-2"><FormField label="Session Date" name="date" type="date" value={formData.date} onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))} /><div className="hidden md:block"></div></div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6"><FormField label="Start Time" name="startTime" type="time" value={formData.startTime} onChange={(e) => setFormData(p => ({ ...p, startTime: e.target.value }))} /><FormField label="End Time" name="endTime" type="time" value={formData.endTime} onChange={(e) => setFormData(p => ({ ...p, endTime: e.target.value }))} /></div>
                    </div>
                  ) : (
                    <div className="space-y-[22px] animate-in slide-in-from-top-4 duration-300">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest block ml-1 italic opacity-60">Frequency</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {['Daily', 'Weekly', 'Bi-weekly', 'Monthly'].map((freq) => (
                            <button key={freq} type="button" onClick={() => { setFormData(p => { const nextFreq = freq as any; return { ...p, frequency: nextFreq, daysOfWeek: nextFreq === 'Daily' ? (p.daysOfWeek?.slice(0, 1) || []) : p.daysOfWeek }; }); }} className={`py-3 rounded-2xl border-2 font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${formData.frequency === freq ? 'bg-fb-textPrimary border-fb-textPrimary text-white shadow-lg' : 'bg-white border-fb-gray text-fb-textSecondary opacity-40 hover:opacity-100'}`}>{freq}</button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest block ml-1 italic opacity-60">Active Days (Mon-Fri)</label>
                        <div className="grid grid-cols-5 gap-2">
                          {DAYS.map(day => (
                            <button key={day} type="button" onClick={() => toggleDayOfWeek(day)} className={`py-3 rounded-2xl border-2 font-black text-[10px] transition-all active:scale-95 flex-1 ${formData.daysOfWeek?.includes(day) ? 'bg-fb-blue border-fb-blue text-white shadow-lg' : 'bg-white border-fb-gray text-fb-textSecondary opacity-40 hover:opacity-100 hover:border-fb-border'}`}>{day}</button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6"><FormField label="Start Time" name="startTime" type="time" value={formData.startTime} onChange={(e) => setFormData(p => ({ ...p, startTime: e.target.value }))} /><FormField label="End Time" name="endTime" type="time" value={formData.endTime} onChange={(e) => setFormData(p => ({ ...p, endTime: e.target.value }))} /></div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-1 flex flex-col md:flex-row justify-end gap-4">
                <button type="button" onClick={() => setIsAdding(false)} className="w-full md:w-auto px-10 py-3 font-black text-[11px] uppercase tracking-[0.2em] text-fb-textSecondary hover:bg-fb-gray rounded-2xl transition-all border border-fb-border">Cancel</button>
                <button type="submit" disabled={isProcessing} className="w-full md:w-auto bg-fb-blue text-white px-16 py-3 rounded-2xl font-black uppercase text-xs tracking-[0.3em] shadow-xl shadow-fb-blue/20 hover:bg-blue-600 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50">{isProcessing ? <RefreshCw className="animate-spin" size={18} /> : <CheckCircle size={18} />}<span>Save</span></button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Calendar Popup Modal */}
      {dayDetailData && (
        <CalendarDayModal 
          data={dayDetailData} 
          onClose={() => setDayDetailData(null)} 
          onEditCourse={(course) => {
            setFormData(course);
            setEditingId(course.id);
            setIsAdding(true);
          }}
        />
      )}
    </div>
  );
};

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

const ConfirmModal = ({
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

const StudentDashboard = ({ profile }: { profile: UserProfile | null }) => {
  const isAdminOrExec = profile?.role === 'admin' || profile?.role === 'president' || profile?.role === 'vice president';
  
  if (!isAdminOrExec) {
    return (
      <div className="space-y-8 text-center flex flex-col items-center justify-center min-h-[50vh]">
        <ActsLogo className="w-32 h-32 mb-6 animate-pulse" />
        <h2 className="text-4xl md:text-5xl font-black text-fb-textPrimary tracking-tighter italic uppercase leading-none">Welcome to the <br />ACTS Portal</h2>
        <p className="text-fb-textSecondary font-semibold text-lg max-w-xl leading-relaxed mt-4">Signed in as: <span className="text-fb-blue">{formatName(profile)} ({profile?.role})</span></p>
      </div>
    );
  }

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'exams' | 'activity'>('all');
  const [isViewTrash, setIsViewTrash] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    variant: 'info',
    onConfirm: () => {}
  });

  useEffect(() => {
    const q = query(collection(db, "uploaded_files"), where("category", "in", ["exams", "activity"]));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        list.push({ ...data, id: docSnap.id });
      });
      list.sort((a, b) => {
        const t1 = a.createdAt?.seconds || 0;
        const t2 = b.createdAt?.seconds || 0;
        return t2 - t1;
      });
      setSubmissions(list);
      setLoading(false);
    }, (error) => {
      console.error("Error loading submissions for admin dashboard:", error);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, "uploaded_files");
    });

    return () => unsub();
  }, []);

  const filteredSubmissions = submissions.filter(item => {
    const matchesArchive = isViewTrash ? !!item.archived : !item.archived;
    if (!matchesArchive) return false;

    const matchesSearch = 
      item.courseName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.teacherName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.fileName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const handleArchiveFile = (fileId: string, fileName: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Archive Submission?",
      message: `Are you sure you want to archive "${fileName}"? This will remove it from active submissions and move it to the archive folder.`,
      confirmText: "Archive",
      variant: 'warning',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, "uploaded_files", fileId), { archived: true });
        } catch (error) {
          console.error("Error archiving file:", error);
          alert("Failed to archive the file: " + (error as any).message);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleRestoreFile = (fileId: string, fileName: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Restore Submission?",
      message: `Are you sure you want to restore "${fileName}" to the active dashboard list?`,
      confirmText: "Restore",
      variant: 'info',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, "uploaded_files", fileId), { archived: false });
        } catch (error) {
          console.error("Error restoring file:", error);
          alert("Failed to restore the file: " + (error as any).message);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handlePermanentDeleteFile = (fileId: string, fileName: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Permanently Delete?",
      message: `Are you sure you want to PERMANENTLY delete "${fileName}"? This action cannot be undone and will delete it completely.`,
      confirmText: "Delete",
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "uploaded_files", fileId));
        } catch (error) {
          console.error("Error permanently deleting file:", error);
          alert("Failed to permanently delete the file: " + (error as any).message);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-500">
      {/* Hero Welcome Card */}
      <div className="p-8 md:p-10 rounded-[2.5rem] bg-gradient-to-br from-fb-blue via-blue-600 to-indigo-700 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="space-y-3 max-w-xl text-center md:text-left z-10">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-200 italic">Administrative Dashboard</h3>
          <h2 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter leading-none">Welcome back, <br />{formatName(profile)}</h2>
          <p className="text-blue-100/80 text-sm font-semibold max-w-md leading-relaxed">
            Monitor educational operations, class notes publication, and upcoming academic events uploaded by instructors.
          </p>
        </div>
        <div className="p-4 bg-white/10 backdrop-blur-md rounded-[2rem] border border-white/10 z-10 animate-pulse">
          <ActsLogo className="w-24 h-24 stroke-white filter brightness-0 invert" />
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full filter blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/20 rounded-full filter blur-3xl -ml-20 -mb-20 pointer-events-none" />
      </div>

      {/* Notifications and Submissions Section */}
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-fb-border shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-rose-50 text-rose-500 rounded-lg"><Bell size={16} className="animate-bounce" /></div>
              <h3 className="text-lg font-black text-fb-textPrimary uppercase italic tracking-tight">
                {isViewTrash ? 'Archived Event Submissions' : 'Academic Event Submissions'}
              </h3>
            </div>
            <p className="text-fb-textSecondary text-xs font-semibold">
              {isViewTrash ? 'All archived activities and exams submitted by instructors.' : 'Real-time notifications of tests, exams, and activities scheduled by course teachers.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setIsViewTrash(!isViewTrash)}
              className={`px-3.5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 border ${
                isViewTrash 
                  ? 'bg-amber-50 text-amber-600 border-amber-200 shadow-sm' 
                  : 'bg-white text-fb-textSecondary hover:bg-fb-gray border-fb-border'
              }`}
            >
              <Archive size={12} />
              <span>{isViewTrash ? 'Active Submissions' : 'Archive Folder'}</span>
            </button>

            <div className="flex bg-fb-gray p-1 rounded-xl border border-fb-border">
              {(['all', 'exams', 'activity'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${categoryFilter === cat ? 'bg-white text-fb-blue shadow-sm' : 'text-fb-textSecondary hover:text-fb-textPrimary'}`}
                >
                  {cat === 'all' ? 'All' : cat === 'exams' ? 'Exams' : 'Activities'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Search and stats bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-3">
            <input 
              type="text"
              placeholder="Search by course, teacher, or file name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-5 py-3.5 border border-fb-border rounded-2xl focus:border-fb-blue bg-fb-gray/30 text-sm font-semibold outline-none transition-all shadow-inner"
            />
          </div>
          <div className="bg-fb-gray/30 px-5 py-3.5 rounded-2xl border border-fb-border/60 flex items-center justify-between text-fb-textSecondary">
            <span className="text-[10px] font-black uppercase tracking-wider">Filtered:</span>
            <span className="font-mono text-xs font-black text-fb-blue">{filteredSubmissions.length} of {submissions.length}</span>
          </div>
        </div>

        {/* Notification feed */}
        {loading ? (
          <div className="py-24 text-center"><RefreshCw className="animate-spin text-fb-blue mx-auto" size={32} /></div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="py-24 text-center text-fb-textSecondary/40 flex flex-col items-center justify-center space-y-3">
            <FileText size={56} className="stroke-[1.2] text-fb-textSecondary/20" />
            <p className="font-black uppercase text-xs tracking-widest italic">No events or activities found</p>
            <p className="text-[10px] font-medium max-w-xs leading-normal">When teachers upload activities or exams, they will appear here as notifications immediately.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredSubmissions.map(item => (
              <div key={item.id} className="p-6 rounded-[2rem] bg-fb-gray/30 border border-fb-border/60 hover:bg-white hover:shadow-2xl hover:shadow-fb-blue/5 transition-all group flex flex-col justify-between relative overflow-hidden">
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${item.category === 'exams' ? 'bg-rose-500' : 'bg-amber-500'}`} />

                <div className="space-y-4">
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-fb-textSecondary/80 uppercase tracking-wider">{item.courseName}</span>
                      <h4 className="font-black text-fb-textPrimary capitalize italic tracking-tight text-lg leading-tight group-hover:text-fb-blue transition-colors">{item.fileName}</h4>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${item.category === 'exams' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                      {item.category === 'exams' ? 'Exam' : 'Activity'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-white/50 p-3 rounded-xl border border-fb-border/40 text-xs font-bold text-fb-textSecondary">
                    <div>
                      <span className="text-[8px] uppercase opacity-40 block">Instructor</span>
                      <span className="truncate italic text-fb-textPrimary">{item.teacherName}</span>
                    </div>
                    <div>
                      <span className="text-[8px] uppercase opacity-40 block">Submitted</span>
                      <span className="truncate font-mono text-[10px] text-fb-textPrimary">{item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-fb-blue/5 border border-fb-blue/10 rounded-xl p-3 text-fb-blue">
                    <Clock size={16} className="shrink-0" />
                    <div className="text-xs">
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Scheduled Date</p>
                      <p className="font-bold">{item.eventDate}{item.eventTime ? ` at ${item.eventTime}` : ''}</p>
                    </div>
                  </div>

                  {item.instructions && (
                    <div className="bg-white/60 p-3.5 rounded-xl border border-fb-border/40 text-xs font-semibold text-fb-textSecondary animate-in fade-in duration-200">
                      <span className="text-[8px] font-black uppercase tracking-widest block text-fb-blue mb-1">Instructions / Notes</span>
                      <p className="italic whitespace-pre-wrap leading-relaxed">{item.instructions}</p>
                    </div>
                  )}
                </div>

                 <div className="mt-5 pt-4 border-t border-fb-border/40 flex justify-between items-center gap-2">
                  <span className="text-[9px] text-fb-textSecondary/60 font-semibold truncate max-w-[120px]">ID: {item.id}</span>
                  <div className="flex items-center gap-2">
                    <a
                      href={item.fileData}
                      download={item.fileName}
                      className="flex items-center gap-1.5 py-2 px-3.5 bg-fb-blue hover:bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 cursor-pointer"
                    >
                      <Download size={11} />
                      <span>Download</span>
                    </a>
                    {!isViewTrash ? (
                      <button
                        onClick={() => handleArchiveFile(item.id, item.fileName)}
                        className="flex items-center gap-1.5 py-2 px-3.5 bg-amber-50 hover:bg-amber-100 hover:border-amber-300 text-amber-700 border border-amber-200/80 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 cursor-pointer"
                      >
                        <Archive size={11} className="transition-transform group-hover:rotate-12" />
                        <span>Archive</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleRestoreFile(item.id, item.fileName)}
                          className="flex items-center gap-1.5 py-2 px-3.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 cursor-pointer"
                        >
                          <RotateCcw size={11} />
                          <span>Restore</span>
                        </button>
                        <button
                          onClick={() => handlePermanentDeleteFile(item.id, item.fileName)}
                          className="flex items-center gap-1.5 py-2 px-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 cursor-pointer"
                        >
                          <Trash2 size={11} />
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

const Login = ({ onLoginSuccess }: { onLoginSuccess: () => void }) => {
  const [email, setEmail] = useState(''); 
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false); 
  const [error, setError] = useState('');
  
  // Load saved credentials on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('acts_saved_email');
    const savedPassword = localStorage.getItem('acts_saved_password');
    const savedRemember = localStorage.getItem('acts_remember_me') === 'true';
    
    if (savedRemember) {
      if (savedEmail) setEmail(savedEmail);
      if (savedPassword) setPassword(savedPassword);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    setLoading(true); 
    setError('');
    try { 
      await setPersistence(auth, browserSessionPersistence);
      const userCredential = await signInWithEmailAndPassword(auth, email, password); 
      const user = userCredential.user;

      // Check if Firestore profile exists
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const archivedDoc = await getDoc(doc(db, "archived_users", user.uid));

      if (!userDoc.exists() && !archivedDoc.exists()) {
        // Create default profile if missing
        const isHiddenAdmin = HIDDEN_ADMIN_EMAILS.includes(user.email || '');
        const defaultProfile: UserProfile = {
          uid: user.uid,
          email: user.email || '',
          fullName: user.email?.split('@')[0] || 'New User',
          firstName: user.email?.split('@')[0] || 'New',
          lastName: 'User',
          role: isHiddenAdmin ? 'admin' : 'student',
          status: 'Active',
          grades: []
        };
        await setDoc(doc(db, "users", user.uid), defaultProfile);
        console.log("Auto-created missing Firestore profile for:", user.email);
      } else if (userDoc.exists()) {
        // Ensure hidden admins have the admin role
        const profileData = userDoc.data() as UserProfile;
        if (HIDDEN_ADMIN_EMAILS.includes(user.email || '') && profileData.role !== 'admin') {
          await updateDoc(doc(db, "users", user.uid), { role: 'admin' });
        }
      }
      
      // Handle "Save Login" logic
      if (rememberMe) {
        localStorage.setItem('acts_saved_email', email);
        localStorage.setItem('acts_saved_password', password);
        localStorage.setItem('acts_remember_me', 'true');
      } else {
        localStorage.removeItem('acts_saved_email');
        localStorage.removeItem('acts_saved_password');
        localStorage.setItem('acts_remember_me', 'false');
      }
      
      onLoginSuccess(); 
    } catch (err: any) { 
      setError('Incorrect Email/Password'); 
      setLoading(false); 
    } 
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-fb-gray p-4">
      <div className="w-full max-w-md bg-white p-12 rounded-[2.5rem] shadow-2xl text-center space-y-10 animate-in fade-in zoom-in-95 duration-300">
        <ActsLogo className="w-24 h-24 mx-auto" /><h2 className="text-4xl font-black uppercase italic tracking-tighter text-fb-textPrimary">Acts Portal</h2>
        <form onSubmit={handleLogin} className="space-y-6 text-left">
          {error && <div className="p-4 bg-red-50 text-red-600 text-xs font-bold border-l-4 border-red-500 rounded-lg">{error}</div>}
          <FormField label="Email Address" name="email" value={email} type="email" onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
          <FormField label="Password" name="password" value={password} type="password" onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          
          <div className="flex items-center px-1">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="relative flex items-center">
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-fb-gray text-fb-blue focus:ring-fb-blue transition-all cursor-pointer appearance-none checked:bg-fb-blue checked:border-fb-blue"
                />
                <Check size={14} className={`absolute left-0.5 text-white transition-opacity pointer-events-none ${rememberMe ? 'opacity-100' : 'opacity-0'}`} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary group-hover:text-fb-textPrimary transition-colors">Save Login</span>
            </label>
          </div>

          <button disabled={loading} className="w-full bg-fb-blue text-white py-5 rounded-2xl font-black uppercase text-xs tracking-[0.3em] shadow-xl shadow-fb-blue/20 active:scale-95 disabled:opacity-50 transition-all">Login</button>
        </form>
      </div>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [kickedOut, setKickedOut] = useState(false);
  const isSessionEstablishedRef = useRef(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => { 
      setUser(u); 
      if (!u) { 
        setProfile(null); 
        setLoading(false); 
        isSessionEstablishedRef.current = false;
      } else { 
        setLoading(true);
        setActivePage('dashboard'); 
        setKickedOut(false);
      } 
    });
  }, []);

  useEffect(() => {
    if (user) {
      return onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (snap.exists()) {
          const profileData = snap.data() as UserProfile;
          const localSessionId = sessionStorage.getItem('acts_session_id');
          
          if (profileData.currentSessionId && profileData.currentSessionId !== localSessionId) {
            if (isSessionEstablishedRef.current) {
              setKickedOut(true);
              signOut(auth);
              isSessionEstablishedRef.current = false;
            } else {
              // Automatically claim the session for the new login
              const newSessionId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
              sessionStorage.setItem('acts_session_id', newSessionId);
              updateDoc(doc(db, "users", user.uid), { currentSessionId: newSessionId });
              isSessionEstablishedRef.current = true;
              setProfile(profileData);
            }
          } else {
            let currentLocalSessionId = localSessionId;
            if (!currentLocalSessionId) {
              currentLocalSessionId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
              sessionStorage.setItem('acts_session_id', currentLocalSessionId);
              updateDoc(doc(db, "users", user.uid), { currentSessionId: currentLocalSessionId });
            } else if (profileData.currentSessionId !== currentLocalSessionId) {
              updateDoc(doc(db, "users", user.uid), { currentSessionId: currentLocalSessionId });
            }
            isSessionEstablishedRef.current = true;
            setProfile(profileData);
          }
        } else {
          // If not in users, check archived_users for potential session
          getDoc(doc(db, "archived_users", user.uid)).then(snapArch => {
             if (snapArch.exists()) {
               setProfile(snapArch.data() as UserProfile);
             } else {
               console.warn("User profile document not found in Firestore.");
               setProfile(null);
             }
             setLoading(false);
          });
          return;
        }
        setLoading(false);
      }, (error) => {
        console.error("Profile Load Error:", error);
        setLoading(false);
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      });
    }
  }, [user]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-white"><RefreshCw className="animate-spin text-fb-blue" size={40} /></div>;
  if (kickedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fb-gray p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-fb-textPrimary">Session Expired</h2>
          <p className="text-fb-textSecondary">
            Your session has expired because someone else logged into this account from another device or browser.
          </p>
          <button onClick={() => setKickedOut(false)} className="w-full bg-fb-blue text-white py-3 rounded-xl font-bold hover:bg-blue-600 transition-all">Return to Login</button>
        </div>
      </div>
    );
  }
  if (!user) return <Login onLoginSuccess={() => setActivePage('dashboard')} />;
  
  const isArchived = profile?.status === 'Archived';
  if (user && (!profile || isArchived)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fb-gray p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-fb-textPrimary">Invalid Account</h2>
          <p className="text-fb-textSecondary">
            {isArchived 
              ? "Your account has been deactivated. Please contact an administrator if you believe this is an error."
              : "Your account data could not be found. It may have been deleted or your email address may have been updated. Please contact an administrator."}
          </p>
          <button onClick={() => signOut(auth)} className="w-full bg-fb-blue text-white py-3 rounded-xl font-bold hover:bg-blue-600 transition-all">Sign Out</button>
        </div>
      </div>
    );
  }
  
  const isAdmin = profile?.role === 'admin';
  const isExecutive = profile?.role === 'president' || profile?.role === 'vice president';
  const isTeacher = profile?.role === 'teacher';
  const hasAdminView = isAdmin || isExecutive || isTeacher;
  const isStudent = profile?.role === 'student';

  const renderContent = () => {
    switch (activePage) {
      case 'dashboard': return <StudentDashboard profile={profile} />;
      case 'profile': return <ProfilePage profile={profile} />;
      case 'records': return profile ? <StudentGradesView profile={profile} /> : null;
      case 'calendar': return profile ? <StudentCalendarView profile={profile} /> : null;
      case 'admin': return (!isTeacher && hasAdminView) ? <AdminPanel profile={profile} /> : <PermissionDeniedGate message="Admin Role Required" />;
      case 'grades': return hasAdminView && profile ? (profile.role === 'teacher' ? <TeacherGradesView profile={profile} /> : <SubmitGrades adminProfile={profile} />) : <PermissionDeniedGate message="Admin Role Required" />;
      case 'courses': return isAdmin ? <CourseManagementPage profile={profile} /> : <PermissionDeniedGate message="Admin Role Required" />;
      case 'attendance': return isAdmin && profile ? <AttendanceTracker profile={profile} /> : <PermissionDeniedGate message="Admin Role Required" />;
      case 'upload_files': return isTeacher && profile ? <TeacherUploadFilesView profile={profile} /> : null;
      default: return <StudentDashboard profile={profile} />;
    }
  };

  const handleLogout = async () => {
    if (user) {
      try {
        await updateDoc(doc(db, "users", user.uid), { currentSessionId: null });
      } catch (error) {
        console.error("Error clearing session ID:", error);
      }
    }
    await signOut(auth);
  };

  return (
    <div className="min-h-screen flex bg-fb-gray text-fb-textPrimary font-sans">
      {isSidebarOpen && <div className="fixed inset-0 bg-fb-textPrimary/40 backdrop-blur-[2px] z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white transform transition-transform duration-300 lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} border-r border-fb-border`}>
        <div className="flex flex-col h-full py-10">
          <div className="px-8 mb-12 flex items-center gap-4"><ActsLogo className="w-12 h-12" /><h1 className="text-3xl font-black italic uppercase text-fb-blue tracking-tighter">Acts</h1></div>
          <nav className="flex-1 space-y-2">
            <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activePage === 'dashboard'} onClick={() => {setActivePage('dashboard'); setSidebarOpen(false)}} />
            <SidebarItem icon={UserIcon} label="My Profile" active={activePage === 'profile'} onClick={() => {setActivePage('profile'); setSidebarOpen(false)}} />
            {isStudent && (
              <>
                <SidebarItem icon={GraduationCap} label="Records" active={activePage === 'records'} onClick={() => {setActivePage('records'); setSidebarOpen(false)}} />
                <SidebarItem icon={CalendarIcon} label="Schedule" active={activePage === 'calendar'} onClick={() => {setActivePage('calendar'); setSidebarOpen(false)}} />
              </>
            )}
            {hasAdminView && (
              <>
                {!isTeacher && <SidebarItem icon={Users} label="Accounts" active={activePage === 'admin'} onClick={() => {setActivePage('admin'); setSidebarOpen(false)}} />}
                {isAdmin && (
                  <>
                    <SidebarItem icon={Briefcase} label="Course" active={activePage === 'courses'} onClick={() => {setActivePage('courses'); setSidebarOpen(false)}} />
                    <SidebarItem icon={CheckSquare} label="Attendance" active={activePage === 'attendance'} onClick={() => {setActivePage('attendance'); setSidebarOpen(false)}} />
                  </>
                )}
                {(isExecutive || isTeacher || isAdmin) && <SidebarItem icon={CalendarIcon} label="Schedule" active={activePage === 'calendar'} onClick={() => {setActivePage('calendar'); setSidebarOpen(false)}} />}
                {isTeacher && <SidebarItem icon={Upload} label="Upload Files" active={activePage === 'upload_files'} onClick={() => {setActivePage('upload_files'); setSidebarOpen(false)}} />}
                <SidebarItem icon={GraduationCap} label={isTeacher ? "Grades" : "Records"} active={activePage === 'grades'} onClick={() => {setActivePage('grades'); setSidebarOpen(false)}} />
              </>
            )}
          </nav>
          <div className="px-6 mt-auto">
            <button onClick={handleLogout} className="w-full flex items-center justify-center space-x-3 py-4 rounded-2xl bg-fb-gray hover:bg-rose-50 hover:text-rose-600 text-[10px] font-black uppercase tracking-widest transition-all"><LogOut size={16} /><span>Logout</span></button>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-20 flex items-center px-6 border-b bg-white lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-fb-gray rounded-xl"><Menu size={26} /></button>
          <h1 className="ml-4 text-xl font-black italic uppercase text-fb-blue">Acts</h1>
        </header>
        <div className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar">
          <div className="max-w-6xl mx-auto">{renderContent()}</div>
        </div>
      </main>
    </div>
  );
};

const rootEl = document.getElementById('root');
if (rootEl) createRoot(rootEl).render(<App />);
