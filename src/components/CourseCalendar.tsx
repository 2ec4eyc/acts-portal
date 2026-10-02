import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { occursOn } from '../lib/schedule';
import type { Course } from '../types';

export const CourseCalendar = ({ courses, onDayClick }: { courses: Course[], onDayClick: (date: string, courses: Course[]) => void }) => {
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
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return courses.filter((c) => occursOn(c, dateStr));
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-xl border border-fb-border overflow-hidden animate-in fade-in duration-500">
      <div className="bg-fb-blue p-4 md:p-8 flex items-center justify-between text-white">
        <div>
          <h3 className="text-lg md:text-2xl font-black uppercase italic tracking-tighter leading-none">{monthName}</h3>
          <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.4em] opacity-40 mt-1">{year}</p>
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
                    {/* Phones: a colored bar per class (tap the day for names); larger screens: the names. */}
                    {coursesForDay.slice(0, 3).map(c => (
                      <div key={c.id} title={c.name} aria-label={c.name} className={`h-1.5 md:h-auto px-0 md:px-2.5 py-0 md:py-1.5 rounded-full md:rounded-xl md:border-l-[3px] md:shadow-sm md:text-[9px] font-bold truncate transition-transform hover:translate-x-1 ${c.yearLevel === '1st Year' ? 'bg-blue-400 md:bg-blue-50 md:border-blue-400 md:text-blue-800' : 'bg-emerald-400 md:bg-emerald-50 md:border-emerald-400 md:text-emerald-800'}`}>
                        <p className="hidden md:block uppercase italic leading-none">{c.name}</p>
                      </div>
                    ))}
                    {coursesForDay.length > 3 && (
                      <p className="text-[9px] font-black text-fb-textSecondary uppercase italic ml-1 md:ml-1.5 mt-1 md:mt-2 opacity-60">+{coursesForDay.length - 3}</p>
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
