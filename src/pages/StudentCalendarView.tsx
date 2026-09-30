import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';

import { CourseCalendar } from '../components/CourseCalendar';
import { CalendarDayModal } from '../components/modals/CalendarDayModal';
import { db } from '../lib/firebase';
import { OperationType, handleFirestoreError } from '../lib/firestoreErrors';
import { formatName } from '../lib/format';
import type { Course, UserProfile } from '../types';

export const StudentCalendarView = ({ profile }: { profile: UserProfile }) => {
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
