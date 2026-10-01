import { useState, useEffect } from 'react';
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
  History,
  Megaphone,
  Settings as SettingsIcon,
} from 'lucide-react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';

import { ActsLogo } from './components/ActsLogo';
import { NotificationBell } from './components/NotificationBell';
import { PermissionDeniedGate } from './components/PermissionDeniedGate';
import { SidebarItem } from './components/SidebarItem';
import { ApiError, claimSession, hasSession, releaseSession, setSessionReplacedHandler } from './lib/api';
import { fetchMyProfile } from './lib/data';
import { auth } from './lib/firebase';
import { live } from './lib/live';
import { DEFAULT_FEATURES, fetchPublicSettings, type Features } from './lib/settings';
import { AdminPanel } from './pages/AdminPanel';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { AttendanceTracker } from './pages/AttendanceTracker';
import { AuditLogPage } from './pages/AuditLogPage';
import { CourseManagementPage } from './pages/CourseManagementPage';
import { Login } from './pages/Login';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
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
  const [accountArchived, setAccountArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [kickedOut, setKickedOut] = useState(false);
  const [features, setFeatures] = useState<Features>(DEFAULT_FEATURES);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => { 
      setUser(u); 
      if (!u) { 
        setProfile(null); 
        setAccountArchived(false);
        setLoading(false); 
      } else { 
        setLoading(true);
        setActivePage('dashboard'); 
        setKickedOut(false);
      } 
    });
  }, []);

  // Feature switches (Settings page). Cached by the CDN; re-checked every 30 s and on tab focus.
  useEffect(() => live(fetchPublicSettings, (s) => setFeatures(s.features), () => {}), []);

  // Another sign-in to this account replaced this tab's session: sign out here.
  useEffect(() => {
    setSessionReplacedHandler(() => {
      sessionStorage.removeItem('acts_session_id');
      setKickedOut(true);
      signOut(auth);
    });
    return () => setSessionReplacedHandler(null);
  }, []);

  useEffect(() => {
    if (!user) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      // A fresh sign-in (or a new tab) claims the account's session; a reload keeps its own.
      if (!hasSession()) await claimSession().catch(() => {});
      if (cancelled) return;
      stop = live(fetchMyProfile, (data) => {
        setProfile(data);
        setAccountArchived(false);
        setLoading(false);
      }, (error) => {
        if (error instanceof ApiError && error.status === 403) {
          // No portal account for this login, or it has been deactivated.
          setProfile(null);
          setAccountArchived(error.message === 'Account deactivated');
        } else {
          console.error("Profile Load Error:", error);
        }
        setLoading(false);
      });
    })();
    return () => { cancelled = true; stop?.(); };
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
  
  const isArchived = accountArchived || profile?.status === 'Archived';
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
      case 'calendar': return profile && (!isStudent || features.studentSchedule) ? <StudentCalendarView profile={profile} /> : <StudentDashboard profile={profile} />;
      case 'admin': return (!isTeacher && hasAdminView) ? <AdminPanel profile={profile} /> : <PermissionDeniedGate message="Admin Role Required" />;
      case 'grades': return hasAdminView && profile ? (profile.role === 'teacher' ? <TeacherGradesView profile={profile} /> : <SubmitGrades adminProfile={profile} />) : <PermissionDeniedGate message="Admin Role Required" />;
      case 'courses': return isAdmin ? <CourseManagementPage profile={profile} /> : <PermissionDeniedGate message="Admin Role Required" />;
      case 'attendance': return isAdmin && profile ? <AttendanceTracker profile={profile} /> : <PermissionDeniedGate message="Admin Role Required" />;
      case 'announcements': return isAdmin ? <AnnouncementsPage /> : <PermissionDeniedGate message="Admin Role Required" />;
      case 'audit': return isAdmin ? <AuditLogPage /> : <PermissionDeniedGate message="Admin Role Required" />;
      case 'settings': return isAdmin ? <SettingsPage /> : <PermissionDeniedGate message="Admin Role Required" />;
      case 'upload_files': return isTeacher && profile ? <TeacherUploadFilesView profile={profile} /> : null;
      default: return <StudentDashboard profile={profile} />;
    }
  };

  const handleLogout = async () => {
    try {
      await releaseSession();
    } catch (error) {
      console.error("Error clearing session ID:", error);
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
                {features.studentSchedule && <SidebarItem icon={CalendarIcon} label="Schedule" active={activePage === 'calendar'} onClick={() => {setActivePage('calendar'); setSidebarOpen(false)}} />}
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
                {isAdmin && (
                  <>
                    {features.announcements && <SidebarItem icon={Megaphone} label="Announcements" active={activePage === 'announcements'} onClick={() => {setActivePage('announcements'); setSidebarOpen(false)}} />}
                    <SidebarItem icon={History} label="Audit Log" active={activePage === 'audit'} onClick={() => {setActivePage('audit'); setSidebarOpen(false)}} />
                    <SidebarItem icon={SettingsIcon} label="Settings" active={activePage === 'settings'} onClick={() => {setActivePage('settings'); setSidebarOpen(false)}} />
                  </>
                )}
              </>
            )}
          </nav>
          <div className="px-6 mt-auto">
            <button onClick={handleLogout} className="w-full flex items-center justify-center space-x-3 py-4 rounded-2xl bg-fb-gray hover:bg-rose-50 hover:text-rose-600 text-[10px] font-black uppercase tracking-widest transition-all"><LogOut size={16} /><span>Logout</span></button>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 lg:h-14 shrink-0 flex items-center px-4 md:px-6 lg:px-10 border-b bg-white">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="p-2 hover:bg-fb-gray rounded-xl lg:hidden"><Menu size={26} /></button>
          <h1 className="ml-3 text-xl font-black italic uppercase text-fb-blue lg:hidden">Acts</h1>
          <div className="ml-auto"><NotificationBell onOpenLink={(page) => setActivePage(page)} /></div>
        </header>
        <div className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar">
          <div className="max-w-6xl mx-auto">{renderContent()}</div>
        </div>
      </main>
    </div>
  );
};
