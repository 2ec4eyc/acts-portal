sed -i 's/const isEditing = editingGradeId === item.id;/const isEditing = editingGradeId === item.id;\n                          const canEditGrade = adminProfile.role !== '\''teacher'\'' || item.instructorId === adminProfile.uid || item.professor === formatName(adminProfile);/g' index.tsx

sed -i 's/<div className="flex justify-end gap-2 mt-1">/& {canEditGrade \&\& (/g' index.tsx
sed -i 's/<Edit2 size={12} \/>\n                                        <\/button>\n                                      )}/&\n                                      )}/g' index.tsx
