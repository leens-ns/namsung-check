import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, getRedirectResult, onAuthStateChanged,
  signInWithPopup, signInWithRedirect, signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection, deleteDoc, doc, getDoc, getDocs, getFirestore,
  query, serverTimestamp, setDoc, where, writeBatch
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import {
  getMessaging, getToken, isSupported as isMessagingSupported, onMessage
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging.js";

const ADMIN_EMAIL = "leens@nsworld.net";
const ALARM_KEY = "nsworld-alarm-state";
const ORIGINAL_TITLE = document.title;
const statusLabel = { present: "출석", late: "지각", absent: "결석", early: "조퇴", unset: "미입력" };
const roleLabel = { admin: "관리자", teacher: "교사", coach: "방과후강사" };
const DEFAULT_AFTERSCHOOL_COURSES = {
  monday: ["교육마술", "로봇 & 코딩", "무용", "미디어 스타", "바이올린", "배구", "스페인어", "창의미술", "창의요리", "첼로", "클라리넷", "프랑스(L.F.E)", "프랑스어", "플루트", "AI Makers", "Book Club", "English STEAM", "Musical", "STEAM"],
  friday: ["그래비트랙스", "대화영어", "로봇 & 코딩", "바이올린", "배구", "스케이트보드", "영화(영상)제작", "첼로", "치어리딩", "클라리넷", "클레이", "플루트", "C.E.(Conver~)", "D&D", "D&D(원어민)", "English STEAM", "Speech", "STEAM", "TED"]
};

const state = {
  students: [], records: {}, contacts: {}, admins: { [ADMIN_EMAIL]: {} }, coaches: {}, teachers: {},
  settings: { morningTime: "08:30", reviewTime: "14:05", coachReviewTime: "14:10", notificationSettingsVersion: 3, attendanceDays: [1, 5], maxClassesPerGrade: 3, contactVisible: false, afterschoolCourses: structuredClone(DEFAULT_AFTERSCHOOL_COURSES) }
};
const loadedRecordKeys = new Set();
const alarms = loadAlarms();
let activeFilter = "all";
let session = null;
let auth = null;
let db = null;
let editingStudentId = null;
let notificationRegistration = null;
let messaging = null;
let pushTokenActive = false;
let contactsLoaded = false;
let accessCatalogLoaded = false;
let attendanceClassInitialized = false;

const els = Object.fromEntries([
  "loginScreen", "googleSignInButton", "googleSetupNotice", "loginError", "userPicture", "userName", "userEmail", "userRole",
  "logoutBtn", "todayText", "notificationCenterBtn", "notificationButtonLabel", "notificationBadge", "notificationDialog", "notificationList", "clearNotificationsBtn", "attendanceTab", "lookupTab", "settingsTab", "attendanceDayNotice", "studentSearch", "classFilter", "studentGrid", "markUnsetPresentBtn", "markAllPresentBtn", "addStudentBtn", "currentRosterCount", "reviewBtn",
  "clearTodayBtn", "reviewDialog", "reviewList", "confirmSaveBtn", "alarmDialog", "alarmDialogTitle", "alarmDialogBody", "lookupDate", "lookupDepartment",
  "lookupTable", "refreshLookupBtn", "importBtn", "morningTime", "reviewTime", "coachReviewTime", "testPopupBtn",
  "enableNotificationsBtn", "maskContactDefault", "csvFileInput", "adminEmailInput", "addAdminBtn", "adminList", "coachEmailInput", "coachDepartmentInput", "addCoachBtn", "coachCsvFileInput", "importCoachesBtn", "coachList", "mondayDepartmentInput", "addMondayDepartmentBtn", "mondayDepartmentList", "fridayDepartmentInput", "addFridayDepartmentBtn", "fridayDepartmentList", "maxClassesPerGrade", "teacherEmailInput", "teacherClassSelect", "addTeacherBtn", "teacherBulkInput", "bulkAssignTeachersBtn", "teacherList",
  "studentDialog", "studentDialogTitle", "studentNameInput", "studentGradeInput", "studentClassInput", "studentNumberInput", "studentAfterschoolNone", "studentAfterschoolEnrolled", "studentAfterschoolDays", "studentMondayToggle", "studentMondayDepartment", "studentFridayToggle", "studentFridayDepartment", "saveStudentBtn",
  "statusStrip", "presentCountItem", "lateCountItem", "earlyCountItem", "absentCountItem", "unsetCountItem", "presentCount", "lateCount", "earlyCount", "absentCount", "unsetCount"
].map((id) => [id, document.getElementById(id)]));

init();

async function init() {
  els.todayText.textContent = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date());
  els.lookupDate.value = todayKey();
  bindEvents();
  alarms.notifications ||= [];
  notificationRegistration = await registerNotificationWorker();
  updateNotificationPermissionUi();
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
    await setupMessaging(app);
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
  [els.studentAfterschoolNone, els.studentAfterschoolEnrolled, els.studentMondayToggle, els.studentFridayToggle]
    .forEach((control) => control.addEventListener("change", updateAfterschoolEditor));
  els.saveStudentBtn.addEventListener("click", saveStudent);
  els.reviewBtn.addEventListener("click", openReview);
  els.confirmSaveBtn.addEventListener("click", confirmSave);
  els.clearTodayBtn.addEventListener("click", clearToday);
  els.lookupDate.addEventListener("change", async () => { await loadRecords(els.lookupDate.value); renderLookup(); renderCounts(); });
  els.lookupDepartment.addEventListener("change", renderLookup);
  els.refreshLookupBtn.addEventListener("click", refreshLookup);
  els.maskContactDefault.addEventListener("change", () => setContactVisibility(!els.maskContactDefault.checked));
  els.importBtn.addEventListener("click", importCsv);
  els.morningTime.addEventListener("change", updateMorningTime);
  els.reviewTime.addEventListener("change", updateReviewTime);
  els.coachReviewTime.addEventListener("change", updateCoachReviewTime);
  els.enableNotificationsBtn.addEventListener("click", () => enableNotifications(true));
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
    resetSessionCache();
    session = null;
    document.body.classList.remove("is-authenticated");
    els.loginScreen.classList.remove("is-hidden");
    return;
  }

  try {
    resetSessionCache();
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
  const access = await getDoc(doc(db, "access", email));
  const data = access.exists() ? access.data() : {};
  if (email === ADMIN_EMAIL || data.role === "admin") {
    return { role: "admin", grade: data.grade ? String(data.grade) : "", classNo: data.classNo ? String(data.classNo) : "" };
  }
  if (email.endsWith("@nsworld.net")) {
    return access.exists() && data.role === "teacher"
      ? { role: "teacher", grade: String(data.grade), classNo: String(data.classNo) }
      : { role: "teacher" };
  }
  return access.exists() && data.role === "coach"
    ? { role: "coach", department: data.department }
    : null;
}

async function loadCloudData() {
  const settingsSnapshot = await getDoc(doc(db, "settings", "public"));
  if (settingsSnapshot.exists()) {
    const savedSettings = settingsSnapshot.data();
    const mergedSettings = { ...state.settings, ...savedSettings };
    if (Number(savedSettings.notificationSettingsVersion || 0) < 3) Object.assign(mergedSettings, { reviewTime: "14:05", coachReviewTime: "14:10", notificationSettingsVersion: 3 });
    state.settings = normalizeSettings(mergedSettings);
    if (isAdmin() && (Number(savedSettings.notificationSettingsVersion || 0) < 3 || !Array.isArray(savedSettings.attendanceDays) || !savedSettings.maxClassesPerGrade)) {
      await setDoc(doc(db, "settings", "public"), { reviewTime: state.settings.reviewTime, coachReviewTime: state.settings.coachReviewTime, notificationSettingsVersion: 3, attendanceDays: state.settings.attendanceDays, maxClassesPerGrade: state.settings.maxClassesPerGrade, updatedAt: serverTimestamp() }, { merge: true });
    }
  }
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
}

async function loadRecords(date, forceRefresh = false) {
  if (!db || !session) return;
  if (session.role === "teacher" && !hasHomeroom()) {
    state.records[date] = {};
    return;
  }
  const recordKey = `${session.role}_${session.department || ""}_${session.grade || ""}-${session.classNo || ""}_${date}`;
  if (!forceRefresh && loadedRecordKeys.has(recordKey)) return;
  const attendanceRef = collection(db, "attendance");
  const attendanceQuery = session.role === "coach"
    ? query(attendanceRef, where("departments", "array-contains", session.department), where("date", "==", date))
    : session.role === "teacher"
      ? query(attendanceRef, where("grade", "==", session.grade), where("classNo", "==", session.classNo), where("date", "==", date))
      : query(attendanceRef, where("date", "==", date));
  const snapshot = await getDocs(attendanceQuery);
  state.records[date] = {};
  snapshot.forEach((item) => { state.records[date][item.data().studentId] = item.data(); });
  loadedRecordKeys.add(recordKey);
}

async function loadContacts() {
  if (contactsLoaded) return;
  state.contacts = {};
  if (!isAdmin()) return;
  const contactsRef = collection(db, "contacts");
  const snapshot = await getDocs(contactsRef);
  snapshot.forEach((item) => { state.contacts[item.id] = item.data().parentPhone || ""; });
  contactsLoaded = true;
}

function applySession() {
  document.body.classList.add("is-authenticated");
  els.loginScreen.classList.add("is-hidden");
  els.userName.textContent = session.name;
  els.userEmail.textContent = session.email;
  els.userRole.textContent = session.role === "coach"
    ? `${roleLabel[session.role]} · ${session.department}`
    : hasHomeroom()
      ? `${roleLabel[session.role]} · ${session.grade}학년 ${session.classNo}반 담임`
      : roleLabel[session.role];
  els.userPicture.src = session.picture || "logo.svg";

  const admin = isAdmin();
  els.attendanceTab.classList.toggle("is-hidden", session.role === "coach");
  els.lookupTab.classList.toggle("is-hidden", session.role === "teacher");
  els.settingsTab.classList.toggle("is-hidden", !admin);
  els.maskContactDefault.checked = !state.settings.contactVisible;
  els.morningTime.value = state.settings.morningTime;
  els.reviewTime.value = state.settings.reviewTime;
  els.coachReviewTime.value = state.settings.coachReviewTime;
  els.maxClassesPerGrade.value = state.settings.maxClassesPerGrade;
  document.querySelectorAll("[data-attendance-day]").forEach((input) => { input.checked = state.settings.attendanceDays.includes(Number(input.dataset.attendanceDay)); });
  els.addStudentBtn.classList.toggle("is-hidden", !isAdmin() && !hasHomeroom());
  const coachView = session.role === "coach";
  els.lateCountItem.classList.toggle("is-hidden", coachView);
  els.earlyCountItem.classList.toggle("is-hidden", coachView);
  els.statusStrip.classList.toggle("coach-summary", coachView);
  updateNotificationPermissionUi();
  if (canReceiveNotifications() && "Notification" in window && Notification.permission === "granted") registerPushToken().catch(() => {});
  refreshDepartments();
  switchView(session.role === "coach" ? "lookupView" : "attendanceView");
  renderAll();
}

function switchView(viewId) {
  if (!session || !canAccessView(viewId)) return;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === viewId));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-visible", view.id === viewId));
  if (viewId === "lookupView" && isAdmin() && state.settings.contactVisible && !contactsLoaded) loadContacts().then(renderLookup).catch(() => {});
  if (viewId === "settingsView" && isAdmin() && !accessCatalogLoaded) loadCoachList().then(renderAll).catch((error) => alert(`계정 목록 조회 실패: ${readableError(error)}`));
}

function canAccessView(viewId) {
  if (session.role === "admin") return true;
  if (session.role === "teacher") return viewId === "attendanceView";
  return session.role === "coach" && viewId === "lookupView";
}

function canEdit() { return session?.role === "admin" || session?.role === "teacher"; }
function isAttendanceDay(date = new Date()) { return state.settings.attendanceDays.includes(date.getDay()); }
function canEnterAttendanceToday() { return canEdit() && isAttendanceDay(); }
function isAdmin() { return session?.role === "admin"; }
function hasHomeroom() { return Boolean(session && ["admin", "teacher"].includes(session.role) && session.grade && session.classNo); }
function notificationAudiences() {
  if (session?.role === "admin" || (session?.role === "teacher" && hasHomeroom())) return ["input", "review"];
  if (session?.role === "coach") return ["coach-review"];
  return [];
}
function canReceiveNotifications() { return notificationAudiences().length > 0; }
function canManageStudent(student) { return isAdmin() || Boolean(hasHomeroom() && String(student.grade) === String(session.grade) && String(student.classNo) === String(session.classNo)); }

function resetSessionCache() {
  loadedRecordKeys.clear();
  state.records = {};
  state.contacts = {};
  contactsLoaded = false;
  accessCatalogLoaded = false;
  attendanceClassInitialized = false;
  pushTokenActive = false;
}

function refreshDepartments() {
  const catalogDepartments = [
    ...state.settings.afterschoolCourses.monday.map((course) => `월요:${course}`),
    ...state.settings.afterschoolCourses.friday.map((course) => `금요:${course}`)
  ];
  const departments = [...new Set([...catalogDepartments, ...state.students.flatMap((student) => studentDepartments(student))])]
    .filter((department) => !["방과후 미수강", "미수강", "없음", "-"].includes(department)).sort((a, b) => a.localeCompare(b, "ko"));
  fillSelect(els.lookupDepartment, ["전체", ...departments], session.role === "coach" ? session.department : "전체");
  fillSelect(els.coachDepartmentInput, departments, departments[0] || "");
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

function fillSelect(select, values, selected) {
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value; option.textContent = value; option.selected = value === selected; select.append(option);
  });
}

function renderAll() {
  renderStudents(); renderLookup(); renderCounts(); renderAdminList(); renderCoachList(); renderTeacherList(); renderDepartmentLists();
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
  if (!canEnterAttendanceToday()) return alert("오늘은 관리자가 지정한 방과후 운영 요일이 아닙니다.");
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
  els.reviewBtn.disabled = !enabled;
  els.clearTodayBtn.disabled = !enabled;
  els.studentGrid.innerHTML = "";
  students.forEach((student) => {
    const record = getTodayRecord(student.id);
    const card = document.createElement("article");
    const afterschool = isAfterschoolStudent(student);
    card.className = `student-card${afterschool ? " has-afterschool" : ""}${afterschool && record.status === "unset" ? " needs-afterschool-check" : ""}`;
    const showMemo = record.status !== "present" && record.status !== "unset" || record.memo;
    const tools = canManageStudent(student) ? `<div class="student-tools"><button type="button" data-edit-student aria-label="${escapeAttr(student.name)} 수정">수정</button><button type="button" data-delete-student aria-label="${escapeAttr(student.name)} 삭제">삭제</button></div>` : "";
    card.innerHTML = `<header><div><h3>${escapeHtml(student.name)}</h3><p class="student-meta">${escapeHtml(student.grade)}-${escapeHtml(student.classNo)}-${escapeHtml(student.number)} · ${escapeHtml(departmentLabel(student))}</p></div>${tools}</header><div class="attendance-options">${["present", "absent", "late", "early"].map((status) => `<button type="button" data-status="${status}" class="${record.status === status ? "is-selected" : ""}"${enabled ? "" : " disabled"}>${statusLabel[status]}</button>`).join("")}</div>${showMemo ? `<input class="memo-input" type="text" placeholder="특이사항 (선택)" value="${escapeAttr(record.memo)}"${enabled ? "" : " disabled"} />` : ""}`;
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

function fillAfterschoolCourseSelect(select, day, selected = "") {
  const prefix = day === "monday" ? "월요:" : "금요:";
  const registered = state.students.flatMap((student) => studentDepartments(student))
    .filter((department) => department.startsWith(prefix) || (day === "monday" && !department.includes(":")))
    .map((department) => department.replace(prefix, ""))
    .filter((department) => department && !["방과후 미수강", "미수강", "없음", "-"].includes(department));
  const courses = [...new Set([...(state.settings.afterschoolCourses[day] || []), ...registered, selected].filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  select.innerHTML = `<option value="">부서 선택</option>${courses.map((course) => `<option value="${escapeAttr(course)}"${course === selected ? " selected" : ""}>${escapeHtml(course)}</option>`).join("")}`;
}

function readAfterschoolSelection(student) {
  const departments = student ? studentDepartments(student) : [];
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

async function saveStudent() {
  if (!isAdmin() && !hasHomeroom()) return;
  const departments = selectedAfterschoolDepartments();
  if (!departments) return alert("방과후 수강 여부를 선택하고, 수강 시 요일과 부서를 모두 확인해 주세요.");
  const student = {
    id: editingStudentId || `student-${crypto.randomUUID?.() || Date.now()}`,
    name: els.studentNameInput.value.trim(),
    grade: String(isAdmin() ? els.studentGradeInput.value : session.grade),
    classNo: String(isAdmin() ? els.studentClassInput.value : session.classNo),
    number: String(els.studentNumberInput.value),
    departments
  };
  if (!student.name || !student.grade || !student.classNo || !student.number) return alert("이름, 학년, 반, 번호를 확인해 주세요.");
  if (Number(student.classNo) > state.settings.maxClassesPerGrade) return alert(`현재 학년별 최대 반 수는 ${state.settings.maxClassesPerGrade}반입니다.`);
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
  const selectedClass = !isAdmin() && hasHomeroom() ? `${session.grade}학년 ${session.classNo}반` : els.classFilter.value || "전체";
  return state.students.filter((student) => {
    const text = `${student.name} ${departmentLabel(student)} ${student.grade}-${student.classNo}`.toLowerCase();
    const className = `${student.grade}학년 ${student.classNo}반`;
    return (!queryText || text.includes(queryText)) && (selectedClass === "전체" || selectedClass === className);
  }).sort((a, b) => Number(a.grade) - Number(b.grade) || Number(a.classNo) - Number(b.classNo) || Number(a.number) - Number(b.number));
}

function renderCounts() {
  const records = state.records[session?.role === "coach" ? els.lookupDate.value || todayKey() : todayKey()] || {};
  const counts = { present: 0, late: 0, early: 0, absent: 0, unset: 0 };
  const students = session?.role === "coach" ? state.students : getScopedStudents();
  students.forEach((student) => {
    const status = records[student.id]?.status || "unset";
    if (status === "present") counts.present += 1;
    else if (session?.role === "coach" && ["absent", "late", "early"].includes(status)) counts.absent += 1;
    else if (status === "late") counts.late += 1;
    else if (status === "early") counts.early += 1;
    else if (status === "absent") counts.absent += 1;
    else counts.unset += 1;
  });
  Object.keys(counts).forEach((key) => { els[`${key}Count`].textContent = counts[key]; });
}

function openReview() {
  if (!canEnterAttendanceToday()) return alert("오늘은 관리자가 지정한 방과후 운영 요일이 아닙니다.");
  const students = getScopedStudents();
  if (!students.length) return alert(hasHomeroom() ? "현재 학급에 등록된 학생이 없습니다." : "담당 학급을 먼저 배정해 주세요.");
  els.reviewList.innerHTML = students.map((student) => {
    const record = getTodayRecord(student.id);
    return `<div class="review-item"><div><strong>${escapeHtml(student.name)}</strong><span class="student-meta">${escapeHtml(departmentLabel(student))} · ${escapeHtml(student.grade)}-${escapeHtml(student.classNo)}-${escapeHtml(student.number)}</span></div><div class="status-${record.status}">${statusLabel[record.status] || statusLabel.unset}${record.memo ? ` · ${escapeHtml(record.memo)}` : ""}</div></div>`;
  }).join("");
  els.reviewDialog.showModal();
}

async function confirmSave() {
  if (!canEnterAttendanceToday()) return alert("오늘은 관리자가 지정한 방과후 운영 요일이 아닙니다.");
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
  if (!canEnterAttendanceToday()) return alert("오늘은 관리자가 지정한 방과후 운영 요일이 아닙니다.");
  if (!confirm("오늘 출결 기록을 초기화할까요?")) return;
  if (session.role === "teacher" && !hasHomeroom()) return alert("담당 학급을 먼저 배정해 주세요.");
  const attendanceRef = collection(db, "attendance");
  const scopedStudents = getScopedStudents();
  const classes = uniqueStudentClasses(scopedStudents);
  if (classes.length !== 1) return alert("초기화할 학급을 하나만 선택해 주세요.");
  const [{ grade, classNo }] = classes;
  const attendanceQuery = query(attendanceRef, where("grade", "==", grade), where("classNo", "==", classNo), where("date", "==", todayKey()));
  const snapshot = await getDocs(attendanceQuery);
  const batch = writeBatch(db);
  snapshot.forEach((item) => batch.delete(item.ref));
  await batch.commit();
  state.records[todayKey()] ||= {};
  scopedStudents.forEach((student) => delete state.records[todayKey()][student.id]);
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
    const displayStatus = coach && ["late", "early"].includes(record.status) ? "absent" : record.status;
    const phone = state.settings.contactVisible ? state.contacts[student.id] || "-" : "비공개";
    const visibleDepartment = department === "전체" ? departmentLabel(student) : department;
    return `<div class="table-row"><div data-label="학생"><strong>${escapeHtml(student.name)}</strong> <span class="student-meta">${escapeHtml(student.grade)}-${escapeHtml(student.classNo)}-${escapeHtml(student.number)}</span></div><div data-label="부서">${escapeHtml(visibleDepartment)}</div><div data-label="출결" class="status-${displayStatus}">${statusLabel[displayStatus] || statusLabel.unset}</div><div data-label="특이사항">${record.memo ? escapeHtml(record.memo) : "-"}</div>${adminView ? `<div data-label="학부모 연락처">${escapeHtml(phone)}</div>` : ""}</div>`;
  }).join("")}`;
}

async function refreshLookup() {
  if (!session || session.role === "teacher") return;
  els.refreshLookupBtn.disabled = true;
  try {
    await loadRecords(els.lookupDate.value || todayKey(), true);
    if (isAdmin() && state.settings.contactVisible) await loadContacts();
    renderLookup();
    renderCounts();
  } catch (error) {
    alert(`조회 실패: ${readableError(error)}`);
  } finally {
    els.refreshLookupBtn.disabled = false;
  }
}

async function setContactVisibility(visible) {
  if (!isAdmin()) return;
  state.settings.contactVisible = visible;
  els.maskContactDefault.checked = !visible;
  await setDoc(doc(db, "settings", "public"), { ...state.settings, updatedAt: serverTimestamp() }, { merge: true });
  if (visible) await loadContacts();
  renderLookup();
}

async function updateMorningTime() {
  if (!isAdmin()) return;
  if (!isFiveMinuteTime(els.morningTime.value)) {
    els.morningTime.value = state.settings.morningTime;
    return alert("알림 시간은 5분 단위로 지정해 주세요.");
  }
  state.settings.morningTime = els.morningTime.value;
  await setDoc(doc(db, "settings", "public"), { morningTime: state.settings.morningTime, updatedAt: serverTimestamp() }, { merge: true });
}

async function updateReviewTime() {
  if (!isAdmin()) return;
  if (!isFiveMinuteTime(els.reviewTime.value)) {
    els.reviewTime.value = state.settings.reviewTime;
    return alert("알림 시간은 5분 단위로 지정해 주세요.");
  }
  state.settings.reviewTime = els.reviewTime.value;
  await setDoc(doc(db, "settings", "public"), { reviewTime: state.settings.reviewTime, notificationSettingsVersion: 3, updatedAt: serverTimestamp() }, { merge: true });
}

async function updateCoachReviewTime() {
  if (!isAdmin()) return;
  if (!isFiveMinuteTime(els.coachReviewTime.value)) {
    els.coachReviewTime.value = state.settings.coachReviewTime;
    return alert("알림 시간은 5분 단위로 지정해 주세요.");
  }
  state.settings.coachReviewTime = els.coachReviewTime.value;
  await setDoc(doc(db, "settings", "public"), { coachReviewTime: state.settings.coachReviewTime, notificationSettingsVersion: 3, updatedAt: serverTimestamp() }, { merge: true });
}

async function updateAttendanceDays() {
  if (!isAdmin()) return;
  const selected = [...document.querySelectorAll("[data-attendance-day]:checked")].map((input) => Number(input.dataset.attendanceDay)).sort();
  if (!selected.length) {
    document.querySelectorAll("[data-attendance-day]").forEach((input) => { input.checked = state.settings.attendanceDays.includes(Number(input.dataset.attendanceDay)); });
    return alert("방과후 운영 요일을 한 개 이상 선택해 주세요.");
  }
  state.settings.attendanceDays = selected;
  await setDoc(doc(db, "settings", "public"), { attendanceDays: selected, updatedAt: serverTimestamp() }, { merge: true });
  renderStudents();
}

async function updateMaxClassesPerGrade() {
  if (!isAdmin()) return;
  const value = Math.trunc(Number(els.maxClassesPerGrade.value));
  if (value < 1 || value > 10) {
    els.maxClassesPerGrade.value = state.settings.maxClassesPerGrade;
    return alert("학년별 반 수는 1~10 사이로 입력해 주세요.");
  }
  state.settings.maxClassesPerGrade = value;
  await setDoc(doc(db, "settings", "public"), { maxClassesPerGrade: value, updatedAt: serverTimestamp() }, { merge: true });
  refreshDepartments();
}

function isFiveMinuteTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) && Number(value.slice(-2)) % 5 === 0;
}

async function addAdmin() {
  if (!isAdmin()) return;
  const email = els.adminEmailInput.value.trim().toLowerCase();
  if (!email.endsWith("@nsworld.net")) return alert("관리자는 학교 이메일(@nsworld.net)만 등록할 수 있습니다.");
  if (email === ADMIN_EMAIL || state.admins[email]) return alert("이미 관리자 계정으로 등록되어 있습니다.");
  if ((state.coaches[email] || state.teachers[email]) && !confirm(`${email}의 기존 권한을 관리자 권한으로 변경할까요?`)) return;
  const homeroom = state.teachers[email] || state.admins[email] || {};
  const adminData = { role: "admin", updatedAt: serverTimestamp(), updatedBy: session.email };
  if (homeroom.grade && homeroom.classNo) Object.assign(adminData, { grade: homeroom.grade, classNo: homeroom.classNo });
  await setDoc(doc(db, "access", email), adminData);
  els.adminEmailInput.value = "";
  await loadCoachList();
  renderAll();
}

function renderAdminList() {
  if (!isAdmin()) return;
  const entries = Object.keys(state.admins).sort((a, b) => a.localeCompare(b));
  els.adminList.innerHTML = entries.map((email) => {
    const fixed = email === ADMIN_EMAIL;
    const assignment = state.admins[email] || {};
    const homeroom = assignment.grade && assignment.classNo ? ` · ${assignment.grade}학년 ${assignment.classNo}반 담임` : "";
    return `<div class="coach-item"><div><strong>${escapeHtml(email)}</strong><span>${fixed ? "기본 관리자" : "추가 관리자"}${homeroom}</span></div>${fixed ? "" : `<button type="button" data-remove-admin="${escapeAttr(email)}">삭제</button>`}</div>`;
  }).join("");
  els.adminList.querySelectorAll("[data-remove-admin]").forEach((button) => button.addEventListener("click", async () => {
    const email = button.dataset.removeAdmin;
    if (email === session.email) return alert("현재 로그인한 관리자 계정은 직접 삭제할 수 없습니다.");
    if (!confirm(`${email}의 관리자 권한을 삭제할까요?`)) return;
    const assignment = state.admins[email] || {};
    if (assignment.grade && assignment.classNo) {
      await setDoc(doc(db, "access", email), { role: "teacher", grade: assignment.grade, classNo: assignment.classNo, updatedAt: serverTimestamp(), updatedBy: session.email });
      state.teachers[email] = { grade: assignment.grade, classNo: assignment.classNo };
    } else {
      await deleteDoc(doc(db, "access", email));
    }
    delete state.admins[email];
    renderAdminList();
    renderTeacherList();
  }));
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

async function importCoachesCsv() {
  if (!isAdmin()) return;
  const file = els.coachCsvFileInput.files?.[0];
  if (!file) return alert("방과후강사 CSV 파일을 선택해 주세요.");
  try {
    const rows = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
    const headers = rows.shift().map((header) => header.trim().toLowerCase());
    const assignments = rows.filter((row) => row.some(Boolean)).map((row, index) => {
      const item = Object.fromEntries(headers.map((header, headerIndex) => [header, String(row[headerIndex] || "").trim()]));
      const email = (item["이메일"] || item["메일"] || item.email || "").toLowerCase();
      const course = item["담당 부서"] || item["담당부서"] || item["부서"] || item.department || "";
      const day = item["요일"] || item.day || "";
      return { row: index + 2, email, department: normalizeCoachDepartment(course, day) };
    });
    const invalid = assignments.filter(({ email, department }) => !email.includes("@") || email.endsWith("@nsworld.net") || !department);
    if (invalid.length) throw new Error(`${invalid.map((item) => item.row).join(", ")}행의 이메일·요일·부서를 확인해 주세요.`);
    if (!assignments.length) throw new Error("등록할 강사 정보가 없습니다.");
    const uniqueAssignments = [...new Map(assignments.map((item) => [item.email, item])).values()];
    for (let start = 0; start < uniqueAssignments.length; start += 400) {
      const batch = writeBatch(db);
      uniqueAssignments.slice(start, start + 400).forEach(({ email, department }) => {
        batch.set(doc(db, "access", email), { role: "coach", department, updatedAt: serverTimestamp(), updatedBy: session.email });
      });
      await batch.commit();
    }
    els.coachCsvFileInput.value = "";
    await loadCoachList();
    renderCoachList();
    alert(`${uniqueAssignments.length}명의 방과후강사를 등록했습니다.`);
  } catch (error) {
    alert(`강사 CSV 등록 실패: ${readableError(error)}`);
  }
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

async function loadCoachList() {
  state.admins = { [ADMIN_EMAIL]: {} };
  state.coaches = {};
  state.teachers = {};
  const snapshot = await getDocs(collection(db, "access"));
  snapshot.forEach((item) => {
    if (item.data().role === "admin") {
      const assignment = item.data().grade && item.data().classNo
        ? { grade: String(item.data().grade), classNo: String(item.data().classNo) }
        : {};
      state.admins[item.id] = assignment;
      if (assignment.grade) state.teachers[item.id] = assignment;
    }
    if (item.data().role === "coach") state.coaches[item.id] = item.data().department;
    if (item.data().role === "teacher") state.teachers[item.id] = { grade: String(item.data().grade), classNo: String(item.data().classNo) };
  });
  accessCatalogLoaded = true;
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

async function addAfterschoolCourse(day) {
  if (!isAdmin()) return;
  const input = day === "monday" ? els.mondayDepartmentInput : els.fridayDepartmentInput;
  const course = input.value.trim();
  if (!course) return alert("추가할 부서명을 입력해 주세요.");
  if (state.settings.afterschoolCourses[day].includes(course)) return alert("해당 요일에 이미 등록된 부서입니다.");
  state.settings.afterschoolCourses[day].push(course);
  state.settings.afterschoolCourses[day].sort((a, b) => a.localeCompare(b, "ko"));
  input.value = "";
  await saveAfterschoolCourses();
}

async function removeAfterschoolCourse(day, course) {
  const dayLabel = day === "monday" ? "월요일" : "금요일";
  if (!confirm(`${dayLabel} '${course}' 부서를 목록에서 삭제할까요?`)) return;
  state.settings.afterschoolCourses[day] = state.settings.afterschoolCourses[day].filter((item) => item !== course);
  await saveAfterschoolCourses();
}

async function saveAfterschoolCourses() {
  await setDoc(doc(db, "settings", "public"), { afterschoolCourses: state.settings.afterschoolCourses, updatedAt: serverTimestamp() }, { merge: true });
  refreshDepartments();
  renderDepartmentLists();
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

async function addTeacherAssignment() {
  if (!isAdmin()) return;
  const email = els.teacherEmailInput.value.trim().toLowerCase();
  const [grade, classNo] = els.teacherClassSelect.value.split("-");
  if (!email.endsWith("@nsworld.net") || !grade || !classNo) return alert("학교 이메일과 담당 학급을 확인해 주세요.");
  if (state.teachers[email] && !confirm(`${email}의 담임 학급을 ${grade}학년 ${classNo}반으로 수정할까요?`)) return;
  const role = state.admins[email] ? "admin" : "teacher";
  await setDoc(doc(db, "access", email), { role, grade, classNo, updatedAt: serverTimestamp(), updatedBy: session.email });
  state.teachers[email] = { grade, classNo };
  if (role === "admin") state.admins[email] = { grade, classNo };
  els.teacherEmailInput.value = "";
  renderAdminList();
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
    const role = state.admins[email] ? "admin" : "teacher";
    batch.set(doc(db, "access", email), { role, grade, classNo, updatedAt: serverTimestamp(), updatedBy: session.email });
    state.teachers[email] = { grade, classNo };
    if (role === "admin") state.admins[email] = { grade, classNo };
  });
  await batch.commit();
  els.teacherBulkInput.value = "";
  renderAdminList();
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
  const entries = Object.entries(state.teachers).sort(([a], [b]) => a.localeCompare(b));
  els.teacherList.innerHTML = entries.length ? entries.map(([email, value]) => `<div class="coach-item"><div><strong>${escapeHtml(email)}</strong><span>${escapeHtml(value.grade)}학년 ${escapeHtml(value.classNo)}반</span></div><button type="button" data-remove-teacher="${escapeAttr(email)}">삭제</button></div>`).join("") : `<p class="note">배정된 담임교사가 없습니다.</p>`;
  els.teacherList.querySelectorAll("[data-remove-teacher]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm(`${button.dataset.removeTeacher}의 담임 배정을 삭제할까요?`)) return;
    const email = button.dataset.removeTeacher;
    if (state.admins[email]) {
      await setDoc(doc(db, "access", email), { role: "admin", updatedAt: serverTimestamp(), updatedBy: session.email });
      state.admins[email] = {};
    } else {
      await deleteDoc(doc(db, "access", email));
    }
    delete state.teachers[email];
    renderAdminList();
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
    contactsLoaded = false;
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
  const file = els.csvFileInput.files?.[0];
  if (!file) return alert("관리자 기기에서 CSV 파일을 선택해 주세요.");
  try {
    const csvText = await file.text();
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

function normalizeDepartments(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[|,;/]/);
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
}

function normalizeSettings(settings) {
  const savedCourses = settings.afterschoolCourses || {};
  const currentNotificationSettings = Number(settings.notificationSettingsVersion || 0) >= 3;
  const attendanceDays = [...new Set((Array.isArray(settings.attendanceDays) ? settings.attendanceDays : [1, 5]).map(Number).filter((day) => day >= 1 && day <= 5))].sort();
  const maxClassesPerGrade = Math.min(10, Math.max(1, Math.trunc(Number(settings.maxClassesPerGrade) || 3)));
  return {
    ...settings,
    reviewTime: currentNotificationSettings ? settings.reviewTime || "14:05" : "14:05",
    coachReviewTime: currentNotificationSettings ? settings.coachReviewTime || "14:10" : "14:10",
    notificationSettingsVersion: 3,
    attendanceDays: attendanceDays.length ? attendanceDays : [1, 5],
    maxClassesPerGrade,
    afterschoolCourses: {
      monday: [...new Set((savedCourses.monday || DEFAULT_AFTERSCHOOL_COURSES.monday).map((value) => String(value).trim()).filter(Boolean))],
      friday: [...new Set((savedCourses.friday || DEFAULT_AFTERSCHOOL_COURSES.friday).map((value) => String(value).trim()).filter(Boolean))]
    }
  };
}

function studentDepartments(student) {
  return normalizeDepartments(student.departments || student.department);
}

function isAfterschoolStudent(student) {
  return studentDepartments(student).some((department) => !["방과후 미수강", "미수강", "없음", "-"].includes(department));
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
  if (!session || pushTokenActive || !canReceiveNotifications()) return;
  const now = new Date(), date = todayKey(), hhmm = now.toTimeString().slice(0, 5);
  if (!isAttendanceDay(now)) return;
  if (notificationAudiences().includes("input") && hhmm >= state.settings.morningTime && alarms.lastMorning !== date) {
    alarms.lastMorning = date; addNotification("아침 출결 입력", "오늘 학생 출결을 입력해 주세요."); notify("아침 출결 입력 시간입니다", "오늘 학생 출결을 입력해 주세요.");
  }
  if (notificationAudiences().includes("review") && hhmm >= state.settings.reviewTime && alarms.lastReview !== date) {
    alarms.lastReview = date; saveAlarms(); showReviewAlarm("review");
  }
  if (notificationAudiences().includes("coach-review") && hhmm >= state.settings.coachReviewTime && alarms.lastCoachReview !== date) {
    alarms.lastCoachReview = date; saveAlarms(); showReviewAlarm("coach-review");
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

async function setupMessaging(app) {
  if (!await isMessagingSupported()) return;
  messaging = getMessaging(app);
  onMessage(messaging, (payload) => {
    if (!session || !canReceiveNotifications()) return;
    const title = payload.notification?.title || "출결 알림";
    const body = payload.notification?.body || "출결관리 시스템을 확인해 주세요.";
    addNotification(title, body);
    notify(title, body);
  });
}

async function registerPushToken() {
  if (!messaging || !notificationRegistration || !session || !canReceiveNotifications()) return false;
  const options = { serviceWorkerRegistration: notificationRegistration };
  const vapidKey = window.NSWORLD_CONFIG?.webPushVapidKey?.trim();
  if (vapidKey) options.vapidKey = vapidKey;
  const token = await getToken(messaging, options);
  if (!token) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenId = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  await setDoc(doc(db, "notificationTokens", tokenId), {
    token,
    uid: auth.currentUser.uid,
    email: session.email,
    role: session.role,
    audiences: notificationAudiences(),
    active: true,
    updatedAt: serverTimestamp()
  });
  pushTokenActive = true;
  return true;
}

async function enableNotifications(showConfirmation = false) {
  if (!canReceiveNotifications()) return "denied";
  if (location.protocol === "file:") {
    if (showConfirmation) alert("체험판 파일에서는 알림을 켤 수 없습니다. 실제 배포 주소에서 설정해 주세요.");
    return "unavailable";
  }
  if (!("Notification" in window)) return alert("이 브라우저는 알림을 지원하지 않습니다.");
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    try {
      const registered = await registerPushToken();
      if (!registered && showConfirmation) alert("푸시 알림 등록을 완료하지 못했습니다. Firebase Cloud Messaging 설정을 확인해 주세요.");
      else if (showConfirmation) await notify("출결 알림이 켜졌습니다", "앱을 닫아도 예정된 출결 알림을 이 기기에서 표시합니다.");
    } catch (error) {
      if (showConfirmation) alert(`푸시 알림 등록 실패: ${readableError(error)}`);
    }
  } else if (showConfirmation) {
    alert("알림 권한이 허용되지 않았습니다. Chrome 사이트 설정에서 알림을 허용해 주세요.");
  }
  updateNotificationPermissionUi();
  return permission;
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
  els.notificationButtonLabel.textContent = localPreview ? "체험판 알림 미지원" : !eligible ? "알림 대상 아님" : granted ? "알림 켜짐" : denied ? "알림 허용 필요" : "알림 켜기";
  els.notificationCenterBtn.disabled = !eligible;
  els.notificationCenterBtn.title = localPreview ? "실제 배포 주소에서 알림을 설정할 수 있습니다." : denied ? "Chrome 사이트 설정에서 알림을 허용해 주세요." : "";
  els.notificationCenterBtn.classList.toggle("needs-permission", !localPreview && eligible && !granted);
  els.enableNotificationsBtn.textContent = localPreview ? "체험판에서는 알림 설정 불가" : granted ? "브라우저 알림 켜짐" : denied ? "Chrome 알림 허용 필요" : "브라우저 알림 켜기";
  els.enableNotificationsBtn.disabled = localPreview || granted;
}

function showReviewAlarm(audience = "review") {
  if (!canReceiveNotifications()) return;
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

async function openNotificationCenter() {
  if (location.protocol !== "file:" && "Notification" in window && Notification.permission === "denied") {
    alert("Chrome 주소창 왼쪽의 사이트 설정에서 알림을 '허용'으로 변경해 주세요.");
  }
  if (canReceiveNotifications() && "Notification" in window && Notification.permission === "default") await enableNotifications(false);
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
