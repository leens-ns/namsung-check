export function buildAttendancePayload(student, record, updatedBy, updatedAt) {
  if (record.studentId !== student.id || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) throw new Error("출결 문서 식별자가 일치하지 않습니다.");
  return { studentId: record.studentId, date: record.date,
    grade: String(record.grade ?? student.grade), classNo: String(record.classNo ?? student.classNo),
    departments: [...(Array.isArray(record.departments) ? record.departments : student.departments || [])],
    status: record.status, memo: record.memo || "", updatedBy, updatedAt };
}
