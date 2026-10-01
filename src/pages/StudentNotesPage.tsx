import { useEffect, useState } from 'react';
import { AlertCircle, BookOpen, CalendarClock, Download, ExternalLink, RefreshCw } from 'lucide-react';

import { downloadMaterial, fetchCourses, fetchFiles, type UploadedFile } from '../lib/data';
import { live } from '../lib/live';
import { toast } from '../lib/toast';
import type { Course } from '../types';

const WEEK_MS = 7 * 86_400_000;
const size = (n: number | null) => (n === null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const day = (seconds?: number) => (seconds ? new Date(seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const eventDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const Item = ({ f }: { f: UploadedFile; key?: string }) => {
  const fresh = f.createdAt && Date.now() - f.createdAt.seconds * 1000 < WEEK_MS;
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="shrink-0 p-2 rounded-xl bg-fb-blue/5 text-fb-blue">{f.linkUrl ? <ExternalLink size={16} /> : <BookOpen size={16} />}</span>
      <span className="flex-1 min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-sm text-fb-textPrimary break-words">{f.fileName}</span>
          {fresh && <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase">New</span>}
        </span>
        <span className="block text-xs text-fb-textSecondary">
          {[f.linkUrl ? 'Link' : size(f.sizeBytes), f.teacherName, day(f.createdAt?.seconds)].filter(Boolean).join(' · ')}
        </span>
        {f.eventDate && (
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-fb-blue">
            <CalendarClock size={12} /> {eventDay(f.eventDate)}{f.eventTime ? `, ${f.eventTime}` : ''}
          </span>
        )}
        {f.instructions && <span className="block text-xs text-fb-textSecondary whitespace-pre-wrap mt-1">{f.instructions}</span>}
      </span>
      <button type="button" onClick={() => downloadMaterial(f).catch((e) => toast.error(`Couldn't open it: ${e.message}`))}
        aria-label={f.linkUrl ? `Open ${f.fileName}` : `Open ${f.fileName}`}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-fb-border text-[10px] font-black uppercase tracking-wider hover:bg-fb-hover">
        {f.linkUrl ? <ExternalLink size={12} /> : <Download size={12} />} Open
      </button>
    </li>
  );
};

/** A student's notes, exams and activities, by course (only the courses they're enrolled in). */
export const StudentNotesPage = () => {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [files, setFiles] = useState<UploadedFile[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => live(fetchCourses, (c) => setCourses(c.filter((x) => x.status !== 'archived')), (e) => setError((e as Error).message)), []);
  useEffect(() => live(() => fetchFiles(), setFiles, (e) => setError((e as Error).message)), []);

  const today = new Date().toISOString().slice(0, 10);
  const byCourse = (courseId: string) => {
    const mine = (files ?? []).filter((f) => f.courseId === courseId && !f.archived);
    const notes = mine.filter((f) => f.category === 'notes').sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    const coming = mine.filter((f) => f.category !== 'notes' && (f.eventDate ?? '') >= today)
      .sort((a, b) => (a.eventDate ?? '').localeCompare(b.eventDate ?? ''));
    return { notes, coming };
  };

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-black text-fb-textPrimary italic tracking-tight">Course Notes</h1>
        <p className="text-sm text-fb-textSecondary">Notes, links, upcoming exams and activities posted by your teachers, for each of your courses.</p>
      </div>
      {error && <p role="alert" className="text-sm font-bold text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</p>}
      {(!courses || !files) && !error && <p className="text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>}
      {courses?.length === 0 && <p className="text-sm text-fb-textSecondary">You aren't enrolled in any courses yet.</p>}
      {courses && files && courses.map((c) => {
        const { notes, coming } = byCourse(c.id);
        return (
          <section key={c.id} aria-label={c.name} className="bg-white rounded-xl border border-fb-border shadow-sm">
            <header className="px-4 md:px-5 py-3 border-b border-fb-border">
              <h2 className="font-black text-fb-textPrimary">{c.name}</h2>
              <p className="text-xs text-fb-textSecondary">{[c.professor, c.semester.replace('Semester', 'Term'), c.schoolYear && `SY ${c.schoolYear}`].filter(Boolean).join(' · ')}</p>
            </header>
            <div className="px-4 md:px-5 pb-2">
              {coming.length > 0 && (
                <>
                  <h3 className="pt-3 text-[10px] font-black uppercase tracking-widest text-rose-700">Coming up</h3>
                  <ul className="divide-y divide-fb-border">{coming.map((f) => <Item key={f.id} f={f} />)}</ul>
                </>
              )}
              <h3 className="pt-3 text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">Notes</h3>
              {notes.length === 0
                ? <p className="py-3 text-sm text-fb-textSecondary">No notes yet.</p>
                : <ul className="divide-y divide-fb-border">{notes.map((f) => <Item key={f.id} f={f} />)}</ul>}
            </div>
          </section>
        );
      })}
    </div>
  );
};
