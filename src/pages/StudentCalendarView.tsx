import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

import { CourseCalendar } from '../components/CourseCalendar';
import { CalendarDayModal } from '../components/modals/CalendarDayModal';
import { fetchCourses } from '../lib/data';
import { live } from '../lib/live';
import { formatName } from '../lib/format';
import type { Course, UserProfile } from '../types';

export const StudentCalendarView = ({ profile }: { profile: UserProfile }) => {
  const [courses, setCourses] = useState([] as Course[]);
  const [loading, setLoading] = useState(true);
  const [dayDetailData, setDayDetailData] = useState(null as { date: string, courses: Course[] } | null);
  const [teachers, setTeachers] = useState([] as UserProfile[]);

  const enrolledIdsStr = JSON.stringify(profile.grades?.map(g => g.id) || []);

  useEffect(() => {
    return live(fetchCourses, (all) => {
      const list: Course[] = [];
      const enrolledIds = profile.grades?.map(g => g.id) || [];
      
      all.forEach(data => {
        // Students: the server only sends the courses they're enrolled in (their own Day/Night school and
        // year level); the enrollment check here is a second guard. Teachers: the courses they teach.
        let shouldInclude = false;
        if (profile.role === 'teacher') {
          shouldInclude = data.instructorId === profile.uid || data.professor === formatName(profile);
        } else if (profile.role === 'president' || profile.role === 'vice president' || profile.role === 'admin') {
          shouldInclude = true;
        } else if (profile.role === 'student') {
          shouldInclude = enrolledIds.includes(data.id);
        }
        
        if (shouldInclude && data.status !== 'archived') {
          list.push(data);
        }
      });
      setCourses(list);
      setLoading(false);
    }, (error) => {
      setLoading(false);
    });
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
