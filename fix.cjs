const fs = require('fs');
let code = fs.readFileSync('index.tsx', 'utf8');

// The injected code is identical to attendance.tsx content
const injectedCode = fs.readFileSync('attendance.tsx', 'utf8');

// I will remove all occurrences of injectedCode, except maybe the last one? No, I will remove ALL.
let occurrences = 0;
while(code.includes(injectedCode)) {
    code = code.replace(injectedCode, '');
    occurrences++;
}
console.log('Removed occurrences:', occurrences);

// Now I will insert it properly BEFORE const SubmitGrades = 
if (occurrences > 0 || true) {
    code = code.replace('const SubmitGrades = ({ adminProfile }', injectedCode + '\n\nconst SubmitGrades = ({ adminProfile }');
    fs.writeFileSync('index.tsx', code);
    console.log('Inserted properly.');
}
