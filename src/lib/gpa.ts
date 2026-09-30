import type { UserProfile } from '../types';

export const calculateGPA = (student: UserProfile) => {
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
