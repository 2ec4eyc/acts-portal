const fs = require('fs');
let code = fs.readFileSync('index.tsx', 'utf8');

const targetStr = `      const promises = Object.values(attendanceRecords).map((record: AttendanceRecord) => {`;
const replacementStr = `      const finalRecords = enrolledStudents.map(student => {
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

      const promises = finalRecords.map((record: any) => {`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replacementStr);
    fs.writeFileSync('index.tsx', code);
    console.log('Fixed handleSave');
} else {
    console.log('Target string not found');
}
