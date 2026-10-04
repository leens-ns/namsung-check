import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
import {koreaDateKey,koreaWeekday,normalizeAttendanceDays} from '../access-period.mjs';
import {clientContext,extract,app} from './attendance-weekday-fixture.mjs';
test('KST midnight and each weekday are independent of host timezone',()=>{
 for(const [instant,date,day]of [['2026-10-04T14:59:59.999Z','2026-10-04',0],['2026-10-04T15:00:00.000Z','2026-10-05',1],['2026-10-05T15:00:00Z','2026-10-06',2],['2026-10-06T15:00:00Z','2026-10-07',3],['2026-10-07T15:00:00Z','2026-10-08',4],['2026-10-08T15:00:00Z','2026-10-09',5],['2026-10-09T15:00:00Z','2026-10-10',6]]){
  const d=new Date(instant);assert.equal(koreaDateKey(d),date);assert.equal(koreaWeekday(d),day);const c=clientContext({instant});assert.equal(c.todayKey(),date);assert.equal(c.canEnterAttendanceToday(),[1,5].includes(day));
 }
});
test('settings canonical numeric strings/integers and invalid fallback match server accepted set',()=>{
 for(const v of [undefined,null,false,{},[],[0,6,7],['bad'],[1.5,2.5],[true],[['2']],[' 2 ','02','2.0']])assert.deepEqual(normalizeAttendanceDays(v),[1,5]);
 assert.deepEqual(normalizeAttendanceDays(['1','5',1,5]),[1,5]);assert.deepEqual(normalizeAttendanceDays(['2',2,{},1.5]),[2]);assert.deepEqual(normalizeAttendanceDays([5,1,3]),[1,3,5]);
});
test('teacher off-day blocks batches, administrator off-day is enabled, other roles cannot edit',async()=>{
 const c=clientContext({instant:'2026-10-04T03:00:00Z'});let calls=0;c.writeBatch=()=>{calls++;throw Error('must not write')};await c.confirmSave();assert.equal(calls,0);assert.equal(c.alerts.length,1);
 for(const role of ['teacher','admin','coach','external']){const v=clientContext({role,instant:'2026-10-04T03:00:00Z'});assert.equal(v.canEnterAttendanceToday(),role==='admin');}
});
test('administrator notice/save/buttons reflect off-day exception without adding history editor',()=>{
 const c=clientContext({role:'admin',instant:'2026-10-04T03:00:00Z',count:0});const el=()=>({textContent:'',disabled:false,innerHTML:'',classList:{toggle(){},add(){},remove(){}}});
 for(const n of ['attendanceDayNotice','currentRosterCount','markUnsetPresentBtn','markAllPresentBtn','clearTodayBtn','saveStatusText','reviewBtn','studentGrid'])c.els[n]=el();c.activeFilter='all';
 for(const n of ['updateSaveState','renderStudents'])vm.runInContext(extract(n),c);c.renderStudents();assert.match(c.els.attendanceDayNotice.textContent,/관리자는 입력 요일과 관계없이/);assert.equal(c.els.markAllPresentBtn.disabled,false);assert.equal(c.els.clearTodayBtn.disabled,false);
 assert.match(app,/function todayKey\(\) \{ return koreaDateKey\(\); \}/);assert.ok(!app.includes('function editHistoricalAttendance'));
});
test('revision7 cache precaches new app/helper URLs and preserves unrelated caches',async()=>{
 const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),events={},deleted=[],installed=[],network=[];
 const c={URL,self:{location:{origin:'http://127.0.0.1:49157'},addEventListener:(n,f)=>events[n]=f,skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches:{open:async n=>({addAll:async paths=>installed.push({n,paths:Array.from(paths)}),put:async()=>{}}),keys:async()=>['namsung-attendance-20261003-4','namsung-attendance-20261004-6','namsung-attendance-20261005-7','other-cache'],delete:async n=>deleted.push(n),match:async()=>null},fetch:async req=>{network.push(req.url);return{ok:true,clone(){return this},synthetic:true}},importScripts(){},firebase:{initializeApp(){},messaging(){}}};
 vm.createContext(c);vm.runInContext(sw,c);let p;events.install({waitUntil:v=>p=v});await p;assert.ok(installed[0].paths.includes('./app.js?v=20261005-7'));assert.ok(installed[0].paths.includes('./access-period.mjs?v=20261005-7'));events.activate({waitUntil:v=>p=v});await p;assert.deepEqual(deleted,['namsung-attendance-20261003-4','namsung-attendance-20261004-6']);
 const request={method:'GET',url:'http://127.0.0.1:49157/app.js?v=20261004-6',mode:'cors'};events.fetch({request,respondWith:v=>p=v});assert.equal((await p).synthetic,true);assert.deepEqual(network,[request.url]);
});
test('old cached app helper exports remain available and new URL avoids old helper module',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./attendance-weekday-baseline-fixture.json',import.meta.url),'utf8'));assert.equal(fixture.sourceSHA,'32da8032d24bb6c9eebf626c27dd3baa760c82b7');const oldImport=fixture.importLine;assert.match(oldImport,/employmentAccessAllowed, employmentPeriodStatus, koreaDateKey/);assert.match(app,/koreaWeekday, normalizeAttendanceDays/);assert.match(app,/access-period.mjs\?v=20261005-7/);
});
