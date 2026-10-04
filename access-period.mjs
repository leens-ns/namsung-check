export function parseEmploymentDate(value) {
  if (value === null || value === undefined || value === "") return { valid: true, value: "" };
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { valid: false, value: "" };

  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return { valid: false, value: "" };
  const leapYear = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > daysInMonth) return { valid: false, value: "" };
  return { valid: true, value };
}

export function koreaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function employmentPeriodStatus(startValue, endValue, today) {
  const start = parseEmploymentDate(startValue);
  const end = parseEmploymentDate(endValue);
  if (!start.valid || !end.valid || (start.value && end.value && start.value > end.value)) return "invalid";
  if (start.value && today < start.value) return "not-started";
  if (end.value && today > end.value) return "expired";
  return "active";
}

export function employmentAccessAllowed(user, email, employmentStatus, rootAdminEmail) {
  return user?.emailVerified === true
    && (email === rootAdminEmail || employmentStatus === "active");
}

// Match Firestore attendanceDays compatibility: numeric integer 1..5 or
// canonical strings "1".."5" only; ignore invalid entries, default Mon/Fri.
export function normalizeAttendanceDays(value) {
  const days = (Array.isArray(value) ? value : []).filter(day =>
    (typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 5)
    || (typeof day === "string" && /^[1-5]$/.test(day))
  ).map(Number);
  return days.length ? [...new Set(days)].sort((a, b) => a - b) : [1, 5];
}

export function koreaWeekday(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
}
