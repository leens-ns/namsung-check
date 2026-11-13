import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {extract} from './attendance-weekday-fixture.mjs';

function setup({role = 'coach', admin = true, cancel = false} = {}) {
  const fields = Object.fromEntries(['newTeacherEmail','newTeacherStart','newTeacherEnd','registerTeacherBtn','saveBulkPeriodsBtn'].map(id => [id, {value: '', disabled: false}]));
  fields.newTeacherEmail.value = 'new@nsworld.net';
  fields.newTeacherStart.value = '2026-03-01';
  fields.newTeacherEnd.value = '2027-02-28';
  const writes = [], alerts = [];
  const context = {
    document: {getElementById: id => fields[id]}, session: {email: 'admin@nsworld.net'}, db: {},
    isAdmin: () => admin, captureSessionOperation: () => ({}), isCurrentSessionOperation: () => true,
    waitForSessionOperation: p => p, normalizeDateInput: x => x,
    doc: (_db, collection, email) => ({collection, email}),
    getDoc: async () => ({exists: () => Boolean(role), data: () => ({role, department: 'course', externalCourse: 'external'})}),
    setDoc: async (...args) => writes.push(args), serverTimestamp: () => 'server-time',
    loadCoachList: async () => {}, renderAll() {}, renderEmploymentPeriodList() {},
    alert: x => alerts.push(x), confirm: () => !cancel, readableError: e => e.message,
    els: {employmentStartDateInput: {value:'2026-03-01'}, employmentEndDateInput: {value:'2027-02-28'}, employmentPeriodList: {querySelectorAll: () => [{dataset:{periodEmail:'existing@nsworld.net'}}]}},
    writeBatch: () => ({update: (...args) => writes.push(args), commit: async () => {}})
  };
  vm.createContext(context);
  for (const name of ['registerTeacherAccount','saveBulkEmploymentPeriods']) vm.runInContext(extract(name), context);
  return {context, fields, writes, alerts};
}
test('teacher registration preserves coach/external fields with merge and empty homeroom', async () => {
  const {context, writes} = setup(); await context.registerTeacherAccount();
  assert.equal(writes.length, 1);
  assert.equal(writes[0][1].role, 'teacher');
  assert.equal(writes[0][1].coachDepartment, 'course');
  assert.equal(writes[0][1].grade, '');
  assert.equal(writes[0][2].merge, true);
});
test('non-admin, duplicate teacher, invalid period and cancelled confirmation never write', async () => {
  for (const options of [{admin:false},{role:'teacher'},{cancel:true}]) {
    const {context,writes}=setup(options); await context.registerTeacherAccount(); assert.equal(writes.length,0);
  }
  const {context,fields,writes}=setup(); fields.newTeacherStart.value='2028-01-01'; await context.registerTeacherAccount(); assert.equal(writes.length,0);
});
test('bulk period uses update only on selected accounts without changing roles or homeroom', async () => {
  const {context,writes}=setup(); await context.saveBulkEmploymentPeriods();
  assert.equal(writes.length,1); assert.equal(writes[0][0].email,'existing@nsworld.net');
  assert.deepEqual(Object.keys(writes[0][1]).sort(),['employmentEndDate','employmentStartDate','updatedAt','updatedBy']);
});
