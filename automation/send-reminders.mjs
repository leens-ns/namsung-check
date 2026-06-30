const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "namsung-check";
const ACCESS_TOKEN = process.env.GCP_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL || "https://namsung-check.firebaseapp.com/";
const DATABASE_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const FCM_URL = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;
const TIME_ZONE = "Asia/Seoul";

if (!ACCESS_TOKEN) throw new Error("GCP_ACCESS_TOKEN is required.");

const now = process.env.REMINDER_TEST_NOW ? new Date(process.env.REMINDER_TEST_NOW) : new Date();
const current = currentSeoulTime(now);
const savedSettings = await readSettings();
const settings = {
  morningTime: savedSettings.morningTime || "08:30",
  reviewTime: savedSettings.notificationSettingsVersion >= 3 ? savedSettings.reviewTime || "14:05" : "14:05",
  coachReviewTime: savedSettings.notificationSettingsVersion >= 3 ? savedSettings.coachReviewTime || "14:10" : "14:10",
  attendanceDays: savedSettings.attendanceDays?.length ? savedSettings.attendanceDays : [1, 5],
  usageCheckDay: Math.min(28, Math.max(1, savedSettings.usageCheckDay || 1)),
  usageLastConfirmedMonth: savedSettings.usageLastConfirmedMonth || ""
};

const reminders = [];
if (settings.attendanceDays.includes(current.weekday) && isDue(current.hhmm, settings.morningTime)) {
  reminders.push({ type: "morning", audience: "input", title: "아침 출결 입력", body: "오늘 학생 출결을 입력해 주세요." });
}
if (settings.attendanceDays.includes(current.weekday) && isDue(current.hhmm, settings.reviewTime)) {
  reminders.push({ type: "review", audience: "review", title: "출결 재확인", body: "오늘 입력한 학생 출결을 한 번 더 확인해 주세요." });
}
if (settings.attendanceDays.includes(current.weekday) && isDue(current.hhmm, settings.coachReviewTime)) {
  reminders.push({ type: "coach-review", audience: "coach-review", title: "방과후 출결 확인", body: "오늘 방과후 수강 학생의 출결을 확인해 주세요." });
}
if (current.day >= settings.usageCheckDay && settings.usageLastConfirmedMonth !== current.date.slice(0, 7)) {
  reminders.push({ type: "admin-usage", dispatchId: `${current.date.slice(0, 7)}_admin-usage`, audience: "admin-usage", title: "Firebase 사용량 확인", body: "이번 달 읽기·쓰기·저장 공간이 무료 범위인지 확인해 주세요.", link: "https://console.firebase.google.com/project/namsung-check/firestore/databases/-default-/usage" });
}

const pendingRequests = await readPendingRequests();
const reservedReminders = [];
for (const reminder of reminders) {
  const dispatchId = reminder.dispatchId || `${current.date}_${reminder.type}`;
  if (await reserveDispatch(dispatchId, reminder.type)) reservedReminders.push({ ...reminder, dispatchId });
}
const tokenCatalog = reservedReminders.length || pendingRequests.length ? await readTokenCatalog() : [];
for (const reminder of reservedReminders) await dispatchReminder(reminder, tokenCatalog);
for (const request of pendingRequests) await dispatchRequest(request, tokenCatalog);
if (shouldWriteHealth(savedSettings.reminderHealthLastRunAt, now)) {
  await writeReminderHealth("healthy", `Scheduled reminders ${reservedReminders.length}, admin requests ${pendingRequests.length}`);
}
console.log(`Sent ${reservedReminders.length} new scheduled reminder(s) and checked ${pendingRequests.length} admin request(s).`);

async function readSettings() {
  const response = await api(`${DATABASE_ROOT}/settings/public`);
  if (response.status === 404) return {};
  const document = await requireJson(response, "Unable to read notification settings");
  return {
    morningTime: stringField(document, "morningTime"),
    reviewTime: stringField(document, "reviewTime"),
    coachReviewTime: stringField(document, "coachReviewTime"),
    notificationSettingsVersion: integerField(document, "notificationSettingsVersion"),
    attendanceDays: arrayIntegerField(document, "attendanceDays"),
    usageCheckDay: integerField(document, "usageCheckDay"),
    usageLastConfirmedMonth: stringField(document, "usageLastConfirmedMonth"),
    reminderHealthLastRunAt: timestampField(document, "reminderHealthLastRunAt")
  };
}

async function dispatchReminder(reminder, tokenCatalog) {
  const dispatchId = reminder.dispatchId;

  try {
    const tokenDocs = readActiveTokens(reminder, tokenCatalog);
    if (!tokenDocs.length) {
      await updateDispatch(dispatchId, { status: "no-active-token", successCount: 0, failureCount: 0, completedAt: new Date().toISOString() });
      return;
    }

    let successCount = 0;
    let failureCount = 0;
    for (let index = 0; index < tokenDocs.length; index += 20) {
      const results = await Promise.all(tokenDocs.slice(index, index + 20).map((item) => sendMessage(item, reminder)));
      successCount += results.filter(Boolean).length;
      failureCount += results.filter((sent) => !sent).length;
    }

    await updateDispatch(dispatchId, { status: "sent", successCount, failureCount, completedAt: new Date().toISOString() });
  } catch (error) {
    await deleteDispatch(dispatchId);
    throw error;
  }
}

async function reserveDispatch(dispatchId, type) {
  const response = await api(`${DATABASE_ROOT}/notificationDispatches?documentId=${encodeURIComponent(dispatchId)}`, {
    method: "POST",
    body: firestoreDocument({ type, date: current.date, status: "sending", createdAt: new Date().toISOString() })
  });
  if (response.status === 409) return false;
  await requireJson(response, "Unable to reserve reminder dispatch");
  return true;
}

async function readTokenCatalog() {
  const [tokenResponse, accessResponse] = await Promise.all([api(`${DATABASE_ROOT}:runQuery`, {
    method: "POST",
    body: {
      structuredQuery: {
        from: [{ collectionId: "notificationTokens" }],
        where: { fieldFilter: { field: { fieldPath: "active" }, op: "EQUAL", value: { booleanValue: true } } }
      }
    }
  }), api(`${DATABASE_ROOT}:runQuery`, {
    method: "POST",
    body: { structuredQuery: { from: [{ collectionId: "access" }] } }
  })]);
  const rows = await requireJson(tokenResponse, "Unable to read notification tokens");
  const accessRows = await requireJson(accessResponse, "Unable to verify notification recipients");
  const accessRoles = new Map(accessRows.flatMap((row) => {
    if (!row.document) return [];
    const email = decodeURIComponent(row.document.name.split("/").pop()).toLowerCase();
    const primaryRole = stringField(row.document, "role");
    const roles = [primaryRole];
    if (primaryRole !== "coach" && stringField(row.document, "coachDepartment")) roles.push("coach");
    return [[email, roles]];
  }));
  return rows.flatMap((row) => {
    const document = row.document;
    if (!document) return [];
    const email = String(stringField(document, "email") || "").toLowerCase();
    const roles = email === "leens@nsworld.net" ? ["admin", ...(accessRoles.get(email)?.includes("coach") ? ["coach"] : [])] : accessRoles.get(email) || [];
    const token = stringField(document, "token");
    return token ? [{ token, name: document.name, email, roles, language: stringField(document, "language") || "ko", audiences: arrayStringField(document, "audiences") }] : [];
  });
}

function readActiveTokens(reminder, tokenCatalog) {
  return tokenCatalog.filter((item) => {
    const validRole = reminder.audience === "coach-review"
      ? item.roles.includes("coach")
      : reminder.audience === "admin-usage"
        ? item.roles.includes("admin")
        : item.roles.some((role) => ["admin", "teacher"].includes(role));
    return validRole && item.audiences.includes(reminder.audience) && (!reminder.targetEmail || item.email === reminder.targetEmail);
  });
}

async function readPendingRequests() {
  const response = await api(`${DATABASE_ROOT}:runQuery`, {
    method: "POST",
    body: {
      structuredQuery: {
        from: [{ collectionId: "notificationRequests" }],
        where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "pending" } } },
        limit: 20
      }
    }
  });
  const rows = await requireJson(response, "Unable to read admin notification requests");
  return rows.flatMap((row) => row.document ? [{
    name: row.document.name,
    type: stringField(row.document, "type") || "unset-reminder",
    audience: "input",
    targetEmail: String(stringField(row.document, "targetEmail") || "").toLowerCase(),
    title: stringField(row.document, "title") || "출결 미입력 알림",
    body: stringField(row.document, "body") || "출결 미입력 학생을 확인해 주세요."
  }] : []);
}

async function dispatchRequest(request, tokenCatalog) {
  const tokens = readActiveTokens(request, tokenCatalog);
  const results = await Promise.all(tokens.map((token) => sendMessage(token, request)));
  await patchDocument(request.name, {
    status: tokens.length ? "sent" : "no-active-token",
    successCount: results.filter(Boolean).length,
    failureCount: results.filter((sent) => !sent).length,
    completedAt: new Date().toISOString()
  });
}

async function sendMessage(tokenDoc, reminder) {
  const localized = localizedReminder(reminder, tokenDoc.language);
  const response = await api(FCM_URL, {
    method: "POST",
    body: {
      message: {
        token: tokenDoc.token,
        notification: { title: localized.title, body: localized.body },
        webpush: {
          headers: { Urgency: "high" },
          notification: {
            icon: `${APP_URL}logo.svg`,
            tag: `attendance-${current.date}-${reminder.type}`,
            requireInteraction: true
          },
          fcmOptions: { link: localized.link || APP_URL }
        }
      }
    }
  });
  if (response.ok) return true;

  const error = await response.json().catch(() => ({}));
  const fcmCode = error?.error?.details?.find((detail) => detail.errorCode)?.errorCode;
  if (fcmCode === "UNREGISTERED") await api(`https://firestore.googleapis.com/v1/${tokenDoc.name}`, { method: "DELETE" });
  console.error(`FCM send failed (${response.status}):`, fcmCode || error?.error?.message || "unknown error");
  return false;
}

function localizedReminder(reminder, language) {
  if (reminder.type !== "coach-review") return reminder;
  const translations = {
    en: { title: "Afterschool attendance reminder", body: "Please check today's attendance before your afterschool class." },
    fr: { title: "Rappel des présences périscolaires", body: "Veuillez vérifier les présences avant votre atelier aujourd’hui." },
    es: { title: "Recordatorio de asistencia extraescolar", body: "Comprueba la asistencia antes de la actividad de hoy." }
  };
  return translations[language] || reminder;
}

async function updateDispatch(dispatchId, values) {
  const masks = Object.keys(values).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&");
  const response = await api(`${DATABASE_ROOT}/notificationDispatches/${dispatchId}?${masks}`, {
    method: "PATCH",
    body: firestoreDocument(values)
  });
  await requireJson(response, "Unable to complete reminder dispatch");
}

async function patchDocument(documentName, values) {
  const masks = Object.keys(values).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&");
  const response = await api(`https://firestore.googleapis.com/v1/${documentName}?${masks}`, {
    method: "PATCH",
    body: firestoreDocument(values)
  });
  await requireJson(response, "Unable to update notification request");
}

async function writeReminderHealth(status, message) {
  const values = {
    reminderHealthStatus: status,
    reminderHealthLastRunAt: new Date().toISOString(),
    reminderHealthMessage: message
  };
  const masks = Object.keys(values).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&");
  const response = await api(`${DATABASE_ROOT}/settings/public?${masks}`, {
    method: "PATCH",
    body: firestoreDocument(values)
  });
  await requireJson(response, "Unable to record reminder health");
}

async function deleteDispatch(dispatchId) {
  const response = await api(`${DATABASE_ROOT}/notificationDispatches/${dispatchId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) console.error(`Unable to release dispatch (${response.status}).`);
}

function currentSeoulTime(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    day: Number(parts.day),
    hhmm: `${parts.hour}:${parts.minute}`,
    weekday: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).format(date)]
  };
}

function isDue(currentTime, targetTime) {
  if (!/^\d{2}:\d{2}$/.test(targetTime || "")) return false;
  const toMinutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const difference = toMinutes(currentTime) - toMinutes(targetTime);
  return difference >= 0 && difference < 30;
}

function shouldWriteHealth(lastRunAt, date) {
  if (!lastRunAt) return true;
  const previous = new Date(lastRunAt);
  return Number.isNaN(previous.getTime()) || date.getTime() - previous.getTime() >= 55 * 60 * 1000;
}

function stringField(document, field) {
  return document?.fields?.[field]?.stringValue || undefined;
}

function integerField(document, field) {
  return Number(document?.fields?.[field]?.integerValue || 0);
}

function timestampField(document, field) {
  return document?.fields?.[field]?.timestampValue || undefined;
}

function arrayStringField(document, field) {
  return (document?.fields?.[field]?.arrayValue?.values || []).map((value) => value.stringValue).filter(Boolean);
}

function arrayIntegerField(document, field) {
  return (document?.fields?.[field]?.arrayValue?.values || []).map((value) => Number(value.integerValue)).filter((value) => Number.isInteger(value));
}

function firestoreDocument(values) {
  const fields = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string" && /At$/.test(key)) fields[key] = { timestampValue: value };
    else if (typeof value === "string") fields[key] = { stringValue: value };
    else if (typeof value === "number") fields[key] = { integerValue: String(value) };
    else if (typeof value === "boolean") fields[key] = { booleanValue: value };
  }
  return { fields };
}

function api(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
}

async function requireJson(response, message) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${message}: ${response.status} ${data?.error?.message || ""}`.trim());
  return data;
}
