import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged,
  signInWithPopup, signOut
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
const PUSH_TOKEN_SYNC_KEY = "nsworld-push-token-sync";
const PUSH_TOKEN_SYNC_INTERVAL = 24 * 60 * 60 * 1000;
const LOOKUP_REFRESH_COOLDOWN = 10 * 1000;
const COACH_LANGUAGE_KEY = "namsung-coach-language";
const ORIGINAL_TITLE = document.title;
const statusLabel = { present: "출석", late: "지각", absent: "결석", early: "조퇴", unset: "미입력" };
const roleLabel = { admin: "관리자", teacher: "교사", coach: "방과후강사" };
const COACH_I18N = {
  ko: {
    language: "언어", coach: "방과후강사", logout: "로그아웃", lookup: "출결 조회", manual: "사용 매뉴얼", title: "방과후 출결",
    description: "일별 상세 또는 월별·학년도별 학생 출결 합계를 확인합니다.", day: "일별", month: "월별", schoolYear: "학년도별",
    lookupDate: "조회 날짜", lookupMonth: "조회 월", schoolYearLabel: "학년도", department: "부서", refresh: "↻ 최신 출결 새로고침",
    student: "학생", status: "출결", memo: "특이사항", present: "출석", absent: "결석", late: "지각", early: "조퇴", unset: "미입력", records: "기록",
    choosePeriod: "기간을 선택한 뒤 <strong>최신 출결 새로고침</strong>을 눌러 주세요.", noStudents: "조회할 학생이 없습니다.",
    operationSummary: ({ days, records }) => `운영 기록 ${days}일 · 저장된 출결 ${records}건`, schoolYearName: ({ year }) => `${year}학년도`,
    wait: ({ seconds }) => `${seconds}초 후 다시 새로고침할 수 있습니다.`, lookupFailed: "조회 실패",
    install: "홈 화면에 설치", installReady: "앱 설치", notificationsOn: "알림 켜짐", notificationsEnable: "알림 켜기", notificationsPermission: "알림 허용 필요",
    notificationsUnsupported: "체험판 알림 미지원", notificationTitle: "알림함", clearNotifications: "알림 모두 지우기", noNotifications: "도착한 알림이 없습니다.", close: "닫기", confirm: "확인하기", installAction: "설치하기",
    installTitle: "출결관리 앱 설치", installBody: "설치하면 홈 화면에서 일반 앱처럼 바로 실행할 수 있습니다.", reviewTitle: "방과후 출결 확인 알림", reviewBody: "오늘 방과후 수강 학생의 출결을 확인해 주세요."
  },
  en: {
    language: "Language", coach: "Afterschool instructor", logout: "Sign out", lookup: "Attendance", manual: "User guide", title: "Afterschool attendance",
    description: "View daily details or monthly and school-year attendance totals.", day: "Daily", month: "Monthly", schoolYear: "School year",
    lookupDate: "Date", lookupMonth: "Month", schoolYearLabel: "School year", department: "Class", refresh: "↻ Refresh attendance",
    student: "Student", status: "Attendance", memo: "Notes", present: "Present", absent: "Absent", late: "Late", early: "Left early", unset: "Not entered", records: "Records",
    choosePeriod: "Select a period, then tap <strong>Refresh attendance</strong>.", noStudents: "No students found.",
    operationSummary: ({ days, records }) => `${days} class days · ${records} saved records`, schoolYearName: ({ year }) => `${year}-${year + 1} school year`,
    wait: ({ seconds }) => `Please refresh again in ${seconds} seconds.`, lookupFailed: "Could not load attendance",
    install: "Add to Home Screen", installReady: "Install app", notificationsOn: "Notifications on", notificationsEnable: "Turn on notifications", notificationsPermission: "Allow notifications",
    notificationsUnsupported: "Notifications unavailable in preview", notificationTitle: "Notifications", clearNotifications: "Clear all", noNotifications: "No notifications yet.", close: "Close", confirm: "OK", installAction: "Install",
    installTitle: "Install attendance app", installBody: "Install the app to open it directly from your Home Screen.", reviewTitle: "Afterschool attendance reminder", reviewBody: "Please check today's attendance before your afterschool class."
  },
  fr: {
    language: "Langue", coach: "Intervenant périscolaire", logout: "Se déconnecter", lookup: "Présences", manual: "Guide d’utilisation", title: "Présences périscolaires",
    description: "Consultez le détail quotidien ou les totaux mensuels et annuels.", day: "Jour", month: "Mois", schoolYear: "Année scolaire",
    lookupDate: "Date", lookupMonth: "Mois", schoolYearLabel: "Année scolaire", department: "Atelier", refresh: "↻ Actualiser les présences",
    student: "Élève", status: "Présence", memo: "Remarques", present: "Présent", absent: "Absent", late: "En retard", early: "Parti plus tôt", unset: "Non renseigné", records: "Enregistrements",
    choosePeriod: "Sélectionnez une période, puis appuyez sur <strong>Actualiser les présences</strong>.", noStudents: "Aucun élève trouvé.",
    operationSummary: ({ days, records }) => `${days} jours de cours · ${records} enregistrements`, schoolYearName: ({ year }) => `Année scolaire ${year}-${year + 1}`,
    wait: ({ seconds }) => `Veuillez réessayer dans ${seconds} secondes.`, lookupFailed: "Impossible de charger les présences",
    install: "Ajouter à l’écran d’accueil", installReady: "Installer l’application", notificationsOn: "Notifications activées", notificationsEnable: "Activer les notifications", notificationsPermission: "Autoriser les notifications",
    notificationsUnsupported: "Notifications indisponibles dans l’aperçu", notificationTitle: "Notifications", clearNotifications: "Tout effacer", noNotifications: "Aucune notification.", close: "Fermer", confirm: "OK", installAction: "Installer",
    installTitle: "Installer l’application de présence", installBody: "Installez l’application pour l’ouvrir directement depuis l’écran d’accueil.", reviewTitle: "Rappel des présences périscolaires", reviewBody: "Veuillez vérifier les présences avant votre atelier aujourd’hui."
  }
};
const DEFAULT_AFTERSCHOOL_COURSES = {
  monday: ["교육마술", "로봇 & 코딩", "무용", "미디어 스타", "바이올린", "배구", "스페인어", "창의미술", "창의요리", "첼로", "클라리넷", "프랑스(L.F.E)", "프랑스어", "플루트", "AI Makers", "Book Club", "English STEAM", "Musical", "STEAM"],
  friday: ["그래비트랙스", "대화영어", "로봇 & 코딩", "바이올린", "배구", "스케이트보드", "영화(영상)제작", "첼로", "치어리딩", "클라리넷", "클레이", "플루트", "C.E.(Conver~)", "D&D", "D&D(원어민)", "English STEAM", "Speech", "STEAM", "TED"]
};

const state = {
  students: [], records: {}, contacts: {}, admins: { [ADMIN_EMAIL]: {} }, coaches: {}, teachers: {},
  settings: { morningTime: "08:30", reviewTime: "14:05", coachReviewTime: "14:10", notificationSettingsVersion: 3, attendanceDays: [1, 5], maxClassesPerGrade: 3, contactVisible: false, autoCleanupEnabled: false, retentionMonths: 24, afterschoolCourses: structuredClone(DEFAULT_AFTERSCHOOL_COURSES) },
  maintenance: null
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
let lastLookupRefreshAt = 0;
let lookupMode = "day";
let lookupRange = { key: "", records: [], start: "", end: "" };
let activeAttendanceDate = todayKey();
let dateRolloverPromise = null;
let deferredInstallPrompt = null;
let coachLanguage = "ko";

const els = Object.fromEntries([
  "loginScreen", "googleSignInButton", "googleSetupNotice", "loginError", "installAppBtn", "installAppHeaderBtn", "installDialog", "installDialogTitle", "installDialogBody", "runInstallBtn", "userPicture", "userName", "userEmail", "userRole", "coachLanguageControl", "coachLanguageLabel", "coachLanguageSelect",
  "logoutBtn", "todayText", "mainTitle", "manualLink", "notificationCenterBtn", "notificationButtonLabel", "notificationBadge", "notificationDialog", "notificationList", "clearNotificationsBtn", "attendanceTab", "lookupTab", "settingsTab", "attendanceDayNotice", "studentSearch", "classFilter", "studentGrid", "markUnsetPresentBtn", "markAllPresentBtn", "addStudentBtn", "currentRosterCount", "reviewBtn",
  "clearTodayBtn", "saveStatusText", "reviewDialog", "reviewList", "confirmSaveBtn", "alarmDialog", "alarmDialogTitle", "alarmDialogBody", "alarmConfirmBtn", "notificationDialogTitle", "notificationCloseBtn", "installCloseBtn", "lookupDate", "lookupDateField", "lookupMonth", "lookupMonthField", "lookupSchoolYear", "lookupSchoolYearField", "lookupDepartment", "lookupDepartmentField", "lookupPeriodSummary",
  "lookupTable", "refreshLookupBtn", "lookupDescription", "lookupDateLabel", "lookupMonthLabel", "lookupSchoolYearLabel", "lookupDepartmentLabel", "importBtn", "morningTime", "reviewTime", "coachReviewTime", "testPopupBtn",
  "enableNotificationsBtn", "maskContactDefault", "csvFileInput", "deleteAllStudentsBtn", "adminEmailInput", "addAdminBtn", "adminList", "coachEmailInput", "coachDepartmentInput", "addCoachBtn", "coachCsvFileInput", "importCoachesBtn", "coachList", "mondayDepartmentInput", "addMondayDepartmentBtn", "mondayDepartmentList", "fridayDepartmentInput", "addFridayDepartmentBtn", "fridayDepartmentList", "maxClassesPerGrade", "teacherEmailInput", "teacherClassSelect", "addTeacherBtn", "teacherBulkInput", "bulkAssignTeachersBtn", "clearTeacherAssignmentsBtn", "teacherList", "autoCleanupEnabled", "retentionMonths", "saveRetentionSettingsBtn", "cleanupStatus", "refreshCleanupStatusBtn",
  "studentDialog", "studentDialogTitle", "studentNameInput", "studentGradeInput", "studentClassInput", "studentNumberInput", "studentAfterschoolNone", "studentAfterschoolEnrolled", "studentAfterschoolDays", "studentMondayToggle", "studentMondayDepartment", "studentFridayToggle", "studentFridayDepartment", "saveStudentBtn",
  "statusStrip", "presentCountItem", "lateCountItem", "earlyCountItem", "absentCountItem", "unsetCountItem", "presentCount", "lateCount", "earlyCount", "absentCount", "unsetCount", "presentCountLabel", "lateCountLabel", "earlyCountLabel", "absentCountLabel", "unsetCountLabel"
].map((id) => [id, document.getElementById(id)]));

init();

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallUi();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  updateInstallUi();
});

async function init() {
  els.todayText.textContent = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date());
  els.lookupDate.value = todayKey();
  els.lookupMonth.value = todayKey().slice(0, 7);
  fillSchoolYearOptions();
  bindEvents();
  alarms.notifications ||= [];
  notificationRegistration = await registerNotificationWorker();
  updateNotificationPermissionUi();
  updateNotificationBadge();
  updateInstallUi();
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
    onAuthStateChanged(auth, handleAuthChange);
  } catch (error) {
    showLoginError(readableError(error));
  }
}

function bindEvents() {
  els.googleSignInButton.addEventListener("click", loginWithGoogle);
  els.installAppBtn.addEventListener("click", openInstallFlow);
  els.installAppHeaderBtn.addEventListener("click", openInstallFlow);
  els.runInstallBtn.addEventListener("click", installApp);
  els.logoutBtn.addEventListener("click", () => auth && signOut(auth));
  els.coachLanguageSelect.addEventListener("change", () => {
    coachLanguage = els.coachLanguageSelect.value;
    localStorage.setItem(COACH_LANGUAGE_KEY, coachLanguage);
    applyCoachLanguage();
    renderLookup();
  });
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
  els.lookupDate.addEventListener("change", async () => { if (lookupMode === "day") { await loadRecords(els.lookupDate.value); renderLookup(); renderCounts(); } });
  els.lookupMonth.addEventListener("change", clearLookupRange);
  els.lookupSchoolYear.addEventListener("change", clearLookupRange);
  els.lookupDepartment.addEventListener("change", () => { clearLookupRange(); renderLookup(); });
  document.querySelectorAll("[data-lookup-mode]").forEach((button) => button.addEventListener("click", () => setLookupMode(button.dataset.lookupMode)));
  els.refreshLookupBtn.addEventListener("click", refreshLookup);
  els.maskContactDefault.addEventListener("change", () => setContactVisibility(!els.maskContactDefault.checked));
  els.importBtn.addEventListener("click", importCsv);
  els.deleteAllStudentsBtn.addEventListener("click", deleteAllStudents);
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
  els.clearTeacherAssignmentsBtn.addEventListener("click", clearTeacherAssignments);
  document.querySelectorAll("[data-attendance-day]").forEach((input) => input.addEventListener("change", updateAttendanceDays));
  els.maxClassesPerGrade.addEventListener("change", updateMaxClassesPerGrade);
  els.saveRetentionSettingsBtn.addEventListener("click", saveRetentionSettings);
  els.refreshCleanupStatusBtn.addEventListener("click", loadMaintenanceStatus);
  els.notificationCenterBtn.addEventListener("click", openNotificationCenter);
  els.clearNotificationsBtn.addEventListener("click", clearNotifications);
}

async function loginWithGoogle() {
  if (!auth) return;
  els.loginError.textContent = "";
  els.googleSignInButton.disabled = true;
  els.googleSignInButton.textContent = "Google 로그인 여는 중...";
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    // Popup auth avoids cross-origin redirect storage failures on Android browsers.
    await signInWithPopup(auth, provider);
  } catch (error) {
    showLoginError(readableError(error));
  } finally {
    els.googleSignInButton.disabled = false;
    els.googleSignInButton.textContent = "Google 계정으로 로그인";
  }
}

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function updateInstallUi() {
  const installed = isStandaloneApp();
  [els.installAppBtn, els.installAppHeaderBtn].forEach((button) => {
    if (!button) return;
    button.classList.toggle("is-hidden", installed);
    button.textContent = session?.role === "coach"
      ? coachText(deferredInstallPrompt ? "installReady" : "install")
      : deferredInstallPrompt ? "앱 설치" : "홈 화면에 설치";
  });
}

function installInstructions() {
  if (isIosDevice()) {
    return "Safari에서 아래 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하세요. Chrome에서는 설치할 수 없으므로 이 주소를 Safari로 열어 주세요.";
  }
  if (/Android/i.test(navigator.userAgent)) {
    return "Chrome은 오른쪽 위 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요. 삼성 인터넷은 메뉴에서 ‘현재 페이지 추가’ → ‘홈 화면’을 선택하세요.";
  }
  return "브라우저 주소창의 설치 아이콘이나 메뉴의 ‘앱 설치’를 선택하세요.";
}

function openInstallFlow() {
  if (isStandaloneApp()) return;
  const coach = session?.role === "coach";
  els.installDialogTitle.textContent = coach ? coachText("installTitle") : "출결관리 앱 설치";
  els.installDialogBody.textContent = deferredInstallPrompt
    ? coach ? coachText("installBody") : "설치하면 홈 화면에서 일반 앱처럼 바로 실행할 수 있습니다."
    : installInstructions();
  els.runInstallBtn.classList.toggle("is-hidden", !deferredInstallPrompt);
  if (!els.installDialog.open) els.installDialog.showModal();
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await prompt.prompt();
  await prompt.userChoice;
  els.installDialog.close();
  updateInstallUi();
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
    state.maintenance = maintenanceFromSettings(savedSettings);
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
  snapshot.forEach((item) => {
    const record = item.data();
    state.records[date][record.studentId] = { ...record, saved: true };
  });
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

  const savedCoachLanguage = localStorage.getItem(COACH_LANGUAGE_KEY);
  coachLanguage = session.role === "coach" && ["ko", "en", "fr"].includes(savedCoachLanguage) ? savedCoachLanguage : "ko";

  const admin = isAdmin();
  els.attendanceTab.classList.toggle("is-hidden", session.role === "coach");
  els.lookupTab.classList.remove("is-hidden");
  els.settingsTab.classList.toggle("is-hidden", !admin);
  els.lookupDepartmentField.classList.toggle("is-hidden", session.role === "teacher");
  els.maskContactDefault.checked = !state.settings.contactVisible;
  els.morningTime.value = state.settings.morningTime;
  els.reviewTime.value = state.settings.reviewTime;
  els.coachReviewTime.value = state.settings.coachReviewTime;
  els.maxClassesPerGrade.value = state.settings.maxClassesPerGrade;
  els.autoCleanupEnabled.checked = state.settings.autoCleanupEnabled;
  els.retentionMonths.value = String(state.settings.retentionMonths);
  renderMaintenanceStatus();
  document.querySelectorAll("[data-attendance-day]").forEach((input) => { input.checked = state.settings.attendanceDays.includes(Number(input.dataset.attendanceDay)); });
  els.addStudentBtn.classList.toggle("is-hidden", !isAdmin() && !hasHomeroom());
  const coachView = session.role === "coach";
  els.lateCountItem.classList.toggle("is-hidden", coachView);
  els.earlyCountItem.classList.toggle("is-hidden", coachView);
  els.statusStrip.classList.toggle("coach-summary", coachView);
  updateNotificationPermissionUi();
  if (canReceiveNotifications() && "Notification" in window && Notification.permission === "granted") registerPushToken().catch(() => {});
  refreshDepartments();
  setLookupMode("day");
  applyCoachLanguage();
  switchView(session.role === "coach" ? "lookupView" : "attendanceView");
  renderAll();
}

async function loadMaintenanceStatus(showError = true) {
  if (!isAdmin()) return;
  els.refreshCleanupStatusBtn.disabled = true;
  try {
    const snapshot = await getDoc(doc(db, "settings", "public"));
    state.maintenance = snapshot.exists() ? maintenanceFromSettings(snapshot.data()) : null;
    renderMaintenanceStatus();
  } catch (error) {
    if (showError) alert(`자동 정리 상태 조회 실패: ${readableError(error)}`);
    els.cleanupStatus.textContent = "자동 정리 상태를 불러오지 못했습니다.";
  } finally {
    els.refreshCleanupStatusBtn.disabled = false;
  }
}

function maintenanceFromSettings(settings) {
  if (!settings?.cleanupLastRunAt) return null;
  return {
    status: settings.cleanupStatus,
    deletedCount: settings.cleanupDeletedCount,
    cutoffDate: settings.cleanupCutoffDate,
    retentionMonths: settings.cleanupRetentionMonths,
    lastRunAt: settings.cleanupLastRunAt,
    message: settings.cleanupMessage
  };
}

function renderMaintenanceStatus() {
  if (!isAdmin()) return;
  const result = state.maintenance;
  if (!result) {
    els.cleanupStatus.innerHTML = `<strong>실행 기록 없음</strong><span>자동 삭제를 켜고 저장하면 다음 월간 작업부터 실행됩니다.</span>`;
    return;
  }
  const ranAt = result.lastRunAt?.toDate ? result.lastRunAt.toDate() : new Date(result.lastRunAt || 0);
  const ranAtText = Number.isNaN(ranAt.getTime()) ? "날짜 확인 불가" : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(ranAt);
  const statusText = result.status === "completed" ? "정상 완료" : result.status === "partial" ? "일부 정리 완료" : "실행 실패";
  els.cleanupStatus.innerHTML = `<strong>${escapeHtml(statusText)}</strong><span>마지막 실행 ${escapeHtml(ranAtText)} · 삭제 ${Number(result.deletedCount || 0).toLocaleString("ko-KR")}건 · 기준일 ${escapeHtml(result.cutoffDate || "-")}</span>`;
}

async function saveRetentionSettings() {
  if (!isAdmin()) return;
  const enabled = els.autoCleanupEnabled.checked;
  const retentionMonths = Number(els.retentionMonths.value);
  if (![12, 24, 36, 60].includes(retentionMonths)) return alert("보관 기간을 다시 선택해 주세요.");
  if (enabled && !confirm(`${retentionMonths}개월이 지난 출결을 매월 자동 삭제할까요?\n삭제된 기록은 복구할 수 없습니다.`)) return;
  els.saveRetentionSettingsBtn.disabled = true;
  try {
    await setDoc(doc(db, "settings", "public"), { autoCleanupEnabled: enabled, retentionMonths, updatedAt: serverTimestamp() }, { merge: true });
    state.settings.autoCleanupEnabled = enabled;
    state.settings.retentionMonths = retentionMonths;
    alert(enabled ? `자동 삭제를 켰습니다. ${retentionMonths}개월이 지난 출결부터 매월 정리됩니다.` : "오래된 출결 자동 삭제를 껐습니다.");
  } catch (error) {
    els.autoCleanupEnabled.checked = state.settings.autoCleanupEnabled;
    els.retentionMonths.value = String(state.settings.retentionMonths);
    alert(`보관 설정 저장 실패: ${readableError(error)}`);
  } finally {
    els.saveRetentionSettingsBtn.disabled = false;
  }
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
  if (session.role === "teacher") return ["attendanceView", "lookupView"].includes(viewId);
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

function resetSessionCache() {
  loadedRecordKeys.clear();
  state.records = {};
  state.contacts = {};
  contactsLoaded = false;
  accessCatalogLoaded = false;
  attendanceClassInitialized = false;
  pushTokenActive = false;
  lookupRange = { key: "", records: [], start: "", end: "" };
}

function currentSchoolYear(date = new Date()) {
  return date.getMonth() >= 2 ? date.getFullYear() : date.getFullYear() - 1;
}

function coachText(key, values = {}) {
  const table = COACH_I18N[coachLanguage] || COACH_I18N.ko;
  const value = table[key] ?? COACH_I18N.ko[key] ?? key;
  return typeof value === "function" ? value(values) : value;
}

function coachLocale() {
  return coachLanguage === "en" ? "en-US" : coachLanguage === "fr" ? "fr-FR" : "ko-KR";
}

function displayStatusLabel(status) {
  return session?.role === "coach" ? coachText(status) : statusLabel[status] || statusLabel.unset;
}

function applyCoachLanguage() {
  if (session?.role !== "coach") {
    document.documentElement.lang = "ko";
    els.coachLanguageControl.classList.add("is-hidden");
    return;
  }
  document.documentElement.lang = coachLanguage;
  els.coachLanguageControl.classList.remove("is-hidden");
  els.coachLanguageSelect.value = coachLanguage;
  els.coachLanguageLabel.textContent = coachText("language");
  els.userRole.textContent = `${coachText("coach")} · ${session.department}`;
  els.logoutBtn.textContent = coachText("logout");
  els.lookupTab.textContent = coachText("lookup");
  els.manualLink.textContent = coachText("manual");
  els.mainTitle.textContent = coachText("title");
  els.todayText.textContent = new Intl.DateTimeFormat(coachLocale(), { dateStyle: "full" }).format(new Date());
  els.lookupDescription.textContent = coachText("description");
  document.querySelectorAll("[data-lookup-mode]").forEach((button) => { button.textContent = coachText(button.dataset.lookupMode); });
  els.lookupDateLabel.textContent = coachText("lookupDate");
  els.lookupMonthLabel.textContent = coachText("lookupMonth");
  els.lookupSchoolYearLabel.textContent = coachText("schoolYearLabel");
  els.lookupDepartmentLabel.textContent = coachText("department");
  els.refreshLookupBtn.textContent = coachText("refresh");
  els.notificationDialogTitle.textContent = coachText("notificationTitle");
  els.clearNotificationsBtn.textContent = coachText("clearNotifications");
  els.notificationCloseBtn.textContent = coachText("close");
  els.alarmConfirmBtn.textContent = coachText("confirm");
  els.installCloseBtn.textContent = coachText("close");
  els.runInstallBtn.textContent = coachText("installAction");
  ["present", "late", "early", "absent", "unset"].forEach((status) => { els[`${status}CountLabel`].textContent = coachText(status); });
  updateInstallUi();
  updateNotificationPermissionUi();
}

function fillSchoolYearOptions() {
  const current = currentSchoolYear();
  const years = Array.from({ length: 8 }, (_, index) => current - index);
  fillSelect(els.lookupSchoolYear, years.map(String), String(current));
}

function setLookupMode(mode) {
  if (!["day", "month", "schoolYear"].includes(mode)) return;
  lookupMode = mode;
  document.querySelectorAll("[data-lookup-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.lookupMode === mode));
  els.lookupDateField.classList.toggle("is-hidden", mode !== "day");
  els.lookupMonthField.classList.toggle("is-hidden", mode !== "month");
  els.lookupSchoolYearField.classList.toggle("is-hidden", mode !== "schoolYear");
  clearLookupRange();
  renderLookup();
}

function clearLookupRange() {
  lookupRange = { key: "", records: [], start: "", end: "" };
  els.lookupPeriodSummary.classList.add("is-hidden");
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
  state.records[date][studentId] ||= { studentId, date, status: "unset", memo: "", saved: true };
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
    const tools = canManageStudent(student) ? `<div class="student-tools"><button type="button" data-edit-student aria-label="${escapeAttr(student.name)} 수정">수정</button><button type="button" data-delete-student aria-label="${escapeAttr(student.name)} 삭제">삭제</button></div>` : "";
    card.innerHTML = `<header><div><h3>${escapeHtml(student.name)}</h3><p class="student-meta">${escapeHtml(student.grade)}-${escapeHtml(student.classNo)}-${escapeHtml(student.number)} · ${escapeHtml(departmentLabel(student))}</p></div>${tools}</header><div class="attendance-options">${["present", "absent", "late", "early"].map((status) => `<button type="button" data-status="${status}" class="${record.status === status ? "is-selected" : ""}"${enabled ? "" : " disabled"}>${statusLabel[status]}</button>`).join("")}</div>${showMemo ? `<input class="memo-input" type="text" placeholder="특이사항 (선택)" value="${escapeAttr(record.memo)}"${enabled ? "" : " disabled"} />` : ""}`;
    card.querySelectorAll("[data-status]").forEach((button) => button.addEventListener("click", () => {
      if (record.status === button.dataset.status) return;
      record.status = button.dataset.status; record.saved = false; renderStudents(); renderCounts();
    }));
    card.querySelector(".memo-input")?.addEventListener("input", (event) => {
      if (record.memo === event.target.value) return;
      record.memo = event.target.value; record.saved = false;
      updateSaveState(scopedStudents, enabled);
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
    if (isAdmin()) {
      const batch = writeBatch(db);
      batch.delete(doc(db, "students", student.id));
      batch.delete(doc(db, "contacts", student.id));
      await batch.commit();
    } else {
      await deleteDoc(doc(db, "students", student.id));
    }
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
    const pending = getScopedStudents()
      .map((student) => ({ student, record: getTodayRecord(student.id) }))
      .filter(({ record }) => !record.saved);
    if (!pending.length) {
      els.reviewDialog.close();
      return;
    }
    const batch = writeBatch(db);
    pending.forEach(({ student, record }) => {
      batch.set(doc(db, "attendance", `${todayKey()}_${student.id}`), {
        studentId: student.id, date: todayKey(), grade: String(student.grade), classNo: String(student.classNo), departments: studentDepartments(student),
        status: record.status, memo: record.memo || "", updatedBy: session.email, updatedAt: serverTimestamp()
      });
    });
    await batch.commit();
    pending.forEach(({ record }) => { record.saved = true; });
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
  if (!session) return;
  if (lookupMode !== "day") return renderLookupSummary();
  const coach = session.role === "coach";
  const teacher = session.role === "teacher";
  els.lookupDepartment.disabled = coach || teacher;
  if (coach) els.lookupDepartment.value = session.department;
  if (teacher) els.lookupDepartment.value = "전체";
  const department = coach ? session.department : teacher ? "전체" : els.lookupDepartment.value;
  const records = state.records[els.lookupDate.value || todayKey()] || {};
  const students = state.students.filter((student) => department === "전체" || studentDepartments(student).includes(department));
  const adminView = isAdmin();
  els.lookupPeriodSummary.classList.add("is-hidden");
  els.lookupTable.classList.remove("lookup-summary-table");
  els.lookupTable.classList.remove("coach-lookup-summary");
  els.lookupTable.classList.toggle("no-contact", !adminView);
  const labels = { student: coach ? coachText("student") : "학생", department: coach ? coachText("department") : "부서", status: coach ? coachText("status") : "출결", memo: coach ? coachText("memo") : "특이사항" };
  els.lookupTable.innerHTML = `<div class="table-row table-head"><div>${labels.student}</div><div>${labels.department}</div><div>${labels.status}</div><div>${labels.memo}</div>${adminView ? "<div>학부모 연락처</div>" : ""}</div>${students.map((student) => {
    const record = records[student.id] || { status: "unset", memo: "" };
    const displayStatus = coach && ["late", "early"].includes(record.status) ? "absent" : record.status;
    const phone = state.settings.contactVisible ? state.contacts[student.id] || "-" : "비공개";
    const visibleDepartment = department === "전체" ? departmentLabel(student) : department;
    return `<div class="table-row"><div data-label="${labels.student}"><strong>${escapeHtml(student.name)}</strong> <span class="student-meta">${escapeHtml(student.grade)}-${escapeHtml(student.classNo)}-${escapeHtml(student.number)}</span></div><div data-label="${labels.department}">${escapeHtml(visibleDepartment)}</div><div data-label="${labels.status}" class="status-${displayStatus}">${displayStatusLabel(displayStatus)}</div><div data-label="${labels.memo}">${record.memo ? escapeHtml(record.memo) : "-"}</div>${adminView ? `<div data-label="학부모 연락처">${escapeHtml(phone)}</div>` : ""}</div>`;
  }).join("")}`;
}

function lookupDateRange() {
  if (lookupMode === "month") {
    const [year, month] = (els.lookupMonth.value || todayKey().slice(0, 7)).split("-").map(Number);
    const endDay = new Date(year, month, 0).getDate();
    const label = session?.role === "coach"
      ? new Intl.DateTimeFormat(coachLocale(), { year: "numeric", month: "long" }).format(new Date(year, month - 1, 1))
      : `${year}년 ${month}월`;
    return { start: `${year}-${String(month).padStart(2, "0")}-01`, end: `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`, label };
  }
  const year = Number(els.lookupSchoolYear.value || currentSchoolYear());
  const endDay = new Date(year + 1, 2, 0).getDate();
  return { start: `${year}-03-01`, end: `${year + 1}-02-${String(endDay).padStart(2, "0")}`, label: session?.role === "coach" ? coachText("schoolYearName", { year }) : `${year}학년도` };
}

async function loadRangeRecords(start, end, department) {
  const attendanceRef = collection(db, "attendance");
  const attendanceQuery = session.role === "teacher"
    ? query(attendanceRef, where("grade", "==", session.grade), where("classNo", "==", session.classNo), where("date", ">=", start), where("date", "<=", end))
    : query(attendanceRef, where("departments", "array-contains", department), where("date", ">=", start), where("date", "<=", end));
  const snapshot = await getDocs(attendanceQuery);
  return snapshot.docs.map((item) => item.data());
}

function renderLookupSummary() {
  const coach = session.role === "coach";
  const teacher = session.role === "teacher";
  const department = coach ? session.department : teacher ? "전체" : els.lookupDepartment.value;
  const students = state.students.filter((student) => department === "전체" || studentDepartments(student).includes(department));
  els.lookupTable.classList.add("lookup-summary-table", "no-contact");
  els.lookupTable.classList.toggle("coach-lookup-summary", coach);
  if (!lookupRange.key) {
    els.lookupPeriodSummary.classList.add("is-hidden");
    els.lookupTable.innerHTML = `<p class="lookup-empty">${coach ? coachText("choosePeriod") : `기간과 ${isAdmin() ? "부서를 " : ""}선택한 뒤 <strong>최신 출결 새로고침</strong>을 눌러 주세요.`}</p>`;
    return;
  }
  const byStudent = new Map();
  lookupRange.records.forEach((record) => {
    const summary = byStudent.get(record.studentId) || { present: 0, absent: 0, late: 0, early: 0, total: 0 };
    const status = coach && ["late", "early"].includes(record.status) ? "absent" : record.status;
    if (summary[status] !== undefined) summary[status] += 1;
    summary.total += 1;
    byStudent.set(record.studentId, summary);
  });
  const operationDays = new Set(lookupRange.records.map((record) => record.date)).size;
  const recordCount = lookupRange.records.length.toLocaleString(coach ? coachLocale() : "ko-KR");
  const summaryText = coach ? coachText("operationSummary", { days: operationDays, records: recordCount }) : `운영 기록 ${operationDays}일 · 저장된 출결 ${recordCount}건`;
  els.lookupPeriodSummary.innerHTML = `<strong>${escapeHtml(lookupRange.label)}</strong><span>${escapeHtml(department === "전체" ? teacher ? `${session.grade}학년 ${session.classNo}반` : "전체" : department)} · ${escapeHtml(summaryText)}</span>`;
  els.lookupPeriodSummary.classList.remove("is-hidden");
  const columns = coach
    ? `<div>${coachText("student")}</div><div>${coachText("present")}</div><div>${coachText("absent")}</div><div>${coachText("records")}</div>`
    : `<div>학생</div><div>출석</div><div>결석</div><div>지각</div><div>조퇴</div><div>기록</div>`;
  const rows = students.map((student) => {
    const count = byStudent.get(student.id) || { present: 0, absent: 0, late: 0, early: 0, total: 0 };
    const identity = `<strong>${escapeHtml(student.name)}</strong><span class="student-meta">${escapeHtml(student.grade)}-${escapeHtml(student.classNo)}-${escapeHtml(student.number)}</span>`;
    return coach
      ? `<div class="table-row lookup-summary-row"><div data-label="${coachText("student")}">${identity}</div><div data-label="${coachText("present")}" class="status-present">${count.present}</div><div data-label="${coachText("absent")}" class="status-absent">${count.absent}</div><div data-label="${coachText("records")}">${count.total}</div></div>`
      : `<div class="table-row lookup-summary-row"><div data-label="학생">${identity}</div><div data-label="출석" class="status-present">${count.present}</div><div data-label="결석" class="status-absent">${count.absent}</div><div data-label="지각" class="status-late">${count.late}</div><div data-label="조퇴" class="status-early">${count.early}</div><div data-label="기록">${count.total}</div></div>`;
  }).join("");
  els.lookupTable.innerHTML = `<div class="table-row table-head lookup-summary-row">${columns}</div>${rows || `<p class="lookup-empty">${coach ? coachText("noStudents") : "조회할 학생이 없습니다."}</p>`}`;
}

async function refreshLookup() {
  if (!session) return;
  const waitMs = LOOKUP_REFRESH_COOLDOWN - (Date.now() - lastLookupRefreshAt);
  if (waitMs > 0) return alert(session.role === "coach" ? coachText("wait", { seconds: Math.ceil(waitMs / 1000) }) : `${Math.ceil(waitMs / 1000)}초 후 다시 새로고침할 수 있습니다.`);
  els.refreshLookupBtn.disabled = true;
  try {
    if (session.role === "teacher" && !hasHomeroom()) return alert("담당 학급이 배정된 교사만 출결을 조회할 수 있습니다.");
    if (lookupMode === "day") {
      await loadRecords(els.lookupDate.value || todayKey(), true);
    } else {
      const department = session.role === "coach" ? session.department : session.role === "teacher" ? "전체" : els.lookupDepartment.value;
      if (isAdmin() && department === "전체") return alert("월별·학년도별 조회는 읽기 사용량을 줄이기 위해 방과후 부서를 하나 선택해 주세요.");
      const range = lookupDateRange();
      const records = await loadRangeRecords(range.start, range.end, department);
      lookupRange = { key: `${lookupMode}_${department}_${range.start}_${range.end}`, records, ...range };
    }
    lastLookupRefreshAt = Date.now();
    if (lookupMode === "day" && isAdmin() && state.settings.contactVisible) await loadContacts();
    renderLookup();
    if (lookupMode === "day") renderCounts();
  } catch (error) {
    alert(`${session.role === "coach" ? coachText("lookupFailed") : "조회 실패"}: ${readableError(error)}`);
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
  const currentAssignment = state.admins[session.email] || state.teachers[session.email] || {};
  if (currentAssignment.grade && currentAssignment.classNo) syncCurrentHomeroom(session.email, currentAssignment.grade, currentAssignment.classNo);
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
  syncCurrentHomeroom(email, grade, classNo);
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
  const currentAssignment = assignments.find(({ email }) => email === session.email);
  if (currentAssignment) syncCurrentHomeroom(currentAssignment.email, currentAssignment.grade, currentAssignment.classNo);
  els.teacherBulkInput.value = "";
  renderAdminList();
  renderTeacherList();
  alert(`${assignments.length}명의 담임 배정을 저장했습니다.`);
}

async function clearTeacherAssignments() {
  if (!isAdmin()) return;
  const assignments = Object.keys(state.teachers);
  if (!assignments.length) return alert("해제할 담임 배정이 없습니다.");
  if (!confirm(`담임교사 ${assignments.length}명의 학급 배정을 모두 해제할까요?\n관리자 권한과 방과후강사 계정은 유지됩니다.`)) return;
  if (prompt("실수를 막기 위해 '담임전체해제'를 입력해 주세요.") !== "담임전체해제") return alert("담임 배정 전체 해제를 취소했습니다.");
  els.clearTeacherAssignmentsBtn.disabled = true;
  try {
    const batch = writeBatch(db);
    assignments.forEach((email) => {
      if (state.admins[email]) {
        batch.set(doc(db, "access", email), { role: "admin", updatedAt: serverTimestamp(), updatedBy: session.email });
        state.admins[email] = {};
      } else {
        batch.delete(doc(db, "access", email));
      }
    });
    await batch.commit();
    state.teachers = {};
    syncCurrentHomeroom(session.email);
    renderAdminList();
    renderTeacherList();
    alert(`담임 배정 ${assignments.length}건을 모두 해제했습니다.`);
  } catch (error) {
    alert(`담임 배정 전체 해제 실패: ${readableError(error)}`);
    await loadCoachList().catch(() => {});
    renderAdminList();
    renderTeacherList();
  } finally {
    els.clearTeacherAssignmentsBtn.disabled = false;
  }
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
    syncCurrentHomeroom(email);
    renderAdminList();
    renderTeacherList();
  }));
}

async function uploadStudents(students) {
  if (!isAdmin()) return;
  try {
    const [previousStudents, previousContacts] = await Promise.all([
      getDocs(collection(db, "students")),
      getDocs(collection(db, "contacts"))
    ]);
    const nextIds = new Set(students.map((student) => student.id));
    for (let start = 0; start < students.length; start += 200) {
      const batch = writeBatch(db);
      students.slice(start, start + 200).forEach(({ parentPhone, id, ...student }) => {
        const departments = normalizeDepartments(student.departments || student.department);
        batch.set(doc(db, "students", id), { name: student.name, grade: String(student.grade), classNo: String(student.classNo), number: String(student.number), departments });
        batch.set(doc(db, "contacts", id), { parentPhone: parentPhone || "" });
      });
      await batch.commit();
    }
    const obsoleteRefs = [
      ...previousStudents.docs.filter((item) => !nextIds.has(item.id)).map((item) => item.ref),
      ...previousContacts.docs.filter((item) => !nextIds.has(item.id)).map((item) => item.ref)
    ];
    await deleteDocumentRefs(obsoleteRefs);
    contactsLoaded = false;
    await loadCloudData();
    refreshDepartments();
    renderAll();
    const removedStudents = previousStudents.docs.filter((item) => !nextIds.has(item.id)).length;
    alert(`학생 명단을 새 CSV 기준으로 교체했습니다.\n저장 ${students.length}명 · 기존 명단에서 삭제 ${removedStudents}명`);
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
    const parsed = rows.map((row, index) => ({ row, line: index + 2 })).filter(({ row }) => row.some((value) => String(value).trim()));
    const students = parsed.map(({ row, line }) => {
      const item = Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex] || ""]));
      const name = String(item["이름"] || item.name || "").trim();
      const grade = String(item["학년"] || item.grade || "").trim();
      const classNo = String(item["반"] || item.class || "").trim();
      const number = String(item["번호"] || item.number || "").trim();
      const id = sanitizeStudentId(item.id || `roster-${grade}-${classNo}-${number}`);
      return { line, id, name, grade, classNo, number, departments: normalizeDepartments(item["부서"] || item.departments || item.department), parentPhone: String(item["학부모연락처"] || item.parentPhone || "").trim() };
    });
    const invalid = students.filter((student) => !student.id || !student.name || !/^[1-6]$/.test(student.grade) || !/^\d+$/.test(student.classNo) || !/^\d+$/.test(student.number) || !student.departments.length || Number(student.classNo) > state.settings.maxClassesPerGrade);
    if (invalid.length) throw new Error(`${invalid.slice(0, 10).map((student) => student.line).join(", ")}행의 이름·학년·반·번호·부서를 확인해 주세요.`);
    const duplicateIds = students.filter((student, index) => students.findIndex((other) => other.id === student.id) !== index);
    if (duplicateIds.length) throw new Error(`${[...new Set(duplicateIds.map((student) => student.line))].join(", ")}행의 id 또는 학년·반·번호가 중복됩니다.`);
    if (!students.length) throw new Error("학생 정보가 없습니다.");
    if (!confirm(`현재 학생 ${state.students.length}명을 CSV의 ${students.length}명으로 전체 교체할까요?\nCSV에 없는 학생과 연락처는 삭제되며, 교사가 수정한 정보도 CSV 기준으로 덮어씁니다.\n기존 출결 기록은 유지됩니다.`)) return;
    await uploadStudents(students);
  } catch (error) {
    alert(`가져오기 실패: ${readableError(error)}`);
  }
}

function sanitizeStudentId(value) {
  return String(value || "").trim().replace(/\//g, "-").slice(0, 160);
}

async function deleteDocumentRefs(refs) {
  for (let start = 0; start < refs.length; start += 450) {
    const batch = writeBatch(db);
    refs.slice(start, start + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function deleteAllStudents() {
  if (!isAdmin()) return;
  if (!confirm("학생 명단과 학부모 연락처를 모두 삭제할까요?\n출결 기록은 삭제하지 않습니다.")) return;
  if (prompt("실수를 막기 위해 '전체삭제'를 입력해 주세요.") !== "전체삭제") return alert("전체 삭제를 취소했습니다.");
  els.deleteAllStudentsBtn.disabled = true;
  try {
    const [studentsSnapshot, contactsSnapshot] = await Promise.all([
      getDocs(collection(db, "students")),
      getDocs(collection(db, "contacts"))
    ]);
    await deleteDocumentRefs([...studentsSnapshot.docs.map((item) => item.ref), ...contactsSnapshot.docs.map((item) => item.ref)]);
    state.students = [];
    state.contacts = {};
    state.records = {};
    loadedRecordKeys.clear();
    contactsLoaded = false;
    els.csvFileInput.value = "";
    refreshDepartments();
    renderAll();
    alert(`학생 명단 ${studentsSnapshot.size}명과 연락처를 모두 삭제했습니다. 기존 출결 기록은 유지됩니다.`);
  } catch (error) {
    alert(`학생 정보 전체 삭제 실패: ${readableError(error)}`);
  } finally {
    els.deleteAllStudentsBtn.disabled = false;
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
  const retentionMonths = [12, 24, 36, 60].includes(Number(settings.retentionMonths)) ? Number(settings.retentionMonths) : 24;
  return {
    ...settings,
    reviewTime: currentNotificationSettings ? settings.reviewTime || "14:05" : "14:05",
    coachReviewTime: currentNotificationSettings ? settings.coachReviewTime || "14:10" : "14:10",
    notificationSettingsVersion: 3,
    attendanceDays: attendanceDays.length ? attendanceDays : [1, 5],
    maxClassesPerGrade,
    autoCleanupEnabled: settings.autoCleanupEnabled === true,
    retentionMonths,
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

function scheduleChecks() {
  setInterval(() => {
    checkDateRollover().catch(() => {});
    checkAlarms();
  }, 30 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkDateRollover().catch(() => {});
  });
  window.addEventListener("focus", () => checkDateRollover().catch(() => {}));
  checkAlarms();
}

async function checkDateRollover() {
  const nextDate = todayKey();
  if (nextDate === activeAttendanceDate) return;
  if (dateRolloverPromise) return dateRolloverPromise;
  const previousDate = activeAttendanceDate;
  activeAttendanceDate = nextDate;
  dateRolloverPromise = (async () => {
    els.todayText.textContent = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date());
    if (!els.lookupDate.value || els.lookupDate.value === previousDate) els.lookupDate.value = nextDate;
    if (els.reviewDialog.open) els.reviewDialog.close();
    await loadRecords(nextDate, true);
    renderAll();
  })();
  try {
    await dateRolloverPromise;
  } finally {
    dateRolloverPromise = null;
  }
}

function checkAlarms() {
  if (!session || pushTokenActive || !canReceiveNotifications()) return;
  const now = new Date(), date = todayKey(), hhmm = now.toTimeString().slice(0, 5);
  if (!isAttendanceDay(now)) return;
  if (notificationAudiences().includes("input") && hhmm >= state.settings.morningTime && alarms.lastMorning !== date) {
    alarms.lastMorning = date; saveAlarms(); addNotification("아침 출결 입력", "오늘 학생 출결을 입력해 주세요."); notify("아침 출결 입력 시간입니다", "오늘 학생 출결을 입력해 주세요.");
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
  const audiences = notificationAudiences();
  const syncSignature = JSON.stringify({ tokenId, uid: auth.currentUser.uid, email: session.email, role: session.role, audiences });
  const previousSync = readPushTokenSync();
  if (previousSync?.signature === syncSignature && Date.now() - Number(previousSync.syncedAt || 0) < PUSH_TOKEN_SYNC_INTERVAL) {
    pushTokenActive = true;
    return true;
  }
  await setDoc(doc(db, "notificationTokens", tokenId), {
    token,
    uid: auth.currentUser.uid,
    email: session.email,
    role: session.role,
    audiences,
    active: true,
    updatedAt: serverTimestamp()
  });
  localStorage.setItem(PUSH_TOKEN_SYNC_KEY, JSON.stringify({ signature: syncSignature, syncedAt: Date.now() }));
  pushTokenActive = true;
  return true;
}

function readPushTokenSync() {
  try { return JSON.parse(localStorage.getItem(PUSH_TOKEN_SYNC_KEY) || "null"); }
  catch { return null; }
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
  els.notificationButtonLabel.textContent = session?.role === "coach"
    ? localPreview ? coachText("notificationsUnsupported") : granted ? coachText("notificationsOn") : denied ? coachText("notificationsPermission") : coachText("notificationsEnable")
    : localPreview ? "체험판 알림 미지원" : !eligible ? "알림 대상 아님" : granted ? "알림 켜짐" : denied ? "알림 허용 필요" : "알림 켜기";
  els.notificationCenterBtn.disabled = !eligible;
  els.notificationCenterBtn.title = localPreview ? "실제 배포 주소에서 알림을 설정할 수 있습니다." : denied ? "Chrome 사이트 설정에서 알림을 허용해 주세요." : "";
  els.notificationCenterBtn.classList.toggle("needs-permission", !localPreview && eligible && !granted);
  els.enableNotificationsBtn.textContent = localPreview ? "체험판에서는 알림 설정 불가" : granted ? "브라우저 알림 켜짐" : denied ? "Chrome 알림 허용 필요" : "브라우저 알림 켜기";
  els.enableNotificationsBtn.disabled = localPreview || granted;
}

function showReviewAlarm(audience = "review") {
  if (!canReceiveNotifications()) return;
  const coach = audience === "coach-review";
  const title = coach && session?.role === "coach" ? coachText("reviewTitle") : coach ? "방과후 출결 확인" : "출결 재확인";
  const body = coach && session?.role === "coach" ? coachText("reviewBody") : coach ? "오늘 방과후 수강 학생의 출결을 확인해 주세요." : "오늘 입력한 학생 출결을 한 번 더 확인해 주세요.";
  els.alarmDialogTitle.textContent = coach && session?.role === "coach" ? title : `${title} 알림`;
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
  els.notificationList.innerHTML = items.length ? items.map((item) => `<article class="notification-item ${item.read ? "" : "is-unread"}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p><time>${new Intl.DateTimeFormat(session?.role === "coach" ? coachLocale() : "ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.time))}</time></article>`).join("") : `<p class="empty-notifications">${session?.role === "coach" ? coachText("noNotifications") : "도착한 알림이 없습니다."}</p>`;
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
    "auth/popup-blocked": "로그인 창이 차단되었습니다. 브라우저의 팝업 허용 후 다시 눌러 주세요.",
    "auth/cancelled-popup-request": "이미 로그인 창이 열려 있습니다. 열린 창에서 로그인을 완료해 주세요.",
    "auth/unauthorized-domain": "현재 접속 주소가 Firebase 로그인 허용 목록에 없습니다. 관리자에게 알려 주세요.",
    "auth/network-request-failed": "네트워크 연결을 확인한 뒤 다시 로그인해 주세요.",
    "auth/web-storage-unsupported": "브라우저의 쿠키와 사이트 저장소를 허용한 뒤 다시 로그인해 주세요.",
    "permission-denied": "이 작업을 수행할 권한이 없습니다."
  };
  return messages[error.code] || error.message || "처리 중 오류가 발생했습니다.";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
