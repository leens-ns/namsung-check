import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { doc, getDoc, getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const ADMIN_EMAIL = "leens@nsworld.net";
const roleLabel = { admin: "관리자", teacher: "담임교사", coach: "방과후강사" };
const gate = document.getElementById("manualGate");
const gateMessage = document.getElementById("manualGateMessage");
const gateLink = document.getElementById("manualGateLink");
const app = document.getElementById("manualApp");
const roleBadge = document.getElementById("manualRoleBadge");
const subtitle = document.getElementById("manualSubtitle");

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
  const savedRole = access.exists() ? access.data().role : "";
  if (email === ADMIN_EMAIL || savedRole === "admin") return "admin";
  if (email.endsWith("@nsworld.net")) return "teacher";
  return savedRole === "coach" ? "coach" : "";
}

function showManual(role) {
  const allowed = role === "admin" ? ["common", "teacher", "coach", "admin"] : ["common", role];
  document.querySelectorAll("[data-manual-section]").forEach((section) => {
    section.hidden = !allowed.includes(section.dataset.manualSection);
  });
  document.querySelectorAll("[data-manual-nav]").forEach((link) => {
    link.hidden = !allowed.includes(link.dataset.manualNav);
  });
  roleBadge.textContent = `${roleLabel[role]} 전용`;
  subtitle.textContent = role === "admin" ? "전체 역할 사용 매뉴얼" : `${roleLabel[role]} 사용 매뉴얼`;
  gate.hidden = true;
  app.hidden = false;
}

function showGate(message) {
  app.hidden = true;
  gate.hidden = false;
  gateMessage.textContent = message;
  gateLink.hidden = false;
}
