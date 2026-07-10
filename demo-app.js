const DEMO_KEY = "nsworld-attendance-demo-v1";
const ADMIN_EMAIL = "leens@nsworld.net";
const ORIGINAL_TITLE = document.title;
const statusLabel = { present: "출석", late: "지각", absent: "결석", early: "조퇴", unset: "미입력" };
const roleLabel = { admin: "관리자", teacher: "교사", coach: "방과후강사", external: "외부수업강사" };
const DEFAULT_AFTERSCHOOL_COURSES = {
  monday: ["교육마술", "로봇 & 코딩", "무용", "미디어 스타", "바이올린", "배구", "스페인어", "창의미술", "창의요리", "첼로", "클라리넷", "프랑스(L.F.E)", "프랑스어", "플루트", "AI Makers", "Book Club", "English STEAM", "Musical", "STEAM"],
  friday: ["그래비트랙스", "대화영어", "로봇 & 코딩", "바이올린", "배구", "스케이트보드", "영화(영상)제작", "첼로", "치어리딩", "클라리넷", "클레이", "플루트", "C.E.(Conver~)", "D&D", "D&D(원어민)", "English STEAM", "Speech", "STEAM", "TED"]
};

const sampleStudents = [
  { id: "demo-001", name: "예시학생01", grade: "3", classNo: "1", number: "4", department: "로봇 & 코딩", parentPhone: "000-0000-0000" },
  { id: "demo-002", name: "예시학생02", grade: "3", classNo: "2", number: "8", department: "로봇 & 코딩", parentPhone: "000-0000-0000" },
  { id: "demo-003", name: "예시학생03", grade: "4", classNo: "1", number: "13", department: "바이올린", parentPhone: "000-0000-0000" },
  { id: "demo-004", name: "예시학생04", grade: "4", classNo: "3", number: "2", department: "배구", parentPhone: "000-0000-0000" },
  { id: "demo-005", name: "예시학생05", grade: "5", classNo: "2", number: "11", department: "창의미술", parentPhone: "000-0000-0000" },
  { id: "demo-006", name: "예시학생06", grade: "5", classNo: "3", number: "7", department: "English STEAM", parentPhone: "000-0000-0000" },
  { id: "demo-007", name: "예시학생07", grade: "6", classNo: "1", number: "9", department: "AI Makers", parentPhone: "000-0000-0000" },
  { id: "demo-008", name: "예시학생08", grade: "6", classNo: "2", number: "6", department: "클라리넷", parentPhone: "000-0000-0000" }
];

const state = loadState();
let session = null;
let activeFilter = "all";
let editingStudentId = null;
let notificationRegistration = null;
let attendanceClassInitialized = false;
let activeAttendanceDate = todayKey();

const els = Object.fromEntries([
  "loginScreen", "loginError", "userPicture", "userName", "userEmail", "userRole", "logoutBtn", "todayText", "notificationEnableHeaderBtn", "notificationCenterBtn", "notificationButtonLabel", "notificationBadge", "notificationDialog", "notificationList", "clearNotificationsBtn",
  "attendanceTab", "lookupTab", "settingsTab", "attendanceDayNotice", "studentSearch", "classFilter", "studentGrid", "markUnsetPresentBtn", "markAllPresentBtn", "addStudentBtn", "currentRosterCount", "reviewBtn", "clearTodayBtn", "saveStatusText",
  "reviewDialog", "reviewList", "confirmSaveBtn", "alarmDialog", "alarmDialogTitle", "alarmDialogBody", "lookupDate", "lookupDepartment", "refreshLookupBtn",
  "lookupTable", "csvFileInput", "importBtn", "morningTime", "reviewTime", "coachReviewTime", "testPopupBtn",
  "enableNotificationsBtn", "maskContactDefault", "adminEmailInput", "addAdminBtn", "adminList", "coachEmailInput", "coachDepartmentInput", "addCoachBtn", "coachCsvFileInput", "importCoachesBtn", "coachList", "mondayDepartmentInput", "addMondayDepartmentBtn", "mondayDepartmentList", "fridayDepartmentInput", "addFridayDepartmentBtn", "fridayDepartmentList", "unregisteredDepartmentNotice", "maxClassesPerGrade", "teacherEmailInput", "teacherClassSelect", "addTeacherBtn", "teacherBulkInput", "bulkAssignTeachersBtn", "teacherList",
  "studentDialog", "studentDialogTitle", "studentNameInput", "studentGradeInput", "studentClassInput", "studentNumberInput", "studentAfterschoolNone", "studentAfterschoolEnrolled", "studentAfterschoolDays", "studentMondayToggle", "studentMondayDepartment", "studentFridayToggle", "studentFridayDepartment", "saveStudentBtn",
  "statusStrip", "presentCountItem", "lateCountItem", "earlyCountItem", "absentCountItem", "unsetCountItem", "presentCount", "lateCount", "earlyCount", "absentCount", "unsetCount"
].map((id) => [id, document.getElementById(id)]));

init();

async function init() {
  seedDemoHistory();
  els.todayText.textContent = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date());
  els.lookupDate.value = todayKey();
  els.morningTime.value = state.settings.morningTime;
  els.reviewTime.value = state.settings.reviewTime;
  els.coachReviewTime.value = state.settings.coachReviewTime;
  bindEvents();
  state.notifications ||= [];
  notificationRegistration = await registerNotificationWorker();
  updateNotificationPermissionUi();
  updateNotificationBadge();
  setInterval(() => { checkDateRollover(); checkAlarms(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkDateRollover(); });
  window.addEventListener("focus", checkDateRollover);
}

function seedDemoHistory() {
  if (state.demoHistorySeeded) return;
  const now = new Date();
  let addedDays = 0;
  for (let day = Math.max(1, now.getDate() - 10); day < now.getDate() && addedDays < 6; day += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    state.records[key] ||= {};
    state.students.forEach((student, index) => {
      if (state.records[key][student.id]) return;
      const marker = (index + addedDays * 3) % 19;
      const status = marker === 0 ? "absent" : marker === 5 ? "late" : marker === 11 ? "early" : "present";
      state.records[key][student.id] = { status, memo: "", saved: true };
    });
    addedDays += 1;
  }
  state.demoHistorySeeded = true;
  saveState();
}

function loadState() {
  const fallback = {
    students: sampleStudents,
    records: {},
    admins: { [ADMIN_EMAIL]: true },
    coaches: { "coach-demo@example.com": "로봇 & 코딩" },
    externals: { "external-demo@example.com": { course: "외부수업", classes: ["4-1"] } },
    teachers: { "teacher-demo@example.com": { grade: "3", classNo: "1" } },
    settings: { contactVisible: false, morningTime: "08:30", reviewTime: "14:05", coachReviewTime: "14:10", notificationSettingsVersion: 3, attendanceDays: [1, 5], maxClassesPerGrade: 3, lastMorning: "", lastReview: "", lastCoachReview: "", afterschoolCourses: structuredClone(DEFAULT_AFTERSCHOOL_COURSES) },
    notifications: []
  };
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_KEY) || "{}");
    const settings = { ...fallback.settings, ...(saved.settings || {}), afterschoolCourses: { ...fallback.settings.afterschoolCourses, ...(saved.settings?.afterschoolCourses || {}) } };
    if (Number(settings.notificationSettingsVersion || 0) < 3) Object.assign(settings, { reviewTime: "14:05", coachReviewTime: "14:10", notificationSettingsVersion: 3 });
    settings.attendanceDays = [...new Set((Array.isArray(settings.attendanceDays) ? settings.attendanceDays : [1, 5]).map(Number).filter((day) => day >= 1 && day <= 5))];
    settings.maxClassesPerGrade = Math.min(10, Math.max(1, Math.trunc(Number(settings.maxClassesPerGrade) || 3)));
    return { ...fallback, ...saved, admins: { ...fallback.admins, ...(saved.admins || {}) }, externals: { ...fallback.externals, ...(saved.externals || {}) }, settings };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(DEMO_KEY, JSON.stringify(state));
}

function bindEvents() {
  document.querySelectorAll("[data-demo-role]").forEach((button) => button.addEventListener("click", () => startDemo(button.dataset.demoRole)));
  els.logoutBtn.addEventListener("click", logout);
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  document.querySelectorAll(".segment").forEach((segment) => segment.addEventListener("click", () => {
    activeFilter = segment.dataset.filter;
    document.querySelectorAll(".segment").forEach((item) => item.classList.toggle("is-active", item === segment));
    renderStudents();
  }));
  els.studentSearch.addEventListener("input", renderStudents);
  els.classFilter.addEventListener("change", renderStudents);
  els.markUnsetPresentBtn.addEventListener("click", () => markStudentsPresent(false));
  els.markAllPresentBtn.addEventListener("click", () => markStudentsPresent(true));
  els.addStudentBtn.addEventListener("click", () => openStudentDialog());
  [els.studentAfterschoolNone, els.studentAfterschoolEnrolled, els.studentMondayToggle, els.studentFridayToggle]
    .forEach((control) => control.addEventListener("change", updateAfterschoolEditor));
  els.saveStudentBtn.addEventListener("click", saveStudent);
  els.reviewBtn.addEventListener("click", openReview);
  els.confirmSaveBtn.addEventListener("click", confirmSave);
  els.clearTodayBtn.addEventListener("click", clearToday);
  els.lookupDate.addEventListener("change", () => { renderLookup(); renderCounts(); });
  els.lookupDepartment.addEventListener("change", () => { renderLookup(); renderCounts(); });
  els.refreshLookupBtn.addEventListener("click", () => { renderLookup(); renderCounts(); });
  els.maskContactDefault.addEventListener("change", () => setContactVisibility(!els.maskContactDefault.checked));
  els.importBtn.addEventListener("click", importCsv);
  els.morningTime.addEventListener("change", () => {
    if (!isAdmin()) return;
    if (!isFiveMinuteTime(els.morningTime.value)) {
      els.morningTime.value = state.settings.morningTime;
      return alert("알림 시간은 5분 단위로 지정해 주세요.");
    }
    state.settings.morningTime = els.morningTime.value;
    saveState();
  });
  els.reviewTime.addEventListener("change", () => {
    if (!isAdmin()) return;
    if (!isFiveMinuteTime(els.reviewTime.value)) {
      els.reviewTime.value = state.settings.reviewTime;
      return alert("알림 시간은 5분 단위로 지정해 주세요.");
    }
    state.settings.reviewTime = els.reviewTime.value;
    state.settings.notificationSettingsVersion = 3;
    saveState();
  });
  els.coachReviewTime.addEventListener("change", () => {
    if (!isAdmin()) return;
    if (!isFiveMinuteTime(els.coachReviewTime.value)) {
      els.coachReviewTime.value = state.settings.coachReviewTime;
      return alert("알림 시간은 5분 단위로 지정해 주세요.");
    }
    state.settings.coachReviewTime = els.coachReviewTime.value;
    state.settings.notificationSettingsVersion = 3;
    saveState();
  });
  els.enableNotificationsBtn.addEventListener("click", () => enableNotifications(true));
  els.notificationEnableHeaderBtn.addEventListener("click", () => enableNotifications(true));
  els.testPopupBtn.addEventListener("click", () => showReviewAlarm("review"));
  els.addAdminBtn.addEventListener("click", addAdmin);
  els.addCoachBtn.addEventListener("click", addCoach);
  els.importCoachesBtn.addEventListener("click", importCoachesCsv);
  els.addMondayDepartmentBtn.addEventListener("click", () => addAfterschoolCourse("monday"));
  els.addFridayDepartmentBtn.addEventListener("click", () => addAfterschoolCourse("friday"));
  els.addTeacherBtn.addEventListener("click", addTeacherAssignment);
  els.bulkAssignTeachersBtn.addEventListener("click", bulkAssignTeachers);
  document.querySelectorAll("[data-attendance-day]").forEach((input) => input.addEventListener("change", updateAttendanceDays));
  els.maxClassesPerGrade.addEventListener("change", updateMaxClassesPerGrade);
  els.notificationCenterBtn.addEventListener("click", openNotificationCenter);
  els.clearNotificationsBtn.addEventListener("click", clearNotifications);
}

function startDemo(role) {
  const demoTeacherClass = state.teachers?.["teacher-demo@example.com"] || { grade: "3", classNo: "1" };
  const users = {
    admin: { email: ADMIN_EMAIL, name: "이은숙 관리자", role: "admin", department: "", grade: "3", classNo: "1" },
    teacher: { email: "teacher-demo@example.com", name: "예시 교사", role: "teacher", department: "", grade: demoTeacherClass.grade, classNo: demoTeacherClass.classNo },
    coach: { email: "coach-demo@example.com", name: "예시 방과후강사", role: "coach", department: "로봇 & 코딩" },
    external: { email: "external-demo@example.com", name: "예시 외부수업강사", role: "external", course: "외부수업", externalClass: "4-1" }
  };
  session = users[role];
  attendanceClassInitialized = false;
  document.body.classList.add("is-authenticated");
  els.loginScreen.classList.add("is-hidden");
  els.userPicture.src = "logo.svg";
  els.userName.textContent = session.name;
  els.userEmail.textContent = session.email;
  els.userRole.textContent = session.role === "coach"
    ? `${roleLabel[session.role]} · ${session.department}`
    : session.role === "external"
      ? `${roleLabel[session.role]} · ${selectedExternalClassLabel()}`
      : session.grade
        ? `${roleLabel[session.role]} · ${session.grade}학년 ${session.classNo}반 담임`
        : roleLabel[session.role];
  els.attendanceTab.classList.toggle("is-hidden", ["coach", "external"].includes(role));
  els.lookupTab.classList.toggle("is-hidden", role === "teacher");
  els.settingsTab.classList.toggle("is-hidden", role !== "admin");
  els.maskContactDefault.checked = !state.settings.contactVisible;
  els.reviewTime.value = state.settings.reviewTime;
  els.coachReviewTime.value = state.settings.coachReviewTime;
  els.maxClassesPerGrade.value = state.settings.maxClassesPerGrade;
  document.querySelectorAll("[data-attendance-day]").forEach((input) => { input.checked = state.settings.attendanceDays.includes(Number(input.dataset.attendanceDay)); });
  els.addStudentBtn.classList.toggle("is-hidden", !isAdmin() && !hasHomeroom());
  const coachView = ["coach", "external"].includes(role);
  els.lateCountItem.classList.toggle("is-hidden", coachView);
  els.earlyCountItem.classList.toggle("is-hidden", coachView);
  els.statusStrip.classList.toggle("coach-summary", coachView);
  updateNotificationPermissionUi();
  refreshDepartments();
  switchView(["coach", "external"].includes(role) ? "lookupView" : "attendanceView");
  renderAll();
}

function logout() {
  session = null;
  attendanceClassInitialized = false;
  document.body.classList.remove("is-authenticated");
  els.loginScreen.classList.remove("is-hidden");
}

function canEdit() { return session?.role === "admin" || session?.role === "teacher"; }
function isAttendanceDay(date = new Date()) { return state.settings.attendanceDays.includes(date.getDay()); }
function canEnterAttendanceToday() { return canEdit() && isAttendanceDay(); }
function isAdmin() { return session?.role === "admin"; }
function hasHomeroom() { return Boolean(session && ["admin", "teacher"].includes(session.role) && session.grade && session.classNo); }
function notificationAudiences() {
  if (session?.role === "admin" || (session?.role === "teacher" && hasHomeroom())) return ["input", "review"];
  if (["coach", "external"].includes(session?.role)) return ["coach-review"];
  return [];
}
function canReceiveNotifications() { return notificationAudiences().length > 0; }
function canManageStudent(student) { return isAdmin() || Boolean(hasHomeroom() && String(student.grade) === String(session.grade) && String(student.classNo) === String(session.classNo)); }

function syncCurrentHomeroom(email, grade = "", classNo = "") {
  if (!session || session.email !== email) return;
  session.grade = grade ? String(grade) : "";
  session.classNo = classNo ? String(classNo) : "";
  attendanceClassInitialized = false;
  els.userRole.textContent = hasHomeroom()
    ? `${roleLabel[session.role]} · ${session.grade}학년 ${session.classNo}반 담임`
    : roleLabel[session.role];
  refreshDepartments();
  renderStudents();
  renderCounts();
}

function canAccessView(viewId) {
  if (session.role === "admin") return true;
  if (session.role === "teacher") return viewId === "attendanceView";
  return ["coach", "external"].includes(session.role) && viewId === "lookupView";
}

function switchView(viewId) {
  if (!session || !canAccessView(viewId)) return;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === viewId));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-visible", view.id === viewId));
}

function refreshDepartments() {
  const catalogDepartments = configuredAfterschoolDepartments();
  const studentOnlyDepartments = state.students.flatMap(demoStudentDepartments)
    .filter((department) => !catalogDepartments.includes(department) && !["방과후 미수강", "미수강", "없음", "-"].includes(department))
    .sort((a, b) => a.localeCompare(b, "ko"));
  const departments = [...new Set([...catalogDepartments, ...studentOnlyDepartments])]
    .filter((department) => !["방과후 미수강", "미수강", "없음", "-"].includes(department)).sort((a, b) => a.localeCompare(b, "ko"));
  if (session?.role === "external") {
    const classOptions = allClassKeys().map((classKey) => ({ value: classKey, label: classKeyLabel(classKey) }));
    els.lookupDepartment.innerHTML = classOptions.map((item) => `<option value="${escapeAttr(item.value)}"${item.value === session.externalClass ? " selected" : ""}>${escapeHtml(item.label)}</option>`).join("");
    if (!session.externalClass && classOptions[0]) session.externalClass = classOptions[0].value;
  } else {
    fillSelect(els.lookupDepartment, ["전체", ...departments], session?.role === "coach" ? session.department : "전체");
  }
  fillSelect(els.coachDepartmentInput, catalogDepartments, catalogDepartments[0] || "");
  renderUnregisteredDepartmentNotice(studentOnlyDepartments);
  const homeroomClass = hasHomeroom() ? `${session.grade}학년 ${session.classNo}반` : "";
  const assignedClass = !isAdmin() ? homeroomClass : "";
  const selectedClass = assignedClass || (!attendanceClassInitialized && homeroomClass ? homeroomClass : els.classFilter.value || "전체");
  const classes = [...new Set([...state.students.map((student) => `${student.grade}학년 ${student.classNo}반`), ...(homeroomClass ? [homeroomClass] : [])])]
    .sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
  const attendanceClasses = assignedClass ? [assignedClass] : ["전체", ...classes];
  fillSelect(els.classFilter, attendanceClasses, attendanceClasses.includes(selectedClass) ? selectedClass : attendanceClasses[0]);
  els.classFilter.disabled = Boolean(assignedClass);
  attendanceClassInitialized = true;
  const allClasses = Array.from({ length: 6 }, (_, grade) => Array.from({ length: state.settings.maxClassesPerGrade }, (_, classIndex) => `${grade + 1}-${classIndex + 1}`)).flat();
  fillSelect(els.teacherClassSelect, allClasses, els.teacherClassSelect.value || "1-1");
  els.studentClassInput.max = String(state.settings.maxClassesPerGrade);
}

function classKeyLabel(classKey) {
  const [grade, classNo] = String(classKey || "").split("-");
  return grade && classNo ? `${grade}학년 ${classNo}반` : "학급 선택";
}

function allClassKeys() {
  return Array.from({ length: 6 }, (_, grade) => Array.from({ length: state.settings.maxClassesPerGrade }, (_, classIndex) => `${grade + 1}-${classIndex + 1}`)).flat();
}

function selectedExternalClassLabel() {
  return classKeyLabel(session?.externalClass || allClassKeys()[0] || "");
}

function configuredAfterschoolDepartments() {
  return [
    ...state.settings.afterschoolCourses.monday.map((course) => `월요:${course}`),
    ...state.settings.afterschoolCourses.friday.map((course) => `금요:${course}`)
  ].sort((a, b) => a.localeCompare(b, "ko"));
}

function renderUnregisteredDepartmentNotice(departments) {
  if (!els.unregisteredDepartmentNotice || !isAdmin()) return;
  const uniqueDepartments = [...new Set(departments)];
  els.unregisteredDepartmentNotice.classList.toggle("is-hidden", uniqueDepartments.length === 0);
  els.unregisteredDepartmentNotice.textContent = uniqueDepartments.length
    ? `학생 명단에는 있지만 방과후 부서 목록에 없는 항목이 있습니다: ${uniqueDepartments.slice(0, 12).join(", ")}${uniqueDepartments.length > 12 ? " 외" : ""}. 강사 등록 선택지에는 표시하지 않습니다. 필요한 항목만 요일별 부서 목록에 추가해 주세요.`
    : "";
}

function fillSelect(select, values, selected) {
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value; option.textContent = value; option.selected = value === selected; select.append(option);
  });
}

function renderAll() {
  refreshDepartments(); renderStudents(); renderLookup(); renderCounts(); renderAdminList(); renderCoachList(); renderTeacherList(); renderDepartmentLists();
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getTodayRecord(studentId) {
  const date = todayKey();
  state.records[date] ||= {};
  state.records[date][studentId] ||= { status: "unset", memo: "", saved: true };
  return state.records[date][studentId];
}

function updateSaveState(students = getScopedStudents(), enabled = isAttendanceDay()) {
  const records = students.map((student) => getTodayRecord(student.id));
  const pending = records.filter((record) => !record.saved).length;
  const unset = records.filter((record) => record.status === "unset").length;
  if (pending) {
    els.saveStatusText.textContent = `변경 ${pending}명 · 아직 저장되지 않음`;
    els.saveStatusText.classList.add("has-pending");
    els.reviewBtn.textContent = `저장 전 확인 · ${pending}명`;
  } else {
    els.saveStatusText.textContent = unset === students.length
      ? "아직 입력된 내용 없음"
      : unset
        ? `현재 변경사항 저장됨 · 미입력 ${unset}명`
        : "모든 입력 내용 저장됨";
    els.saveStatusText.classList.remove("has-pending");
    els.reviewBtn.textContent = "저장할 변경 없음";
  }
  els.reviewBtn.disabled = !enabled || pending === 0;
}

function checkDateRollover() {
  const nextDate = todayKey();
  if (nextDate === activeAttendanceDate) return;
  const previousDate = activeAttendanceDate;
  activeAttendanceDate = nextDate;
  els.todayText.textContent = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date());
  if (!els.lookupDate.value || els.lookupDate.value === previousDate) els.lookupDate.value = nextDate;
  if (els.reviewDialog.open) els.reviewDialog.close();
  renderAll();
}

function markStudentsPresent(overwrite) {
  if (!canEnterAttendanceToday()) return alert("오늘은 관리자가 지정한 방과후 운영 요일이 아닙니다.");
  const students = getScopedStudents();
  const hasExceptions = students.some((student) => ["late", "absent", "early"].includes(getTodayRecord(student.id).status));
  if (overwrite && hasExceptions && !confirm("기존 지각·결석·조퇴 기록도 모두 출석으로 바꿀까요?")) return;
  students.forEach((student) => {
    const record = getTodayRecord(student.id);
    if (overwrite || record.status === "unset") {
      if (record.status === "present") return;
      record.status = "present";
      record.saved = false;
    }
  });
  saveState();
  renderStudents();
  renderCounts();
}

function renderStudents() {
  if (!canEdit()) return;
  const enabled = isAttendanceDay();
  const dayNames = state.settings.attendanceDays.map((day) => ["", "월", "화", "수", "목", "금"][day]).join("·");
  els.attendanceDayNotice.textContent = enabled ? `오늘은 출결 입력일입니다. 운영 요일: ${dayNames}` : `오늘은 출결 입력일이 아닙니다. 운영 요일: ${dayNames}`;
  els.attendanceDayNotice.classList.toggle("is-disabled", !enabled);
  const scopedStudents = getScopedStudents();
  const students = scopedStudents.filter((student) => {
    const record = getTodayRecord(student.id);
    return activeFilter === "all" || record.status === activeFilter;
  });
  const unset = scopedStudents.filter((student) => getTodayRecord(student.id).status === "unset").length;
  els.currentRosterCount.textContent = `현재 명단 ${scopedStudents.length}명 · 미입력 ${unset}명`;
  els.markUnsetPresentBtn.textContent = unset ? `미입력 ${unset}명 모두 출석` : "미입력 완료";
  els.markUnsetPresentBtn.disabled = unset === 0 || !enabled;
  els.markAllPresentBtn.disabled = !enabled;
  els.clearTodayBtn.disabled = !enabled;
  updateSaveState(scopedStudents, enabled);
  els.studentGrid.innerHTML = "";
  students.forEach((student) => {
    const record = getTodayRecord(student.id);
    const card = document.createElement("article");
    const afterschool = isAfterschoolStudent(student);
    card.className = `student-card${afterschool ? " has-afterschool" : ""}${afterschool && record.status === "unset" ? " needs-afterschool-check" : ""}`;
    const showMemo = record.status !== "present" && record.status !== "unset" || record.memo;
    const tools = canManageStudent(student) ? `<div class="student-tools"><button type="button" data-edit-student>수정</button><button type="button" data-delete-student>삭제</button></div>` : "";
    card.innerHTML = `<header><div><h3>${escapeHtml(student.name)}</h3><p class="student-meta">${escapeHtml(student.grade)}-${escapeHtml(student.classNo)}-${escapeHtml(student.number)} · ${escapeHtml(student.department)}</p></div>${tools}</header><div class="attendance-options">${["present", "absent", "late", "early"].map((status) => `<button type="button" data-status="${status}" class="${record.status === status ? "is-selected" : ""}"${enabled ? "" : " disabled"}>${statusLabel[status]}</button>`).join("")}</div>${showMemo ? `<input class="memo-input" type="text" placeholder="특이사항 (선택)" value="${escapeAttr(record.memo)}"${enabled ? "" : " disabled"} />` : ""}`;
    card.querySelectorAll("[data-status]").forEach((button) => button.addEventListener("click", () => {
      if (record.status === button.dataset.status) return;
      record.status = button.dataset.status; record.saved = false; saveState(); renderStudents(); renderCounts();
    }));
    card.querySelector(".memo-input")?.addEventListener("input", (event) => {
      if (record.memo === event.target.value) return;
      record.memo = event.target.value; record.saved = false; saveState(); updateSaveState(scopedStudents, enabled);
    });
    card.querySelector("[data-edit-student]")?.addEventListener("click", () => openStudentDialog(student));
    card.querySelector("[data-delete-student]")?.addEventListener("click", () => deleteStudent(student));
    els.studentGrid.append(card);
  });
}

function openStudentDialog(student = null) {
  if (!isAdmin() && !hasHomeroom()) return;
  editingStudentId = student?.id || null;
  els.studentDialogTitle.textContent = student ? "학생 정보 수정" : "학생 추가";
  els.studentNameInput.value = student?.name || "";
  els.studentGradeInput.value = student?.grade || session.grade || "";
  els.studentClassInput.value = student?.classNo || session.classNo || "";
  els.studentNumberInput.value = student?.number || "";
  const selection = readAfterschoolSelection(student);
  fillAfterschoolCourseSelect(els.studentMondayDepartment, "monday", selection.monday);
  fillAfterschoolCourseSelect(els.studentFridayDepartment, "friday", selection.friday);
  els.studentAfterschoolNone.checked = Boolean(student && !selection.enrolled);
  els.studentAfterschoolEnrolled.checked = selection.enrolled;
  els.studentMondayToggle.checked = Boolean(selection.monday);
  els.studentFridayToggle.checked = Boolean(selection.friday);
  els.studentGradeInput.disabled = !isAdmin();
  els.studentClassInput.disabled = !isAdmin();
  updateAfterschoolEditor();
  els.studentDialog.showModal();
}

function demoStudentDepartments(student) {
  return String(student?.department || "").split(/[|,;/]/).map((value) => value.trim()).filter(Boolean);
}

function fillAfterschoolCourseSelect(select, day, selected = "") {
  const courses = [...new Set([...(state.settings.afterschoolCourses[day] || []), selected].filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  select.innerHTML = `<option value="">부서 선택</option>${courses.map((course) => `<option value="${escapeAttr(course)}"${course === selected ? " selected" : ""}>${escapeHtml(course)}</option>`).join("")}`;
}

function readAfterschoolSelection(student) {
  const departments = demoStudentDepartments(student);
  let monday = departments.find((department) => department.startsWith("월요:"))?.slice(3) || "";
  const friday = departments.find((department) => department.startsWith("금요:"))?.slice(3) || "";
  const legacy = departments.find((department) => !department.includes(":") && !["방과후 미수강", "미수강", "없음", "-"].includes(department));
  if (!monday && !friday && legacy) monday = legacy;
  return { enrolled: Boolean(monday || friday), monday, friday };
}

function updateAfterschoolEditor() {
  const enrolled = els.studentAfterschoolEnrolled.checked;
  els.studentAfterschoolDays.hidden = !enrolled;
  els.studentMondayToggle.disabled = !enrolled;
  els.studentFridayToggle.disabled = !enrolled;
  els.studentMondayDepartment.disabled = !enrolled || !els.studentMondayToggle.checked;
  els.studentFridayDepartment.disabled = !enrolled || !els.studentFridayToggle.checked;
}

function selectedAfterschoolDepartments() {
  if (els.studentAfterschoolNone.checked) return ["방과후 미수강"];
  if (!els.studentAfterschoolEnrolled.checked) return null;
  const departments = [];
  if (els.studentMondayToggle.checked) {
    if (!els.studentMondayDepartment.value) return null;
    departments.push(`월요:${els.studentMondayDepartment.value}`);
  }
  if (els.studentFridayToggle.checked) {
    if (!els.studentFridayDepartment.value) return null;
    departments.push(`금요:${els.studentFridayDepartment.value}`);
  }
  return departments.length ? departments : null;
}

function saveStudent() {
  if (!isAdmin() && !hasHomeroom()) return;
  const departments = selectedAfterschoolDepartments();
  if (!departments) return alert("방과후 수강 여부를 선택하고, 수강 시 요일과 부서를 모두 확인해 주세요.");
  const student = {
    id: editingStudentId || `student-${Date.now()}`,
    name: els.studentNameInput.value.trim(),
    grade: String(isAdmin() ? els.studentGradeInput.value : session.grade),
    classNo: String(isAdmin() ? els.studentClassInput.value : session.classNo),
    number: String(els.studentNumberInput.value),
    department: departments.join("|"),
    parentPhone: editingStudentId ? state.students.find((item) => item.id === editingStudentId)?.parentPhone || "" : ""
  };
  if (!student.name || !student.grade || !student.classNo || !student.number) return alert("이름, 학년, 반, 번호를 확인해 주세요.");
  if (Number(student.classNo) > state.settings.maxClassesPerGrade) return alert(`현재 학년별 최대 반 수는 ${state.settings.maxClassesPerGrade}반입니다.`);
  if (editingStudentId && !confirm(`${student.name} 학생 정보를 수정할까요?`)) return;
  const index = state.students.findIndex((item) => item.id === student.id);
  if (index >= 0) state.students[index] = student;
  else state.students.push(student);
  editingStudentId = null;
  saveState();
  els.studentDialog.close();
  renderAll();
}

function deleteStudent(student) {
  if (!canManageStudent(student) || !confirm(`${student.name} 학생을 명단에서 삭제할까요?\n삭제 후에는 되돌릴 수 없습니다.`)) return;
  state.students = state.students.filter((item) => item.id !== student.id);
  saveState();
  renderAll();
}

function getScopedStudents() {
  const query = els.studentSearch.value.trim().toLowerCase();
  const selectedClass = els.classFilter.value || "전체";
  return state.students.filter((student) => {
    const text = `${student.name} ${student.department} ${student.grade}-${student.classNo}`.toLowerCase();
    const className = `${student.grade}학년 ${student.classNo}반`;
    return (!query || text.includes(query)) && (selectedClass === "전체" || selectedClass === className);
  }).sort((a, b) => Number(a.grade) - Number(b.grade) || Number(a.classNo) - Number(b.classNo) || Number(a.number) - Number(b.number));
}

function renderCounts() {
  const records = state.records[["coach", "external"].includes(session?.role) ? els.lookupDate.value || todayKey() : todayKey()] || {};
  const counts = { present: 0, late: 0, early: 0, absent: 0, unset: 0 };
  const students = session?.role === "coach"
    ? state.students.filter((student) => demoStudentDepartments(student).includes(session.department))
    : session?.role === "external"
      ? state.students.filter((student) => `${student.grade}-${student.classNo}` === (session.externalClass || allClassKeys()[0]))
    : getScopedStudents();
  students.forEach((student) => {
    const status = records[student.id]?.status || "unset";
    if (status === "present") counts.present += 1;
    else if (["coach", "external"].includes(session?.role) && ["absent", "late", "early"].includes(status)) counts.absent += 1;
    else if (status === "late") counts.late += 1;
    else if (status === "early") counts.early += 1;
    else if (status === "absent") counts.absent += 1;
    else counts.unset += 1;
  });
  Object.keys(counts).forEach((key) => { els[`${key}Count`].textContent = counts[key]; });
}

function openReview() {
  if (!canEnterAttendanceToday()) return alert("오늘은 관리자가 지정한 방과후 운영 요일이 아닙니다.");
  els.reviewList.innerHTML = getScopedStudents().map((student) => {
    const record = getTodayRecord(student.id);
    return `<div class="review-item"><div class="review-identity"><strong>${escapeHtml(student.name)}</strong><span class="student-meta">${escapeHtml(student.department)} · ${escapeHtml(student.grade)}-${escapeHtml(student.classNo)}-${escapeHtml(student.number)}</span></div><div class="status-${record.status}">${statusLabel[record.status] || statusLabel.unset}${record.memo ? ` · ${escapeHtml(record.memo)}` : ""}</div></div>`;
  }).join("");
  els.reviewDialog.showModal();
}

function confirmSave() {
  if (!canEnterAttendanceToday()) return alert("오늘은 관리자가 지정한 방과후 운영 요일이 아닙니다.");
  getScopedStudents().forEach((student) => { getTodayRecord(student.id).saved = true; });
  saveState(); els.reviewDialog.close(); renderAll();
}

function clearToday() {
  if (!canEnterAttendanceToday()) return alert("오늘은 관리자가 지정한 방과후 운영 요일이 아닙니다.");
  if (!confirm("오늘 출결 기록을 초기화할까요?")) return;
  state.records[todayKey()] = {}; saveState(); renderAll();
}

function renderLookup() {
  if (!session || session.role === "teacher") return;
  const coach = session.role === "coach";
  const external = session.role === "external";
  const title = document.getElementById("lookup-title");
  const description = title?.nextElementSibling;
  if (title) title.textContent = external ? "외부수업강사 조회" : coach ? "방과후강사 조회" : "출결 조회";
  if (description) description.textContent = external ? "외부수업강사는 조회할 학년·반을 선택해 출석·결석만 확인합니다." : coach ? "강사는 자기 부서 학생의 방과후 출석·결석만 조회합니다." : "일별 학생 출결을 확인합니다.";
  const departmentLabel = els.lookupDepartment.closest("label")?.firstChild;
  if (departmentLabel) departmentLabel.textContent = external ? "조회 반" : "부서";
  els.lookupDepartment.disabled = coach;
  if (coach) els.lookupDepartment.value = session.department;
  if (external && els.lookupDepartment.value) session.externalClass = els.lookupDepartment.value;
  const department = coach ? session.department : els.lookupDepartment.value;
  const records = state.records[els.lookupDate.value || todayKey()] || {};
  const students = external
    ? state.students.filter((student) => `${student.grade}-${student.classNo}` === (session.externalClass || allClassKeys()[0]))
    : state.students.filter((student) => department === "전체" || demoStudentDepartments(student).includes(department));
  const adminView = isAdmin();
  els.lookupTable.classList.toggle("no-contact", !adminView);
  els.lookupTable.innerHTML = `<div class="table-row table-head"><div>학생</div><div>부서</div><div>출결</div><div>특이사항</div>${adminView ? "<div>학부모 연락처</div>" : ""}</div>${students.map((student) => {
    const record = records[student.id] || { status: "unset", memo: "" };
    const displayStatus = (coach || external) && ["late", "early"].includes(record.status) ? "absent" : record.status;
    const phone = state.settings.contactVisible ? student.parentPhone || "-" : "비공개";
    const visibleDepartment = external ? `${student.grade}학년 ${student.classNo}반` : department === "전체" ? student.department : department;
    return `<div class="table-row"><div data-label="학생"><strong>${escapeHtml(student.name)}</strong> <span class="student-meta">${escapeHtml(student.grade)}-${escapeHtml(student.classNo)}-${escapeHtml(student.number)}</span></div><div data-label="${external ? "학급" : "부서"}">${escapeHtml(visibleDepartment)}</div><div data-label="출결" class="status-${displayStatus}">${statusLabel[displayStatus] || statusLabel.unset}</div><div data-label="특이사항">${record.memo ? escapeHtml(record.memo) : "-"}</div>${adminView ? `<div data-label="학부모 연락처">${escapeHtml(phone)}</div>` : ""}</div>`;
  }).join("")}`;
}

function setContactVisibility(visible) {
  if (!isAdmin()) return;
  state.settings.contactVisible = visible;
  els.maskContactDefault.checked = !visible;
  saveState(); renderLookup();
}

function addAdmin() {
  if (!isAdmin()) return;
  const email = els.adminEmailInput.value.trim().toLowerCase();
  if (!email.endsWith("@nsworld.net")) return alert("관리자는 학교 이메일(@nsworld.net)만 등록할 수 있습니다.");
  if (state.admins[email]) return alert("이미 관리자 계정으로 등록되어 있습니다.");
  state.admins[email] = true;
  delete state.teachers[email];
  els.adminEmailInput.value = "";
  saveState();
  renderAll();
}

function renderAdminList() {
  if (!isAdmin()) return;
  const entries = Object.keys(state.admins).sort((a, b) => a.localeCompare(b));
  els.adminList.innerHTML = entries.map((email) => {
    const fixed = email === ADMIN_EMAIL;
    return `<div class="coach-item"><div><strong>${escapeHtml(email)}</strong><span>${fixed ? "기본 관리자" : "추가 관리자"}</span></div>${fixed ? "" : `<button type="button" data-remove-admin="${escapeAttr(email)}">삭제</button>`}</div>`;
  }).join("");
  els.adminList.querySelectorAll("[data-remove-admin]").forEach((button) => button.addEventListener("click", () => {
    const email = button.dataset.removeAdmin;
    if (email === session.email) return alert("현재 로그인한 관리자 계정은 직접 삭제할 수 없습니다.");
    if (!confirm(`${email}의 관리자 권한을 삭제할까요?`)) return;
    delete state.admins[email]; saveState(); renderAdminList();
  }));
}

function addCoach() {
  if (!isAdmin()) return;
  const email = els.coachEmailInput.value.trim().toLowerCase();
  const department = els.coachDepartmentInput.value;
  if (!email || !email.includes("@") || !department) return alert("강사 이메일과 담당 부서를 확인해 주세요.");
  state.coaches[email] = department; els.coachEmailInput.value = ""; saveState(); renderCoachList();
}

async function importCoachesCsv() {
  if (!isAdmin()) return;
  const file = els.coachCsvFileInput.files?.[0];
  if (!file) return alert("방과후강사 CSV 파일을 선택해 주세요.");
  try {
    const rows = parseCsv((await readCsvText(file)).replace(/^\uFEFF/, ""));
    const headers = rows.shift().map((header) => header.trim().toLowerCase());
    const assignments = rows.filter((row) => row.some(Boolean)).map((row, index) => {
      const item = Object.fromEntries(headers.map((header, headerIndex) => [header, String(row[headerIndex] || "").trim()]));
      const email = (item["이메일"] || item["메일"] || item.email || "").toLowerCase();
      const course = item["담당 부서"] || item["담당부서"] || item["부서"] || item.department || "";
      const day = item["요일"] || item.day || "";
      return { row: index + 2, email, department: normalizeCoachDepartment(course, day) };
    });
    const invalid = assignments.filter(({ email, department }) => !email.includes("@") || !department);
    if (invalid.length) throw new Error(`${invalid.map((item) => item.row).join(", ")}행의 이메일·요일·부서를 확인해 주세요.`);
    if (!assignments.length) throw new Error("등록할 강사 정보가 없습니다.");
    const uniqueAssignments = [...new Map(assignments.map((item) => [item.email, item])).values()];
    uniqueAssignments.forEach(({ email, department }) => { state.coaches[email] = department; });
    els.coachCsvFileInput.value = "";
    saveState(); renderCoachList();
    alert(`${uniqueAssignments.length}명의 방과후강사를 등록했습니다.`);
  } catch (error) { alert(`강사 CSV 등록 실패: ${error.message}`); }
}

function normalizeCoachDepartment(course, day) {
  const value = String(course || "").trim();
  if (/^(월요|금요):.+/.test(value)) return value;
  const dayPrefix = String(day || "").includes("월") ? "월요" : String(day || "").includes("금") ? "금요" : "";
  if (dayPrefix && value) return `${dayPrefix}:${value}`;
  const monday = state.settings.afterschoolCourses.monday.includes(value);
  const friday = state.settings.afterschoolCourses.friday.includes(value);
  if (monday !== friday) return `${monday ? "월요" : "금요"}:${value}`;
  return "";
}

function renderCoachList() {
  if (!isAdmin()) return;
  const entries = Object.entries(state.coaches).sort(([a], [b]) => a.localeCompare(b));
  els.coachList.innerHTML = entries.length ? entries.map(([email, department]) => `<div class="coach-item"><div><strong>${escapeHtml(email)}</strong><span>${escapeHtml(department)}</span></div><button type="button" data-remove-coach="${escapeAttr(email)}">삭제</button></div>`).join("") : `<p class="note">등록된 강사가 없습니다.</p>`;
  els.coachList.querySelectorAll("[data-remove-coach]").forEach((button) => button.addEventListener("click", () => {
    delete state.coaches[button.dataset.removeCoach]; saveState(); renderCoachList();
  }));
}

function addAfterschoolCourse(day) {
  if (!isAdmin()) return;
  const input = day === "monday" ? els.mondayDepartmentInput : els.fridayDepartmentInput;
  const course = input.value.trim();
  if (!course) return alert("추가할 부서명을 입력해 주세요.");
  if (state.settings.afterschoolCourses[day].includes(course)) return alert("해당 요일에 이미 등록된 부서입니다.");
  state.settings.afterschoolCourses[day].push(course);
  state.settings.afterschoolCourses[day].sort((a, b) => a.localeCompare(b, "ko"));
  input.value = "";
  saveState(); refreshDepartments(); renderDepartmentLists();
}

function removeAfterschoolCourse(day, course) {
  const dayLabel = day === "monday" ? "월요일" : "금요일";
  if (!confirm(`${dayLabel} '${course}' 부서를 목록에서 삭제할까요?`)) return;
  state.settings.afterschoolCourses[day] = state.settings.afterschoolCourses[day].filter((item) => item !== course);
  saveState(); refreshDepartments(); renderDepartmentLists();
}

function renderDepartmentLists() {
  if (!isAdmin()) return;
  renderDepartmentList("monday", els.mondayDepartmentList);
  renderDepartmentList("friday", els.fridayDepartmentList);
}

function renderDepartmentList(day, container) {
  container.innerHTML = state.settings.afterschoolCourses[day].map((course) => `<div class="department-list-item"><span title="${escapeAttr(course)}">${escapeHtml(course)}</span><button type="button" data-remove-course="${escapeAttr(course)}" aria-label="${escapeAttr(course)} 삭제">×</button></div>`).join("") || `<p class="note">등록된 부서가 없습니다.</p>`;
  container.querySelectorAll("[data-remove-course]").forEach((button) => button.addEventListener("click", () => removeAfterschoolCourse(day, button.dataset.removeCourse)));
}

function addTeacherAssignment() {
  if (!isAdmin()) return;
  const email = els.teacherEmailInput.value.trim().toLowerCase();
  const [grade, classNo] = els.teacherClassSelect.value.split("-");
  if (!email.endsWith("@nsworld.net") || !grade || !classNo) return alert("학교 이메일과 담당 학급을 확인해 주세요.");
  if (state.teachers[email] && !confirm(`${email}의 담임 학급을 ${grade}학년 ${classNo}반으로 수정할까요?`)) return;
  state.teachers[email] = { grade, classNo };
  syncCurrentHomeroom(email, grade, classNo);
  els.teacherEmailInput.value = "";
  saveState();
  renderTeacherList();
}

function bulkAssignTeachers() {
  if (!isAdmin()) return;
  const assignments = parseTeacherAssignments(els.teacherBulkInput.value);
  if (!assignments.length) return alert("배정할 교사 목록을 확인해 주세요.");
  const changed = assignments.filter(({ email, grade, classNo }) => state.teachers[email] && (state.teachers[email].grade !== grade || state.teachers[email].classNo !== classNo));
  if (changed.length && !confirm(`기존 담임 ${changed.length}명의 학급 배정을 변경할까요?`)) return;
  assignments.forEach(({ email, grade, classNo }) => {
    state.teachers[email] = { grade, classNo };
  });
  const currentAssignment = assignments.find(({ email }) => email === session.email);
  if (currentAssignment) syncCurrentHomeroom(currentAssignment.email, currentAssignment.grade, currentAssignment.classNo);
  els.teacherBulkInput.value = "";
  saveState();
  renderTeacherList();
  alert(`${assignments.length}명의 담임 배정을 저장했습니다.`);
}

function parseTeacherAssignments(text) {
  return text.split(/\r?\n/).map((line) => {
    const email = line.match(/[\w.+-]+@nsworld\.net/i)?.[0]?.toLowerCase();
    const classMatch = line.replace(email || "", "").match(/([1-6])\D+(10|[1-9])/);
    return email && classMatch && Number(classMatch[2]) <= state.settings.maxClassesPerGrade ? { email, grade: classMatch[1], classNo: classMatch[2] } : null;
  }).filter(Boolean);
}

function renderTeacherList() {
  if (!isAdmin()) return;
  const entries = Object.entries(state.teachers || {}).sort(([a], [b]) => a.localeCompare(b));
  els.teacherList.innerHTML = entries.length ? entries.map(([email, value]) => `<div class="coach-item"><div><strong>${escapeHtml(email)}</strong><span>${escapeHtml(value.grade)}학년 ${escapeHtml(value.classNo)}반</span></div><button type="button" data-remove-teacher="${escapeAttr(email)}">삭제</button></div>`).join("") : `<p class="note">배정된 담임교사가 없습니다.</p>`;
  els.teacherList.querySelectorAll("[data-remove-teacher]").forEach((button) => button.addEventListener("click", () => {
    if (!confirm(`${button.dataset.removeTeacher}의 담임 배정을 삭제할까요?`)) return;
    const email = button.dataset.removeTeacher;
    delete state.teachers[email];
    syncCurrentHomeroom(email);
    saveState();
    renderTeacherList();
  }));
}

async function importCsv() {
  if (!isAdmin()) return;
  const file = els.csvFileInput.files?.[0];
  if (!file) return alert("관리자 기기에서 CSV 파일을 선택해 주세요.");
  try {
    const rows = parseCsv((await readCsvText(file)).replace(/^\uFEFF/, ""));
    const headers = rows.shift().map((header) => header.trim());
    const students = rows.filter((row) => row.some(Boolean)).map((row, index) => {
      const item = Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex] || ""]));
      return { id: item.id || `csv-${Date.now()}-${index}`, name: item["이름"] || item.name || "", grade: item["학년"] || item.grade || "", classNo: item["반"] || item.class || "", number: item["번호"] || item.number || "", department: item["부서"] || item.department || "", parentPhone: item["학부모연락처"] || item.parentPhone || "" };
    }).filter((student) => student.name && student.department);
    if (!students.length) throw new Error("가져올 학생 정보가 없습니다.");
    state.students = students; saveState(); renderAll(); alert(`${students.length}명의 학생 명단을 가져왔습니다.`);
  } catch (error) { alert(`가져오기 실패: ${error.message}`); }
}

function isAfterschoolStudent(student) {
  return String(student.department || "").split(/[|,;/]/).some((department) => {
    const value = department.trim();
    return value && !["방과후 미수강", "미수강", "없음", "-"].includes(value);
  });
}

function parseCsv(csv) {
  const rows = []; let row = [], value = "", quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index], next = csv[index + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") index += 1; row.push(value); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  row.push(value); rows.push(row); return rows;
}

async function readCsvText(file) {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    const korean = new TextDecoder("euc-kr").decode(buffer);
    return korean.includes("\uFFFD") ? utf8 : korean;
  } catch {
    return utf8;
  }
}

async function registerNotificationWorker() {
  if (!("serviceWorker" in navigator) || !["http:", "https:"].includes(location.protocol)) return null;
  try {
    await navigator.serviceWorker.register("./sw.js");
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function enableNotifications(showConfirmation = false) {
  if (!canReceiveNotifications()) return "denied";
  if (location.protocol === "file:") {
    if (showConfirmation) alert("체험판 파일에서는 알림을 켤 수 없습니다. 실제 배포 주소에서 설정해 주세요.");
    return "unavailable";
  }
  if (!("Notification" in window)) return alert("이 브라우저는 알림을 지원하지 않습니다.");
  const permission = await Notification.requestPermission();
  updateNotificationPermissionUi();
  if (permission === "granted") {
    if (showConfirmation) await notify("출결 알림이 켜졌습니다", "예정된 출결 알림을 이 기기에서 표시합니다.");
  } else if (showConfirmation) {
    alert("알림 권한이 허용되지 않았습니다. Chrome 사이트 설정에서 알림을 허용해 주세요.");
  }
  return permission;
}

function isFiveMinuteTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) && Number(value.slice(-2)) % 5 === 0;
}

function updateAttendanceDays() {
  if (!isAdmin()) return;
  const selected = [...document.querySelectorAll("[data-attendance-day]:checked")].map((input) => Number(input.dataset.attendanceDay)).sort();
  if (!selected.length) {
    document.querySelectorAll("[data-attendance-day]").forEach((input) => { input.checked = state.settings.attendanceDays.includes(Number(input.dataset.attendanceDay)); });
    return alert("방과후 운영 요일을 한 개 이상 선택해 주세요.");
  }
  state.settings.attendanceDays = selected;
  saveState();
  renderStudents();
}

function updateMaxClassesPerGrade() {
  if (!isAdmin()) return;
  const value = Math.trunc(Number(els.maxClassesPerGrade.value));
  if (value < 1 || value > 10) {
    els.maxClassesPerGrade.value = state.settings.maxClassesPerGrade;
    return alert("학년별 반 수는 1~10 사이로 입력해 주세요.");
  }
  state.settings.maxClassesPerGrade = value;
  saveState();
  refreshDepartments();
}

function checkAlarms() {
  if (!canReceiveNotifications()) return;
  const now = new Date(), date = todayKey(), hhmm = now.toTimeString().slice(0, 5);
  if (!isAttendanceDay(now)) return;
  if (notificationAudiences().includes("input") && hhmm >= state.settings.morningTime && state.settings.lastMorning !== date) {
    state.settings.lastMorning = date; addNotification("아침 출결 입력", "오늘 학생 출결을 입력해 주세요."); notify("아침 출결 입력 시간입니다", "오늘 학생 출결을 입력해 주세요.");
  }
  if (notificationAudiences().includes("review") && hhmm >= state.settings.reviewTime && state.settings.lastReview !== date) {
    state.settings.lastReview = date; saveState(); showReviewAlarm("review");
  }
  if (notificationAudiences().includes("coach-review") && hhmm >= state.settings.coachReviewTime && state.settings.lastCoachReview !== date) {
    state.settings.lastCoachReview = date; saveState(); showReviewAlarm("coach-review");
  }
}

async function notify(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const options = { body, icon: "./logo.svg", tag: `attendance-${title}`, renotify: true, data: { url: "./index.html" } };
  if (notificationRegistration) await notificationRegistration.showNotification(title, options);
  else new Notification(title, options);
}

function updateNotificationPermissionUi() {
  const localPreview = location.protocol === "file:";
  const granted = "Notification" in window && Notification.permission === "granted";
  const denied = "Notification" in window && Notification.permission === "denied";
  const eligible = canReceiveNotifications();
  els.notificationButtonLabel.textContent = "받은 알림";
  els.notificationCenterBtn.disabled = false;
  els.notificationCenterBtn.title = "받은 알림을 확인합니다.";
  els.notificationEnableHeaderBtn.textContent = localPreview ? "체험판 알림 미지원" : !eligible ? "알림 대상 아님" : granted ? "알림 켜짐" : denied ? "알림 허용 필요" : "알림 켜기";
  els.notificationEnableHeaderBtn.disabled = localPreview || granted || !eligible;
  els.notificationEnableHeaderBtn.title = localPreview ? "실제 배포 주소에서 알림을 설정할 수 있습니다." : denied ? "브라우저 사이트 설정에서 알림을 허용해 주세요." : "";
  els.notificationEnableHeaderBtn.classList.toggle("needs-permission", !localPreview && eligible && !granted);
  els.enableNotificationsBtn.textContent = localPreview ? "체험판에서는 알림 설정 불가" : granted ? "브라우저 알림 켜짐" : denied ? "Chrome 알림 허용 필요" : "브라우저 알림 켜기";
  els.enableNotificationsBtn.disabled = localPreview || granted;
}

function showReviewAlarm(audience = "review") {
  const coach = audience === "coach-review";
  const title = coach ? "방과후 출결 확인" : "출결 재확인";
  const body = coach ? "오늘 방과후 수강 학생의 출결을 확인해 주세요." : "오늘 입력한 학생 출결을 한 번 더 확인해 주세요.";
  els.alarmDialogTitle.textContent = `${title} 알림`;
  els.alarmDialogBody.textContent = body;
  addNotification(title, body);
  notify(`${title} 알림`, body);
  if (!els.alarmDialog.open) els.alarmDialog.showModal();
}

function addNotification(title, body) {
  state.notifications ||= [];
  state.notifications.unshift({ id: Date.now(), title, body, time: new Date().toISOString(), read: false });
  state.notifications = state.notifications.slice(0, 30);
  saveState();
  updateNotificationBadge();
}

function updateNotificationBadge() {
  const unread = (state.notifications || []).filter((item) => !item.read).length;
  els.notificationBadge.textContent = unread > 99 ? "99+" : unread;
  els.notificationBadge.classList.toggle("is-hidden", unread === 0);
  document.title = unread ? `(${unread}) ${ORIGINAL_TITLE}` : ORIGINAL_TITLE;
  if ("setAppBadge" in navigator) {
    const action = unread ? navigator.setAppBadge(unread) : navigator.clearAppBadge();
    Promise.resolve(action).catch(() => {});
  }
}

async function openNotificationCenter() {
  const items = state.notifications || [];
  els.notificationList.innerHTML = items.length ? items.map((item) => `<article class="notification-item ${item.read ? "" : "is-unread"}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p><time>${new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.time))}</time></article>`).join("") : `<p class="empty-notifications">도착한 알림이 없습니다.</p>`;
  items.forEach((item) => { item.read = true; });
  saveState();
  updateNotificationBadge();
  els.notificationDialog.showModal();
}

function clearNotifications() {
  state.notifications = [];
  saveState();
  updateNotificationBadge();
  els.notificationDialog.close();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
