import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { doc, getDoc, getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const ADMIN_EMAIL = "leens@nsworld.net";
const COACH_LANGUAGE_KEY = "namsung-coach-language";
const ACCOUNT_MODE_KEY = "namsung-account-mode";
const roleLabel = { admin: "관리자", teacher: "담임교사", coach: "방과후강사", external: "외부수업강사" };
const gate = document.getElementById("manualGate");
const gateMessage = document.getElementById("manualGateMessage");
const gateLink = document.getElementById("manualGateLink");
const app = document.getElementById("manualApp");
const roleBadge = document.getElementById("manualRoleBadge");
const subtitle = document.getElementById("manualSubtitle");
const title = document.getElementById("manualTitle");
const homeLink = document.getElementById("manualHomeLink");
const footer = document.getElementById("manualFooter");

start();

function start() {
  const config = window.NSWORLD_CONFIG?.firebase;
  if (!config?.apiKey) return showGate("매뉴얼 인증 설정을 확인할 수 없습니다.");
  try {
    const firebaseApp = initializeApp(config);
    const auth = getAuth(firebaseApp);
    const db = getFirestore(firebaseApp);
    onAuthStateChanged(auth, (user) => loadManual(user, db));
  } catch {
    showGate("매뉴얼을 불러오지 못했습니다. 메인 화면에서 다시 로그인해 주세요.");
  }
}

async function loadManual(user, db) {
  if (!user?.email) return showGate("로그인 후 계정에 맞는 매뉴얼을 볼 수 있습니다.");
  try {
    const role = await resolveRole(user.email.toLowerCase(), db);
    if (!role) return showGate("이 계정에는 매뉴얼 열람 권한이 없습니다.");
    showManual(role);
  } catch {
    showGate("계정 권한을 확인하지 못했습니다. 메인 화면에서 다시 로그인해 주세요.");
  }
}

async function resolveRole(email, db) {
  const access = await getDoc(doc(db, "access", email));
  const data = access.exists() ? access.data() : {};
  const savedRole = data.role || "";
  if (email === ADMIN_EMAIL || savedRole === "admin") return "admin";
  const roles = [];
  if (savedRole === "teacher") roles.push("teacher");
  if (savedRole === "coach" || data.coachDepartment) roles.push("coach");
  if (savedRole === "external" || data.externalCourse || Array.isArray(data.externalClasses)) roles.push("external");
  const selectedMode = localStorage.getItem(`${ACCOUNT_MODE_KEY}:${email}`);
  return roles.includes(selectedMode) ? selectedMode : roles[0] || "";
}

function showManual(role) {
  const allowed = role === "admin" ? ["common", "teacher", "coach", "external", "admin"] : ["common", role];
  document.querySelectorAll("[data-manual-section]").forEach((section) => {
    section.hidden = !allowed.includes(section.dataset.manualSection);
  });
  document.querySelectorAll("[data-manual-nav]").forEach((link) => {
    link.hidden = !allowed.includes(link.dataset.manualNav);
  });
  roleBadge.textContent = `${roleLabel[role]} 전용`;
  subtitle.textContent = role === "admin" ? "전체 역할 사용 매뉴얼" : `${roleLabel[role]} 사용 매뉴얼`;
  if (role === "coach") applyCoachManualLanguage();
  gate.hidden = true;
  app.hidden = false;
}

function applyCoachManualLanguage() {
  const language = ["ko", "en", "fr", "es"].includes(localStorage.getItem(COACH_LANGUAGE_KEY)) ? localStorage.getItem(COACH_LANGUAGE_KEY) : "ko";
  if (language === "ko") return;
  const content = {
    en: {
      lang: "en", title: "Namsung Elementary Attendance System", subtitle: "Afterschool instructor guide", badge: "For instructors", home: "Back to app", commonNav: "Essentials", coachNav: "Instructor",
      common: `<h2>Essentials</h2><ol><li>Sign in with the same <strong>Google account</strong> registered by the administrator.</li><li>Add the app to your Home Screen and allow notifications when prompted.</li><li>Always sign out after using a shared device.</li></ol><p class="note warning">Do not photograph, message, or save student information or attendance data on a personal device.</p>`,
      coach: `<h2>Afterschool instructor</h2><ol><li>In <strong>Attendance</strong>, check your assigned class and date.</li><li>Tap <strong>Refresh attendance</strong> immediately before class.</li><li>Use the Daily view for student details and the Monthly or School year view for totals.</li></ol><p class="note">If your account is also assigned as a homeroom teacher, use <strong>Account mode</strong> to switch views.</p><p class="note">Teacher entries marked absent, late, or left early are all counted as <strong>Absent</strong> in the instructor view.</p><p class="note warning">Instructors have read-only access. Student editing, attendance entry, and parent contact details are not available.</p>`,
      footer: "Namsung Elementary Attendance System · Instructor guide"
    },
    fr: {
      lang: "fr", title: "Système de gestion des présences de l’école Namsung", subtitle: "Guide des intervenants périscolaires", badge: "Intervenants uniquement", home: "Retour à l’application", commonNav: "Essentiel", coachNav: "Intervenant",
      common: `<h2>Essentiel</h2><ol><li>Connectez-vous avec le même <strong>compte Google</strong> que celui enregistré par l’administrateur.</li><li>Ajoutez l’application à l’écran d’accueil et autorisez les notifications.</li><li>Déconnectez-vous toujours après avoir utilisé un appareil partagé.</li></ol><p class="note warning">Ne photographiez pas et n’enregistrez pas les informations des élèves ou les présences sur un appareil personnel.</p>`,
      coach: `<h2>Intervenant périscolaire</h2><ol><li>Dans <strong>Présences</strong>, vérifiez votre atelier et la date.</li><li>Appuyez sur <strong>Actualiser les présences</strong> juste avant le cours.</li><li>Consultez le détail par jour et les totaux par mois ou année scolaire.</li></ol><p class="note">Si votre compte est aussi enseignant principal, utilisez le <strong>mode du compte</strong> pour changer de vue.</p><p class="note">Les mentions absent, en retard ou parti plus tôt saisies par l’enseignant sont toutes comptées comme <strong>Absent</strong> dans votre vue.</p><p class="note warning">L’accès des intervenants est en lecture seule. La saisie des présences, la modification des élèves et les coordonnées des parents ne sont pas disponibles.</p>`,
      footer: "Système de gestion des présences de l’école Namsung · Guide des intervenants"
    },
    es: {
      lang: "es", title: "Sistema de gestión de asistencia de la Escuela Primaria Namsung", subtitle: "Guía para instructores extraescolares", badge: "Solo instructores", home: "Volver a la aplicación", commonNav: "Esencial", coachNav: "Instructor",
      common: `<h2>Esencial</h2><ol><li>Inicia sesión con la misma <strong>cuenta de Google</strong> registrada por el administrador.</li><li>Añade la aplicación a la pantalla de inicio y permite las notificaciones.</li><li>Cierra siempre la sesión después de usar un dispositivo compartido.</li></ol><p class="note warning">No fotografíes ni guardes la información de los estudiantes o la asistencia en un dispositivo personal.</p>`,
      coach: `<h2>Instructor de actividades extraescolares</h2><ol><li>En <strong>Asistencia</strong>, comprueba tu actividad y la fecha.</li><li>Pulsa <strong>Actualizar asistencia</strong> justo antes de la clase.</li><li>Consulta el detalle diario y los totales mensuales o del curso escolar.</li></ol><p class="note">Si tu cuenta también es de tutor, usa el <strong>modo de cuenta</strong> para cambiar de vista.</p><p class="note">Las anotaciones de ausencia, retraso o salida anticipada del profesor se cuentan como <strong>Ausente</strong> en tu vista.</p><p class="note warning">El acceso del instructor es solo de lectura. No permite registrar asistencia, modificar estudiantes ni consultar datos de contacto de los padres.</p>`,
      footer: "Sistema de gestión de asistencia de Namsung · Guía para instructores"
    }
  }[language];
  document.documentElement.lang = content.lang;
  title.textContent = content.title;
  subtitle.textContent = content.subtitle;
  roleBadge.textContent = content.badge;
  homeLink.textContent = content.home;
  document.querySelector('[data-manual-nav="common"]').textContent = content.commonNav;
  document.querySelector('[data-manual-nav="coach"]').textContent = content.coachNav;
  document.getElementById("common").innerHTML = content.common;
  document.getElementById("coach").innerHTML = content.coach;
  footer.textContent = content.footer;
}

function showGate(message) {
  app.hidden = true;
  gate.hidden = false;
  gateMessage.textContent = message;
  gateLink.hidden = false;
}
