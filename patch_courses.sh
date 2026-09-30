sed -i '/const \[dayDetailData/a\
  const [teachers, setTeachers] = useState([] as UserProfile[]);' index.tsx
sed -i '/let unsubTrash = () => {};/i\
    const unsubTeachers = onSnapshot(query(collection(db, "users"), where("role", "==", "teacher")), (snapshot) => {\n      const list: UserProfile[] = [];\n      snapshot.forEach(docSnap => list.push({ ...docSnap.data() as UserProfile, uid: docSnap.id }));\n      setTeachers(list);\n    });' index.tsx
sed -i 's/return () => { unsubActive(); unsubTrash(); };/return () => { unsubActive(); unsubTrash(); unsubTeachers(); };/' index.tsx
