import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, getRedirectResult, onAuthStateChanged,
  signInWithPopup, signInWithRedirect, signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection, deleteDoc, doc, getDoc, getDocs, getFirestore,
  query, serverTimestamp, setDoc, where, writeBatch
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const ADMIN_EMAIL = "leens@nsworld.net";
const ALARM_KEY = "nsworld-alarm-state";
const ORIGINAL_TITLE = document.title;
const statusLabel = { present: "출석", late: "지각", absent: "결석", early: "조퇴", unset: "미입력" };
const roleLabel = { admin: "관리자", teacher: "교사", coach: "방과후강사" };

const sampleStudents = [
  { id: "s-001", name: "김나윤", grade: "3", classNo: "1", number: "4", department: "로봇과학", parentPhone: "010-1234-1001" },
  { id: "s-002", name: "박지호", grade: "3", classNo: "2", number: "8", department: "로봇과학", parentPhone: "010-1234-1002" },
  { id: "s-003", name: "이서준", grade: "4", classNo: "1", number: "13", department: "바이올린", parentPhone: "010-1234-1003" },
  { id: "s-004", name: "최민서", grade: "4", classNo: "3", number: "2", department: "축구", parentPhone: "010-1234-1004" },
  { id: "s-005", name: "정하린", grade: "5", classNo: "2", number: "11", department: "미술", parentPhone: "010-1234-1005" },
  { id: "s-006", name: "오도윤", grade: "5", classNo: "4", number: "7", department: "축구", parentPhone: "010-1234-1006" },
  { id: "s-007", name: "한유진", grade: "6", classNo: "1", number: "9", department: "코딩", parentPhone: "010-1234-1007" },
  { id: "s-008", name: "강서아", grade: "6", classNo: "2", number: "6", department: "코딩", parentPhone: "010-1234-1008" }
];

const state = {
  students: [], records: {}, contacts: {}, coaches: {}, teachers: {}, monthlyRecords: [],
  settings: { morningTime: "08:30", contactVisible: false }
};
const alarms = loadAlarms();
let activeFilter = "all";
let session = null;
let auth = null;
let db = null;
let editingStudentId = null;
let activeStatsMode = "class";
let mobileStatsWeeks = [];
let mobileStatsWeekIndex = 0;
let mobileStatsContext = null;
let mobileStatsMonth = "";

const els = Object.fromEntries([
  "loginScreen", "googleSignInButton", "googleSetupNotice", "loginError", "userPicture", "userName", "userEmail", "userRole",
  "logoutBtn", "todayText", "notificationCenterBtn", "notificationBadge", "notificationDialog", "notificationList", "clearNotificationsBtn", "attendanceTab", "lookupTab", "statisticsTab", "settingsTab", "studentSearch", "classFilter", "studentGrid", "markUnsetPresentBtn", "markAllPresentBtn", "addStudentBtn", "currentRosterCount", "reviewBtn",
  "clearTodayBtn", "reviewDialog", "reviewList", "confirmSaveBtn", "alarmDialog", "lookupDate", "lookupDepartment",
  "lookupTable", "contactControl", "contactToggle", "refreshLookupBtn", "csvUrlInput", "importBtn", "loadSampleBtn", "morningTime", "testPopupBtn",
  "enableNotificationsBtn", "maskContactDefault", "csvFileInput", "coachEmailInput", "coachDepartmentInput", "addCoachBtn", "coachList", "teacherEmailInput", "teacherClassSelect", "addTeacherBtn", "teacherBulkInput", "bulkAssignTeachersBtn", "teacherList",
  "studentDialog", "studentDialogTitle", "studentNameInput", "studentGradeInput", "studentClassInput", "studentNumberInput", "studentDepartmentInput", "saveStudentBtn",
  "statisticsMonth", "statisticsClassFilter", "statisticsScope", "refreshStatisticsBtn", "printStatisticsBtn", "printStatisticsMeta", "printConfirmDialog", "executePrintBtn", "statisticsTable", "classStatisticsPanel", "studentStatisticsPanel", "classStatisticsMatrix", "previousStatsWeekBtn", "nextStatsWeekBtn", "statsWeekLabel", "mobileStatisticsMatrix", "statsPresent", "statsAbsent", "statsLate", "statsEarly", "statsRate",
  "presentCount", "lateCount", "absentCount", "unsetCount"
].map((id) => [id, document.getElementById(id)]));

init();

async function init() {
  els.todayText.textContent = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date());
  els.lookupDate.value = todayKey();
  els.statisticsMonth.value = todayKey().slice(0, 7);
  bindEvents();
  alarms.notifications ||= [];
  updateNotificationBadge();
  scheduleChecks();

  const config = window.NSWORLD_CONFIG?.firebase;
  if (!config || !config.apiKey || config.apiKey.startsWith("YOUR_")) {
    els.googleSetupNotice.classList.remove("is-hidden");
    els.googleSignInButton.disabled = true;
    return;
  }

  try {
    const app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
    await getRedirectResult(auth);
    onAuthStateChanged(auth, handleAuthChange);
  } catch (error) {
    showLoginError(readableError(error));
  }
}

function bindEvents() {
  els.googleSignInButton.addEventListener("click", loginWithGoogle);
  els.logoutBtn.addEventListener("click", () => auth && signOut(auth));
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
  els.saveStudentBtn.addEventListener("click", saveStudent);
  els.reviewBtn.addEventListener("click", openReview);
  els.confirmSaveBtn.addEventListener("click", confirmSave);
  els.clearTodayBtn.addEventListener("click", clearToday);
  els.lookupDate.addEventListener("change", async () => { await loadRecords(els.lookupDate.value); renderLookup(); });
  els.lookupDepartment.addEventListener("change", renderLookup);
  els.refreshLookupBtn.addEventListener("click", refreshLookup);
  els.contactToggle.addEventListener("change", updateContactVisibility);
  els.maskContactDefault.addEventListener("change", () => setContactVisibility(!els.maskContactDefault.checked));
  els.loadSampleBtn.addEventListener("click", () => uploadStudents(sampleStudents));
  els.importBtn.addEventListener("click", importCsv);
  els.morningTime.addEventListener("change", updateMorningTime);
  els.enableNotificationsBtn.addEventListener("click", enableNotifications);
  els.testPopupBtn.addEventListener("click", showReviewAlarm);
  els.addCoachBtn.addEventListener("click", addCoach);
  els.addTeacherBtn.addEventListener("click", addTeacherAssignment);
  els.bulkAssignTeachersBtn.addEventListener("click", bulkAssignTeachers);
  els.statisticsMonth.addEventListener("change", loadMonthlyStatistics);
  els.statisticsClassFilter.addEventListener("change", renderMonthlyStatistics);
  els.refreshStatisticsBtn.addEventListener("click", loadMonthlyStatistics);
  els.printStatisticsBtn.addEventListener("click", openPrintConfirmation);
  els.executePrintBtn.addEventListener("click", printClassStatistics);
  els.previousStatsWeekBtn.addEventListener("click", () => changeMobileStatsWeek(-1));
  els.nextStatsWeekBtn.addEventListener("click", () => changeMobileStatsWeek(1));
  document.querySelectorAll("[data-stats-mode]").forEach((button) => button.addEventListener("click", () => switchStatsMode(button.dataset.statsMode)));
  els.notificationCenterBtn.addEventListener("click", openNotificationCenter);
  els.clearNotificationsBtn.addEventListener("click", clearNotifications);
}

async function loginWithGoogle() {
  if (!auth) return;
  els.loginError.textContent = "";
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    if (window.matchMedia("(max-width: 620px)").matches) await signInWithRedirect(auth, provider);
    else await signInWithPopup(auth, provider);
  } catch (error) {
    showLoginError(readableError(error));
  }
}

async function handleAuthChange(user) {
  if (!user) {
    session = null;
    document.body.classList.remove("is-authenticated");
    els.loginScreen.classList.remove("is-hidden");
    return;
  }

  try {
    const access = await resolveAccess(user);
    if (!access) {
      await signOut(auth);
      throw new Error("등록된 학교 구성원 또는 방과후강사 계정이 아닙니다.");
    }
    session = {
      email: user.email.toLowerCase(), name: user.displayName || user.email,
      picture: user.photoURL || "", role: access.role, department: access.department || "",
      grade: access.grade || "", classNo: access.classNo || ""
    };
    await loadCloudData();
    applySession();
  } catch (error) {
    showLoginError(readableError(error));
  }
}

async function resolveAccess(user) {
  const email = user.email?.toLowerCase() || "";
  if (email === ADMIN_EMAIL) return { role: "admin" };
  const access = await getDoc(doc(db, "access", email));
  if (email.endsWith("@nsworld.net")) {
    return access.exists() && access.data().role === "teacher"
      ? { role: "teacher", grade: String(access.data().grade), classNo: String(access.data().classNo) }
      : { role: "teacher" };
  }
  return access.exists() && access.data().role === "coach"
    ? { role: "coach", department: access.data().department }
    : null;
}

async function loadCloudData() {
  const settingsSnapshot = await getDoc(doc(db, "settings", "public"));
  if (settingsSnapshot.exists()) state.settings = { ...state.settings, ...settingsSnapshot.data() };
  else if (isAdmin()) await setDoc(doc(db, "settings", "public"), state.settings);

  const studentsRef = collection(db, "students");
  if (session.role === "teacher" && !hasHomeroom()) {
    state.students = [];
  } else {
    const studentsQuery = session.role === "coach"
      ? query(studentsRef, where("departments", "array-contains", session.department))
      : session.role === "teacher"
        ? query(studentsRef, where("grade", "==", session.grade), where("classNo", "==", session.classNo))
        : studentsRef;
    const studentsSnapshot = await getDocs(studentsQuery);
    state.students = studentsSnapshot.docs.map((item) => ({ id: item.id, ...item.data(), departments: normalizeDepartments(item.data().departments || item.data().department) }));
  }

  await loadRecords(todayKey());
  await loadContacts();
  if (isAdmin()) await loadCoachList();
}

async function loadRecords(date) {
  if (!db || !session) return;
  if (session.role === "teacher" && !hasHomeroom()) {
    state.records[date] = {};
    return;
  }
  const attendanceRef = collection(db, "attendance");
  const attendanceQuery = session.role === "coach"
    ? query(attendanceRef, where("departments", "array-contains", session.department), where("date", "==", date))
    : session.role === "teacher"
      ? query(attendanceRef, where("grade", "==", session.grade), where("classNo", "==", session.classNo), where("date", "==", date))
      : query(attendanceRef, where("date", "==", date));
  const snapshot = await getDocs(attendanceQuery);
  state.records[date] = {};
  snapshot.forEach((item) => { state.records[date][item.data().studentId] = item.data(); });
}

async function loadContacts() {
  state.contacts = {};
  if (!isAdmin()) return;
  const contactsRef = collection(db, "contacts");
  const snapshot = await getDocs(contactsRef);
  snapshot.forEach((item) => { state.contacts[item.id] = item.data().parentPhone || ""; });
}

function applySession() {
  document.body.classList.add("is-authenticated");
  els.loginScreen.classList.add("is-hidden");
  els.userName.textContent = session.name;
  els.userEmail.textContent = session.email;
  els.userRole.textContent = session.role === "coach" ? `${roleLabel[session.role]} · ${session.department}` : session.role === "teacher" && session.grade ? `${roleLabel[session.role]} · ${session.grade}학년 ${session.classNo}반 담임` : roleLabel[session.role];
  els.userPicture.src = session.picture || "logo.svg";

  const admin = isAdmin();
  els.attendanceTab.classList.toggle("is-hidden", session.role === "coach");
  els.lookupTab.classList.toggle("is-hidden", session.role === "teacher");
  els.statisticsTab.classList.toggle("is-hidden", session.role === "coach" || (session.role === "teacher" && !session.grade));
  els.settingsTab.classList.toggle("is-hidden", !admin);
  els.contactToggle.disabled = !admin;
  els.contactControl.classList.toggle("is-hidden", !admin);
  els.contactToggle.checked = state.settings.contactVisible;
  els.maskContactDefault.checked = !state.settings.contactVisible;
  els.morningTime.value = state.settings.morningTime;
  els.addStudentBtn.classList.toggle("is-hidden", !isAdmin() && !hasHomeroom());
  refreshDepartments();
  switchView(session.role === "coach" ? "lookupView" : "attendanceView");
  renderAll();
}

function switchView(viewId) {
  if (!session || !canAccessView(viewId)) return;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === viewId));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-visible", view.id === viewId));
  if (viewId === "statisticsView") { switchStatsMode("class"); loadMonthlyStatistics(); }
}

function canAccessView(viewId) {
  if (session.role === "admin") return true;
  if (session.role === "teacher") return viewId === "attendanceView" || (viewId === "statisticsView" && Boolean(session.grade));
  return session.role === "coach" && viewId === "lookupView";
}

function canEdit() { return session?.role === "admin" || session?.role === "teacher"; }
function isAdmin() { return session?.email === ADMIN_EMAIL && session?.role === "admin"; }
function hasHomeroom() { return session?.role === "teacher" && session.grade && session.classNo; }
function canManageStudent(student) { return isAdmin() || Boolean(hasHomeroom() && String(student.grade) === String(session.grade) && String(student.classNo) === String(session.classNo)); }

function refreshDepartments() {
  const departments = [...new Set(state.students.flatMap((student) => studentDepartments(student)))].sort();
  fillSelect(els.lookupDepartment, ["전체", ...departments], session.role === "coach" ? session.department : "전체");
  fillSelect(els.coachDepartmentInput, departments, departments[0] || "");
  const assignedClass = hasHomeroom() ? `${session.grade}학년 ${session.classNo}반` : "";
  const selectedClass = assignedClass || els.classFilter.value || "전체";
  const classes = [...new Set(state.students.map((student) => `${student.grade}학년 ${student.classNo}반`))]
    .sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
  const attendanceClasses = assignedClass ? [assignedClass] : ["전체", ...classes];
  fillSelect(els.classFilter, attendanceClasses, attendanceClasses.includes(selectedClass) ? selectedClass : attendanceClasses[0]);
  els.classFilter.disabled = Boolean(assignedClass);
  const allClasses = Array.from({ length: 6 }, (_, grade) => Array.from({ length: 10 }, (_, classIndex) => `${grade + 1}-${classIndex + 1}`)).flat();
  fillSelect(els.teacherClassSelect, allClasses, els.teacherClassSelect.value || "1-1");
  const statsSelected = els.statisticsClassFilter.value;
  const classValues = classes.map((value) => value.replace("학년 ", "-").replace("반", ""));
  const statsClasses = session.role === "teacher" && session.grade ? [`${session.grade}-${session.classNo}`] : ["전체", ...classValues];
  const defaultStatsClass = session.role === "teacher" ? statsClasses[0] : classValues[0] || "전체";
  fillSelect(els.statisticsClassFilter, statsClasses, statsClasses.includes(statsSelected) ? statsSelected : defaultStatsClass);
  els.statisticsClassFilter.disabled = session.role === "teacher";
}

function fillSelect(select, values, selected) {
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value; option.textContent = value; option.selected = value === selected; select.append(option);
  });
}

function renderAll() {
  renderStudents(); renderLookup(); renderCounts(); renderCoachList(); renderTeacherList();
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getTodayRecord(studentId) {
  const date = todayKey();
  state.records[date] ||= {};
  state.records[date][studentId] ||= { studentId, date, status: "unset", memo: "", saved: false };
  return state.records[date][studentId];
}

function markStudentsPresent(overwrite) {
  if (!canEdit()) return;
  const students = getScopedStudents();
  const hasExceptions = students.some((student) => ["late", "absent", "early"].includes(getTodayRecord(student.id).status));
  if (overwrite && hasExceptions && !confirm("기존 지각·결석·조퇴 기록도 모두 출석으로 바꿀까요?")) return;
  students.forEach((student) => {
    const record = getTodayRecord(student.id);
    if (overwrite || record.status === "unset") {
      record.status = "present";
      record.saved = false;
    }
  });
  renderStudents();
  renderCounts();
}

function renderStudents() {
  if (!canEdit()) return;
  const scopedStudents = getScopedStudents();
  const students = scopedStudents.filter((student) => {
    const record = getTodayRecord(student.id);
    return activeFilter === "all" || record.status === activeFilter;
  });
  const unset = scopedStudents.filter((student) => getTodayRecord(student.id).status === "unset").length;
  els.currentRosterCount.textContent = `현재 명단 ${scopedStudents.length}명 · 미입력 ${unset}명`;
  els.markUnsetPresentBtn.textContent = unset ? `미입력 ${unset}명 모두 출석` : "미입력 완료";
  els.markUnsetPresentBtn.disabled = unset === 0;
  els.studentGrid.innerHTML = "";
  students.forEach((student) => {
    const record = getTodayRecord(student.id);
    const card = document.createElement("article");
    card.className = "student-card";
    const showMemo = record.status !== "present" && record.status !== "unset" || record.memo;
    const tools = canManageStudent(student) ? `<div class="student-tools"><button type="button" data-edit-student aria-label="${escapeAttr(student.name)} 수정">수정</button><button type="button" data-delete-student aria-label="${escapeAttr(student.name)} 삭제">삭제</button></div>` : "";
    card.innerHTML = `<header><div><h3>${escapeHtml(student.name)}</h3><p class="student-meta">${escapeHtml(student.grade)}-${escapeHtml(student.classNo)}-${escapeHtml(student.number)} · ${escapeHtml(departmentLabel(student))}</p></div>${tools}</header><div class="attendance-options">${["present", "absent", "late", "early"].map((status) => `<button type="button" data-status="${status}" class="${record.status === status ? "is-selected" : ""}">${statusLabel[status]}</button>`).join("")}</div>${showMemo ? `<input class="memo-input" type="text" placeholder="특이사항 (선택)" value="${escapeAttr(record.memo)}" />` : ""}`;
    card.querySelectorAll("[data-status]").forEach((button) => button.addEventListener("click", () => {
      record.status = button.dataset.status; record.saved = false; renderStudents(); renderCounts();
    }));
    card.querySelector(".memo-input")?.addEventListener("input", (event) => { record.memo = event.target.value; record.saved = false; });
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
  els.studentDepartmentInput.value = student ? departmentLabel(student) : "";
  els.studentGradeInput.disabled = !isAdmin();
  els.studentClassInput.disabled = !isAdmin();
  els.studentDialog.showModal();
}

async function saveStudent() {
  if (!isAdmin() && !hasHomeroom()) return;
  const student = {
    id: editingStudentId || `student-${crypto.randomUUID?.() || Date.now()}`,
    name: els.studentNameInput.value.trim(),
    grade: String(isAdmin() ? els.studentGradeInput.value : session.grade),
    classNo: String(isAdmin() ? els.studentClassInput.value : session.classNo),
    number: String(els.studentNumberInput.value),
    departments: normalizeDepartments(els.studentDepartmentInput.value)
  };
  if (!student.name || !student.grade || !student.classNo || !student.number || !student.departments.length) return alert("이름, 학년, 반, 번호, 부서를 확인해 주세요.");
  if (editingStudentId && !confirm(`${student.name} 학생 정보를 수정할까요?`)) return;
  try {
    await setDoc(doc(db, "students", student.id), { name: student.name, grade: student.grade, classNo: student.classNo, number: student.number, departments: student.departments });
    const index = state.students.findIndex((item) => item.id === student.id);
    if (index >= 0) state.students[index] = student;
    else state.students.push(student);
    editingStudentId = null;
    els.studentDialog.close();
    refreshDepartments();
    renderAll();
  } catch (error) {
    alert(`학생 저장 실패: ${readableError(error)}`);
  }
}

async function deleteStudent(student) {
  if (!canManageStudent(student) || !confirm(`${student.name} 학생을 명단에서 삭제할까요?\n삭제 후에는 되돌릴 수 없습니다.`)) return;
  try {
    await deleteDoc(doc(db, "students", student.id));
    state.students = state.students.filter((item) => item.id !== student.id);
    refreshDepartments();
    renderAll();
  } catch (error) {
    alert(`학생 삭제 실패: ${readableError(error)}`);
  }
}

function getScopedStudents() {
  const queryText = els.studentSearch.value.trim().toLowerCase();
  const selectedClass = hasHomeroom() ? `${session.grade}학년 ${session.classNo}반` : els.classFilter.value || "전체";
  return state.students.filter((student) => {
    const text = `${student.name} ${departmentLabel(student)} ${student.grade}-${student.classNo}`.toLowerCase();
    const className = `${student.grade}학년 ${student.classNo}반`;
    return (!queryText || text.includes(queryText)) && (selectedClass === "전체" || selectedClass === className);
  }).sort((a, b) => Number(a.grade) - Number(b.grade) || Number(a.classNo) - Number(b.classNo) || Number(a.number) - Number(b.number));
}

function renderCounts() {
  const records = state.records[todayKey()] || {};
  const counts = { present: 0, late: 0, absent: 0, unset: 0 };
  getScopedStudents().forEach((student) => {
    const status = records[student.id]?.status || "unset";
    if (status === "present") counts.present += 1;
    else if (status === "late") counts.late += 1;
    else if (status === "absent") counts.absent += 1;
    else counts.unset += 1;
  });
  Object.keys(counts).forEach((key) => { els[`${key}Count`].textContent = counts[key]; });
}

function openReview() {
  if (!canEdit()) return;
  const students = getScopedStudents();
  if (!students.length) return alert(hasHomeroom() ? "현재 학급에 등록된 학생이 없습니다." : "담당 학급을 먼저 배정해 주세요.");
  els.reviewList.innerHTML = students.map((student) => {
    const record = getTodayRecord(student.id);
    return `<div class="review-item"><div><strong>${escapeHtml(student.name)}</strong><span class="student-meta">${escapeHtml(departmentLabel(student))} · ${escapeHtml(student.grade)}-${escapeHtml(student.classNo)}-${escapeHtml(student.number)}</span></div><div class="status-${record.status}">${statusLabel[record.status] || statusLabel.unset}${record.memo ? ` · ${escapeHtml(record.memo)}` : ""}</div></div>`;
  }).join("");
  els.reviewDialog.showModal();
}

async function confirmSave() {
  if (!canEdit()) return;
  els.confirmSaveBtn.disabled = true;
  try {
    const students = getScopedStudents().filter((student) => !getTodayRecord(student.id).saved);
    if (!students.length) {
      els.reviewDialog.close();
      return;
    }
    const batch = writeBatch(db);
    students.forEach((student) => {
      const record = getTodayRecord(student.id);
      batch.set(doc(db, "attendance", `${todayKey()}_${student.id}`), {
        studentId: student.id, date: todayKey(), grade: String(student.grade), classNo: String(student.classNo), departments: studentDepartments(student),
        status: record.status, memo: record.memo || "", updatedBy: session.email, updatedAt: serverTimestamp()
      });
      record.saved = true;
    });
    await batch.commit();
    els.reviewDialog.close();
    renderAll();
  } catch (error) {
    alert(`저장 실패: ${readableError(error)}`);
  } finally {
    els.confirmSaveBtn.disabled = false;
  }
}

async function clearToday() {
  if (!canEdit() || !confirm("오늘 출결 기록을 초기화할까요?")) return;
  if (session.role === "teacher" && !hasHomeroom()) return alert("담당 학급을 먼저 배정해 주세요.");
  const attendanceRef = collection(db, "attendance");
  const attendanceQuery = session.role === "teacher"
    ? query(attendanceRef, where("grade", "==", session.grade), where("classNo", "==", session.classNo), where("date", "==", todayKey()))
    : query(attendanceRef, where("date", "==", todayKey()));
  const snapshot = await getDocs(attendanceQuery);
  const batch = writeBatch(db);
  snapshot.forEach((item) => batch.delete(item.ref));
  await batch.commit();
  state.records[todayKey()] = {};
  renderAll();
}

function renderLookup() {
  if (!session || session.role === "teacher") return;
  const coach = session.role === "coach";
  els.lookupDepartment.disabled = coach;
  if (coach) els.lookupDepartment.value = session.department;
  const department = coach ? session.department : els.lookupDepartment.value;
  const records = state.records[els.lookupDate.value || todayKey()] || {};
  const students = state.students.filter((student) => department === "전체" || studentDepartments(student).includes(department));
  const adminView = isAdmin();
  els.lookupTable.classList.toggle("no-contact", !adminView);
  els.lookupTable.innerHTML = `<div class="table-row table-head"><div>학생</div><div>부서</div><div>출결</div><div>특이사항</div>${adminView ? "<div>학부모 연락처</div>" : ""}</div>${students.map((student) => {
    const record = records[student.id] || { status: "unset", memo: "" };
    const phone = state.settings.contactVisible ? state.contacts[student.id] || "-" : "비공개";
    return `<div class="table-row"><div data-label="학생"><strong>${escapeHtml(student.name)}</strong> <span class="student-meta">${escapeHtml(student.grade)}-${escapeHtml(student.classNo)}-${escapeHtml(student.number)}</span></div><div data-label="부서">${escapeHtml(departmentLabel(student))}</div><div data-label="출결" class="status-${record.status}">${statusLabel[record.status] || statusLabel.unset}</div><div data-label="특이사항">${record.memo ? escapeHtml(record.memo) : "-"}</div>${adminView ? `<div data-label="학부모 연락처">${escapeHtml(phone)}</div>` : ""}</div>`;
  }).join("")}`;
}

async function loadMonthlyStatistics() {
  if (!session || session.role === "coach") return;
  const month = els.statisticsMonth.value || todayKey().slice(0, 7);
  els.refreshStatisticsBtn.disabled = true;
  try {
    const attendanceRef = collection(db, "attendance");
    const statisticsQuery = session.role === "teacher"
      ? query(attendanceRef, where("grade", "==", session.grade), where("classNo", "==", session.classNo), where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`))
      : query(attendanceRef, where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`));
    const snapshot = await getDocs(statisticsQuery);
    state.monthlyRecords = snapshot.docs.map((item) => item.data());
    renderMonthlyStatistics();
  } catch (error) {
    alert(`통계 조회 실패: ${readableError(error)}`);
  } finally {
    els.refreshStatisticsBtn.disabled = false;
  }
}

function renderMonthlyStatistics() {
  if (!session || session.role === "coach") return;
  const selectedClass = session.role === "teacher" ? `${session.grade}-${session.classNo}` : els.statisticsClassFilter.value || "전체";
  const students = state.students.filter((student) => selectedClass === "전체" || `${student.grade}-${student.classNo}` === selectedClass);
  const studentIds = new Set(students.map((student) => student.id));
  const records = state.monthlyRecords.filter((record) => studentIds.has(record.studentId));
  const totals = { present: 0, absent: 0, late: 0, early: 0 };
  records.forEach((record) => { if (record.status in totals) totals[record.status] += 1; });
  const attended = totals.present + totals.late + totals.early;
  const total = attended + totals.absent;
  els.statsPresent.textContent = totals.present;
  els.statsAbsent.textContent = totals.absent;
  els.statsLate.textContent = totals.late;
  els.statsEarly.textContent = totals.early;
  els.statsRate.textContent = total ? `${Math.round(attended / total * 100)}%` : "0%";
  els.statisticsScope.textContent = selectedClass === "전체" ? `전체 학생 ${students.length}명` : `${selectedClass.replace("-", "학년 ")}반 · ${students.length}명`;

  renderClassStatisticsMatrix(students, records, els.statisticsMonth.value || todayKey().slice(0, 7));

  els.statisticsTable.innerHTML = `<div class="stats-row stats-head"><div>학생</div><div>기록일</div><div>출석</div><div>결석</div><div>지각</div><div>조퇴</div><div>출석률</div></div>${students.map((student) => {
    const studentRecords = records.filter((record) => record.studentId === student.id);
    const count = { present: 0, absent: 0, late: 0, early: 0 };
    studentRecords.forEach((record) => { if (record.status in count) count[record.status] += 1; });
    const studentAttended = count.present + count.late + count.early;
    const studentTotal = studentAttended + count.absent;
    const rate = studentTotal ? Math.round(studentAttended / studentTotal * 100) : 0;
    return `<div class="stats-row"><div data-label="학생"><strong>${escapeHtml(student.name)}</strong><span>${escapeHtml(student.grade)}-${escapeHtml(student.classNo)}-${escapeHtml(student.number)}</span></div><div data-label="기록일">${studentTotal}</div><div data-label="출석">${count.present}</div><div data-label="결석">${count.absent}</div><div data-label="지각">${count.late}</div><div data-label="조퇴">${count.early}</div><div data-label="출석률"><strong>${rate}%</strong></div></div>`;
  }).join("")}`;
}

function switchStatsMode(mode) {
  activeStatsMode = mode;
  document.querySelectorAll("[data-stats-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.statsMode === mode));
  els.classStatisticsPanel.classList.toggle("is-visible", mode === "class");
  els.studentStatisticsPanel.classList.toggle("is-visible", mode === "student");
}

function renderClassStatisticsMatrix(students, records, month) {
  const days = getSchoolDays(month);
  const recordMap = new Map(records.map((record) => [`${record.studentId}_${record.date}`, record.status]));
  const statusSymbol = { present: "출", absent: "결", late: "지", early: "조" };
  const weekday = ["일", "월", "화", "수", "목", "금", "토"];
  const width = 150 + days.length * 42 + 72;
  els.classStatisticsMatrix.innerHTML = `<table class="attendance-matrix" style="min-width:${width}px"><thead><tr><th class="matrix-student">학생</th>${days.map((date) => { const value = new Date(`${date}T00:00:00`); return `<th>${Number(date.slice(-2))}<small>${weekday[value.getDay()]}</small></th>`; }).join("")}<th>월계</th></tr></thead><tbody>${students.map((student) => {
    let recorded = 0;
    const cells = days.map((date) => {
      const status = recordMap.get(`${student.id}_${date}`);
      if (status) recorded += 1;
      return `<td class="${status ? `matrix-${status}` : "matrix-empty"}" title="${status ? statusLabel[status] : "미기록"}">${statusSymbol[status] || "·"}</td>`;
    }).join("");
    return `<tr><th class="matrix-student"><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.grade)}-${escapeHtml(student.classNo)}-${escapeHtml(student.number)}</small></th>${cells}<td><strong>${recorded}</strong></td></tr>`;
  }).join("")}</tbody><tfoot><tr><th class="matrix-student">일별 출석률</th>${days.map((date) => {
    const daily = students.map((student) => recordMap.get(`${student.id}_${date}`)).filter(Boolean);
    const attendedCount = daily.filter((status) => status === "present" || status === "late" || status === "early").length;
    return `<td>${daily.length ? Math.round(attendedCount / daily.length * 100) : "-"}${daily.length ? "%" : ""}</td>`;
  }).join("")}<td>-</td></tr></tfoot></table>`;
  prepareMobileWeekStatistics(students, recordMap, statusSymbol, days, month);
  switchStatsMode(activeStatsMode);
}

function prepareMobileWeekStatistics(students, recordMap, statusSymbol, days, month) {
  const weeks = [];
  let currentWeek = [];
  days.forEach((date) => {
    const day = new Date(`${date}T00:00:00`).getDay();
    if (day === 1 && currentWeek.length) { weeks.push(currentWeek); currentWeek = []; }
    currentWeek.push(date);
  });
  if (currentWeek.length) weeks.push(currentWeek);
  mobileStatsWeeks = weeks;
  mobileStatsContext = { students, recordMap, statusSymbol };
  if (mobileStatsMonth !== month) {
    mobileStatsMonth = month;
    const today = todayKey();
    const todayWeek = weeks.findIndex((week) => week.includes(today));
    mobileStatsWeekIndex = todayWeek >= 0 ? todayWeek : Math.max(0, weeks.length - 1);
  } else {
    mobileStatsWeekIndex = Math.min(mobileStatsWeekIndex, Math.max(0, weeks.length - 1));
  }
  renderMobileWeekStatistics();
}

function changeMobileStatsWeek(direction) {
  const nextIndex = mobileStatsWeekIndex + direction;
  if (nextIndex < 0 || nextIndex >= mobileStatsWeeks.length) return;
  mobileStatsWeekIndex = nextIndex;
  renderMobileWeekStatistics();
}

function renderMobileWeekStatistics() {
  if (!mobileStatsContext || !mobileStatsWeeks.length) {
    els.statsWeekLabel.textContent = "표시할 날짜 없음";
    els.mobileStatisticsMatrix.innerHTML = "";
    return;
  }
  const days = mobileStatsWeeks[mobileStatsWeekIndex];
  const { students, recordMap, statusSymbol } = mobileStatsContext;
  const weekday = ["일", "월", "화", "수", "목", "금", "토"];
  const formatDate = (date) => `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
  els.statsWeekLabel.textContent = `${formatDate(days[0])} - ${formatDate(days[days.length - 1])}`;
  els.previousStatsWeekBtn.disabled = mobileStatsWeekIndex === 0;
  els.nextStatsWeekBtn.disabled = mobileStatsWeekIndex === mobileStatsWeeks.length - 1;
  els.mobileStatisticsMatrix.innerHTML = `<table class="mobile-attendance-table"><thead><tr><th>학생</th>${days.map((date) => `<th><strong>${Number(date.slice(-2))}</strong><small>${weekday[new Date(`${date}T00:00:00`).getDay()]}</small></th>`).join("")}</tr></thead><tbody>${students.map((student) => `<tr><th><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.number)}번</small></th>${days.map((date) => { const status = recordMap.get(`${student.id}_${date}`); return `<td class="${status ? `matrix-${status}` : "matrix-empty"}">${statusSymbol[status] || "·"}</td>`; }).join("")}</tr>`).join("")}</tbody><tfoot><tr><th>출석률</th>${days.map((date) => { const daily = students.map((student) => recordMap.get(`${student.id}_${date}`)).filter(Boolean); const attended = daily.filter((status) => status === "present" || status === "late" || status === "early").length; return `<td>${daily.length ? Math.round(attended / daily.length * 100) : "-"}${daily.length ? "%" : ""}</td>`; }).join("")}</tr></tfoot></table>`;
}

function getSchoolDays(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const today = new Date();
  const limit = today.getFullYear() === year && today.getMonth() + 1 === monthNumber ? Math.min(lastDay, today.getDate()) : lastDay;
  const days = [];
  for (let day = 1; day <= limit; day += 1) {
    const date = new Date(year, monthNumber - 1, day);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    days.push(`${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return days;
}

function openPrintConfirmation() {
  switchStatsMode("class");
  const [year, month] = (els.statisticsMonth.value || todayKey().slice(0, 7)).split("-");
  els.printStatisticsMeta.textContent = `${year}년 ${Number(month)}월 · ${els.statisticsScope.textContent}`;
  els.printConfirmDialog.showModal();
}

function printClassStatistics() {
  els.printConfirmDialog.close();
  document.body.classList.add("printing-statistics");
  window.addEventListener("afterprint", () => document.body.classList.remove("printing-statistics"), { once: true });
  setTimeout(() => window.print(), 0);
}

async function refreshLookup() {
  if (!session || session.role === "teacher") return;
  els.refreshLookupBtn.disabled = true;
  try {
    const settingsSnapshot = await getDoc(doc(db, "settings", "public"));
    if (settingsSnapshot.exists()) state.settings = { ...state.settings, ...settingsSnapshot.data() };
    await loadRecords(els.lookupDate.value || todayKey());
    await loadContacts();
    els.contactToggle.checked = state.settings.contactVisible;
    els.maskContactDefault.checked = !state.settings.contactVisible;
    renderLookup();
  } catch (error) {
    alert(`조회 실패: ${readableError(error)}`);
  } finally {
    els.refreshLookupBtn.disabled = false;
  }
}

async function setContactVisibility(visible) {
  if (!isAdmin()) return;
  state.settings.contactVisible = visible;
  els.contactToggle.checked = visible;
  els.maskContactDefault.checked = !visible;
  await setDoc(doc(db, "settings", "public"), { ...state.settings, updatedAt: serverTimestamp() }, { merge: true });
  await loadContacts();
  renderLookup();
}

function updateContactVisibility() {
  if (!isAdmin()) { els.contactToggle.checked = state.settings.contactVisible; return; }
  setContactVisibility(els.contactToggle.checked);
}

async function updateMorningTime() {
  if (!isAdmin()) return;
  state.settings.morningTime = els.morningTime.value;
  await setDoc(doc(db, "settings", "public"), { morningTime: state.settings.morningTime, updatedAt: serverTimestamp() }, { merge: true });
}

async function addCoach() {
  if (!isAdmin()) return;
  const email = els.coachEmailInput.value.trim().toLowerCase();
  const department = els.coachDepartmentInput.value;
  if (!email || !email.includes("@") || !department) return alert("강사 이메일과 담당 부서를 확인해 주세요.");
  if (email.endsWith("@nsworld.net")) return alert("학교 도메인 계정은 교사 권한으로 자동 분류됩니다.");
  await setDoc(doc(db, "access", email), { role: "coach", department, updatedAt: serverTimestamp(), updatedBy: session.email });
  els.coachEmailInput.value = "";
  await loadCoachList();
  renderCoachList();
}

async function loadCoachList() {
  state.coaches = {};
  state.teachers = {};
  const snapshot = await getDocs(collection(db, "access"));
  snapshot.forEach((item) => {
    if (item.data().role === "coach") state.coaches[item.id] = item.data().department;
    if (item.data().role === "teacher") state.teachers[item.id] = { grade: String(item.data().grade), classNo: String(item.data().classNo) };
  });
}

function renderCoachList() {
  if (!isAdmin()) return;
  const entries = Object.entries(state.coaches).sort(([a], [b]) => a.localeCompare(b));
  els.coachList.innerHTML = entries.length ? entries.map(([email, department]) => `<div class="coach-item"><div><strong>${escapeHtml(email)}</strong><span>${escapeHtml(department)}</span></div><button type="button" data-remove-coach="${escapeAttr(email)}" aria-label="${escapeAttr(email)} 삭제">삭제</button></div>`).join("") : `<p class="note">등록된 강사가 없습니다.</p>`;
  els.coachList.querySelectorAll("[data-remove-coach]").forEach((button) => button.addEventListener("click", async () => {
    await deleteDoc(doc(db, "access", button.dataset.removeCoach));
    delete state.coaches[button.dataset.removeCoach];
    renderCoachList();
  }));
}

async function addTeacherAssignment() {
  if (!isAdmin()) return;
  const email = els.teacherEmailInput.value.trim().toLowerCase();
  const [grade, classNo] = els.teacherClassSelect.value.split("-");
  if (!email.endsWith("@nsworld.net") || !grade || !classNo) return alert("학교 이메일과 담당 학급을 확인해 주세요.");
  if (state.teachers[email] && !confirm(`${email}의 담임 학급을 ${grade}학년 ${classNo}반으로 수정할까요?`)) return;
  await setDoc(doc(db, "access", email), { role: "teacher", grade, classNo, updatedAt: serverTimestamp(), updatedBy: session.email });
  state.teachers[email] = { grade, classNo };
  els.teacherEmailInput.value = "";
  renderTeacherList();
}

async function bulkAssignTeachers() {
  if (!isAdmin()) return;
  const assignments = parseTeacherAssignments(els.teacherBulkInput.value);
  if (!assignments.length) return alert("배정할 교사 목록을 확인해 주세요.");
  const changed = assignments.filter(({ email, grade, classNo }) => state.teachers[email] && (state.teachers[email].grade !== grade || state.teachers[email].classNo !== classNo));
  if (changed.length && !confirm(`기존 담임 ${changed.length}명의 학급 배정을 변경할까요?`)) return;
  const batch = writeBatch(db);
  assignments.forEach(({ email, grade, classNo }) => {
    batch.set(doc(db, "access", email), { role: "teacher", grade, classNo, updatedAt: serverTimestamp(), updatedBy: session.email });
    state.teachers[email] = { grade, classNo };
  });
  await batch.commit();
  els.teacherBulkInput.value = "";
  renderTeacherList();
  alert(`${assignments.length}명의 담임 배정을 저장했습니다.`);
}

function parseTeacherAssignments(text) {
  return text.split(/\r?\n/).map((line) => {
    const email = line.match(/[\w.+-]+@nsworld\.net/i)?.[0]?.toLowerCase();
    const classMatch = line.replace(email || "", "").match(/([1-6])\D+(10|[1-9])/);
    return email && classMatch ? { email, grade: classMatch[1], classNo: classMatch[2] } : null;
  }).filter(Boolean);
}

function renderTeacherList() {
  if (!isAdmin()) return;
  const entries = Object.entries(state.teachers).sort(([a], [b]) => a.localeCompare(b));
  els.teacherList.innerHTML = entries.length ? entries.map(([email, value]) => `<div class="coach-item"><div><strong>${escapeHtml(email)}</strong><span>${escapeHtml(value.grade)}학년 ${escapeHtml(value.classNo)}반</span></div><button type="button" data-remove-teacher="${escapeAttr(email)}">삭제</button></div>`).join("") : `<p class="note">배정된 담임교사가 없습니다.</p>`;
  els.teacherList.querySelectorAll("[data-remove-teacher]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm(`${button.dataset.removeTeacher}의 담임 배정을 삭제할까요?`)) return;
    await deleteDoc(doc(db, "access", button.dataset.removeTeacher));
    delete state.teachers[button.dataset.removeTeacher];
    renderTeacherList();
  }));
}

async function uploadStudents(students) {
  if (!isAdmin()) return;
  try {
    for (let start = 0; start < students.length; start += 200) {
      const batch = writeBatch(db);
      students.slice(start, start + 200).forEach(({ parentPhone, id, ...student }) => {
        const departments = normalizeDepartments(student.departments || student.department);
        batch.set(doc(db, "students", id), { name: student.name, grade: String(student.grade), classNo: String(student.classNo), number: String(student.number), departments });
        batch.set(doc(db, "contacts", id), { parentPhone: parentPhone || "" });
      });
      await batch.commit();
    }
    await loadCloudData();
    refreshDepartments();
    renderAll();
    alert(`${students.length}명의 학생 명단을 저장했습니다.`);
  } catch (error) {
    alert(`명단 저장 실패: ${readableError(error)}`);
  }
}

async function importCsv() {
  if (!isAdmin()) return;
  const url = els.csvUrlInput.value.trim();
  const file = els.csvFileInput.files?.[0];
  if (!file && !url) return alert("CSV 파일을 선택하거나 CSV 주소를 입력해 주세요.");
  try {
    let csvText = "";
    if (file) {
      csvText = await file.text();
    } else {
      const response = await fetch(normalizeCsvUrl(url));
      if (!response.ok) throw new Error("CSV를 가져오지 못했습니다.");
      csvText = await response.text();
    }
    const rows = parseCsv(csvText.replace(/^\uFEFF/, ""));
    const headers = rows.shift().map((header) => header.trim());
    const students = rows.filter((row) => row.some(Boolean)).map((row, index) => {
      const item = Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex] || ""]));
      return { id: item.id || `csv-${Date.now()}-${index}`, name: item["이름"] || item.name || "", grade: item["학년"] || item.grade || "", classNo: item["반"] || item.class || "", number: item["번호"] || item.number || "", departments: normalizeDepartments(item["부서"] || item.departments || item.department), parentPhone: item["학부모연락처"] || item.parentPhone || "" };
    }).filter((student) => student.name && student.departments.length);
    if (!students.length) throw new Error("이름과 부서가 포함된 학생 정보가 없습니다.");
    await uploadStudents(students);
  } catch (error) {
    alert(`가져오기 실패: ${readableError(error)}`);
  }
}

function normalizeCsvUrl(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!match || url.searchParams.get("output") === "csv" || url.pathname.includes("/export")) return value;
    const gid = url.searchParams.get("gid") || "0";
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
  } catch {
    return value;
  }
}

function normalizeDepartments(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[|,;/]/);
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
}

function studentDepartments(student) {
  return normalizeDepartments(student.departments || student.department);
}

function departmentLabel(student) {
  return studentDepartments(student).join(", ");
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

function loadAlarms() {
  try { return JSON.parse(localStorage.getItem(ALARM_KEY) || "{}"); } catch { return {}; }
}

function saveAlarms() { localStorage.setItem(ALARM_KEY, JSON.stringify(alarms)); }

function scheduleChecks() { setInterval(checkAlarms, 30 * 1000); checkAlarms(); }

function checkAlarms() {
  if (!canEdit()) return;
  const now = new Date(), date = todayKey(), hhmm = now.toTimeString().slice(0, 5);
  if (hhmm === state.settings.morningTime && alarms.lastMorning !== date) {
    alarms.lastMorning = date; addNotification("아침 출결 입력", "오늘 학생 출결을 입력해 주세요."); notify("아침 출결 입력 시간입니다", "오늘 학생 출결을 입력해 주세요.");
  }
  if ((now.getDay() === 1 || now.getDay() === 5) && hhmm === "14:05" && alarms.lastReview !== date) {
    alarms.lastReview = date; saveAlarms(); showReviewAlarm();
  }
}

function enableNotifications() {
  if (!isAdmin()) return;
  if (!("Notification" in window)) return alert("이 브라우저는 알림을 지원하지 않습니다.");
  Notification.requestPermission().then((permission) => alert(permission === "granted" ? "브라우저 알림이 켜졌습니다." : "알림 권한이 허용되지 않았습니다."));
}

function notify(title, body) {
  if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
  else alert(`${title}\n${body}`);
}

function showReviewAlarm() {
  if (!canEdit()) return;
  addNotification("출결 재확인", "오늘 입력된 출결 기록을 한 번 더 확인해 주세요.");
  notify("출결 재확인 알림", "오늘 입력된 출결 기록을 한 번 더 확인해 주세요.");
  if (!els.alarmDialog.open) els.alarmDialog.showModal();
}

function addNotification(title, body) {
  alarms.notifications ||= [];
  alarms.notifications.unshift({ id: Date.now(), title, body, time: new Date().toISOString(), read: false });
  alarms.notifications = alarms.notifications.slice(0, 30);
  saveAlarms();
  updateNotificationBadge();
}

function updateNotificationBadge() {
  const unread = (alarms.notifications || []).filter((item) => !item.read).length;
  els.notificationBadge.textContent = unread > 99 ? "99+" : unread;
  els.notificationBadge.classList.toggle("is-hidden", unread === 0);
  document.title = unread ? `(${unread}) ${ORIGINAL_TITLE}` : ORIGINAL_TITLE;
  if ("setAppBadge" in navigator) {
    const action = unread ? navigator.setAppBadge(unread) : navigator.clearAppBadge();
    Promise.resolve(action).catch(() => {});
  }
}

function openNotificationCenter() {
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  const items = alarms.notifications || [];
  els.notificationList.innerHTML = items.length ? items.map((item) => `<article class="notification-item ${item.read ? "" : "is-unread"}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p><time>${new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.time))}</time></article>`).join("") : `<p class="empty-notifications">도착한 알림이 없습니다.</p>`;
  items.forEach((item) => { item.read = true; });
  saveAlarms();
  updateNotificationBadge();
  els.notificationDialog.showModal();
}

function clearNotifications() {
  alarms.notifications = [];
  saveAlarms();
  updateNotificationBadge();
  els.notificationDialog.close();
}

function showLoginError(message) { els.loginError.textContent = message; }

function readableError(error) {
  const messages = {
    "auth/popup-closed-by-user": "로그인 창이 닫혔습니다.",
    "auth/popup-blocked": "브라우저에서 로그인 팝업이 차단되었습니다.",
    "permission-denied": "이 작업을 수행할 권한이 없습니다."
  };
  return messages[error.code] || error.message || "처리 중 오류가 발생했습니다.";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
