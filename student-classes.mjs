export function uniqueStudentClasses(students) {
  const classes = new Map();
  for (const student of students || []) {
    if (!student) continue;
    const grade = String(student.grade ?? "").trim();
    const classNo = String(student.classNo ?? "").trim();
    if (!grade || !classNo) continue;
    classes.set(`${grade}-${classNo}`, { grade, classNo });
  }
  return [...classes.values()].sort((a, b) =>
    a.grade.localeCompare(b.grade, "en", { numeric: true })
    || a.classNo.localeCompare(b.classNo, "en", { numeric: true })
  );
}
