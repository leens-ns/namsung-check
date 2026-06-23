const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "namsung-check";
const ACCESS_TOKEN = process.env.GCP_ACCESS_TOKEN;
const DATABASE_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const MAX_DELETES_PER_RUN = 10_000;
const BATCH_SIZE = 500;

if (!ACCESS_TOKEN) throw new Error("GCP_ACCESS_TOKEN is required.");

const now = process.env.CLEANUP_TEST_NOW ? new Date(process.env.CLEANUP_TEST_NOW) : new Date();
const settings = await readSettings();

if (!settings.autoCleanupEnabled) {
  console.log("Automatic attendance cleanup is disabled.");
  process.exit(0);
}

const cutoffDate = retentionCutoff(now, settings.retentionMonths);
let deletedCount = 0;

try {
  while (deletedCount < MAX_DELETES_PER_RUN) {
    const documents = await readExpiredAttendance(cutoffDate, Math.min(BATCH_SIZE, MAX_DELETES_PER_RUN - deletedCount));
    if (!documents.length) break;
    await deleteDocuments(documents.map((document) => document.name));
    deletedCount += documents.length;
  }

  const hasMore = deletedCount === MAX_DELETES_PER_RUN && (await readExpiredAttendance(cutoffDate, 1)).length > 0;
  await writeStatus({
    status: hasMore ? "partial" : "completed",
    deletedCount,
    cutoffDate,
    retentionMonths: settings.retentionMonths,
    lastRunAt: new Date().toISOString(),
    message: hasMore ? "Delete limit reached; remaining records will be removed on the next run." : "Cleanup completed."
  });
  console.log(`Attendance cleanup ${hasMore ? "partially " : ""}completed: ${deletedCount} document(s) deleted before ${cutoffDate}.`);
} catch (error) {
  await writeStatus({
    status: "failed",
    deletedCount,
    cutoffDate,
    retentionMonths: settings.retentionMonths,
    lastRunAt: new Date().toISOString(),
    message: String(error.message || error).slice(0, 500)
  }).catch(() => {});
  throw error;
}

async function readSettings() {
  const response = await api(`${DATABASE_ROOT}/settings/public`);
  if (response.status === 404) return { autoCleanupEnabled: false, retentionMonths: 24 };
  const document = await requireJson(response, "Unable to read retention settings");
  const retentionMonths = integerField(document, "retentionMonths");
  return {
    autoCleanupEnabled: booleanField(document, "autoCleanupEnabled"),
    retentionMonths: [12, 24, 36, 60].includes(retentionMonths) ? retentionMonths : 24
  };
}

async function readExpiredAttendance(cutoffDate, limit) {
  const response = await api(`${DATABASE_ROOT}:runQuery`, {
    method: "POST",
    body: {
      structuredQuery: {
        from: [{ collectionId: "attendance" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "date" },
            op: "LESS_THAN",
            value: { stringValue: cutoffDate }
          }
        },
        orderBy: [{ field: { fieldPath: "date" }, direction: "ASCENDING" }],
        limit
      }
    }
  });
  const rows = await requireJson(response, "Unable to find expired attendance records");
  return rows.flatMap((row) => row.document ? [row.document] : []);
}

async function deleteDocuments(names) {
  if (!names.length) return;
  const response = await api(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`, {
    method: "POST",
    body: { writes: names.map((name) => ({ delete: name })) }
  });
  await requireJson(response, "Unable to delete expired attendance records");
}

async function writeStatus(values) {
  const fields = {
    cleanupStatus: values.status,
    cleanupDeletedCount: values.deletedCount,
    cleanupCutoffDate: values.cutoffDate,
    cleanupRetentionMonths: values.retentionMonths,
    cleanupLastRunAt: values.lastRunAt,
    cleanupMessage: values.message
  };
  const masks = Object.keys(fields).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&");
  const response = await api(`${DATABASE_ROOT}/settings/public?${masks}`, {
    method: "PATCH",
    body: firestoreDocument(fields)
  });
  await requireJson(response, "Unable to record cleanup status");
}

function retentionCutoff(date, months) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const targetMonth = Number(parts.month) - 1 - months;
  const targetYear = Number(parts.year) + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const cutoff = new Date(Date.UTC(targetYear, normalizedMonth, Math.min(Number(parts.day), lastDay)));
  return cutoff.toISOString().slice(0, 10);
}

function booleanField(document, field) {
  return document?.fields?.[field]?.booleanValue === true;
}

function integerField(document, field) {
  return Number(document?.fields?.[field]?.integerValue || 0);
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
