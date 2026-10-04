const protectedOutputIds = [
  "studentGrid",
  "lookupTable",
  "reviewList",
  "notificationList",
  "adminList",
  "employmentPeriodList",
  "coachList",
  "teacherList",
  "externalList",
  "mondayDepartmentList",
  "fridayDepartmentList",
  "externalCourseList",
  "lookupPeriodSummary",
  "userName",
  "userEmail",
  "userRole",
  "userPicture"
];

export function clearSensitiveSessionData(state, root = document) {
  state.students = [];
  state.records = {};
  state.contacts = {};
  state.admins = {};
  state.coaches = {};
  state.teachers = {};
  state.externals = {};
  state.accessRoles = {};
  state.accountPeriods = {};

  for (const id of protectedOutputIds) {
    const element = root.getElementById(id);
    if (element) element.replaceChildren();
  }
  const userPicture = root.getElementById("userPicture");
  if (userPicture) userPicture.removeAttribute("src");

  for (const id of ["presentCount", "lateCount", "earlyCount", "absentCount", "unsetCount", "currentRosterCount"]) {
    const element = root.getElementById(id);
    if (element) element.textContent = "0";
  }

  root.querySelectorAll("input, textarea").forEach((control) => {
    if (control.type === "checkbox" || control.type === "radio") control.checked = false;
    else control.value = "";
  });
  root.querySelectorAll("select").forEach((control) => { control.selectedIndex = 0; });
  root.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
}
