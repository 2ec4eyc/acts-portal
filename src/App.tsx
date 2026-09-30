import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  User as UserIcon,
  Users,
  GraduationCap,
  Calendar as CalendarIcon,
  AlertCircle,
  RefreshCw,
  Menu,
  Briefcase,
  CheckSquare,
  LogOut,
  Upload,
} from 'lucide-react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, updateDoc, onSnapshot, getDoc } from 'firebase/firestore';

import { ActsLogo } from './components/ActsLogo';
import { PermissionDeniedGate } from './components/PermissionDeniedGate';
import { SidebarItem } from './components/SidebarItem';
import { auth, db } from './lib/firebase';
import { OperationType, handleFirestoreError } from './lib/firestoreErrors';
import { AdminPanel } from './pages/AdminPanel';
import { AttendanceTracker } from './pages/AttendanceTracker';
import { CourseManagementPage } from './pages/CourseManagementPage';
import { Login } from './pages/Login';
import { ProfilePage } from './pages/ProfilePage';
import { StudentCalendarView } from './pages/StudentCalendarView';
import { StudentDashboard } from './pages/StudentDashboard';
import { StudentGradesView } from './pages/StudentGradesView';
import { SubmitGrades } from './pages/SubmitGrades';
import { TeacherGradesView } from './pages/TeacherGradesView';
import { TeacherUploadFilesView } from './pages/TeacherUploadFilesView';
import type { UserProfile } from './types';

export const App = () => {
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
