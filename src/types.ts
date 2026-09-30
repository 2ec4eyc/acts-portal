export interface Grade {
  id: string;
  courseName: string;
  gradeValue: number | '';
  isIncomplete: boolean;
  dateReleased: string;
  yearLevel?: '1st Year' | '2nd Year';
  semester?: '1st Semester' | '2nd Semester' | '3rd Semester';
}

export interface EditHistoryEntry {
  id: string;
  editedBy: string;
  action: string;
  timestamp: string;
  details: string;
}

export interface UserProfile {
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

export interface Course {
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

export interface AttendanceRecord {
  id: string;
  courseId: string;
  date: string;
  studentId: string;
  status: 'present' | 'absent';
  isExcused?: boolean;
  notes?: string;
  createdAt: any;
}
