import assert from 'node:assert/strict';import test,{before,after} from 'node:test';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import {clientContext,extract} from './attendance-weekday-fixture.mjs';
import {koreaDateKey,koreaWeekday,normalizeAttendanceDays} from '../access-period.mjs';
import {uniqueStudentClasses} from '../student-classes.mjs';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8798');
assert.equal(process.env.NC_RULES_TESTDEPS,'/tmp/namsung-audit-testdeps/package.json');
const require=createRequire(process.env.NC_RULES_TESTDEPS),{initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing'),sdk=require('firebase/firestore');sdk.setLogLevel('silent');
const projectId='demo-nc-weekday-policy',rules=fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const teacherEmail='qa-day-teacher@nsworld.net',adminEmail='qa-day-admin@nsworld.net',rootEmail=rules.match(/email\(\) == '([^']+)'/)[1],oldDate='2020-02-03';
const clockLine="return (request.time + duration.value(9, 'h')).dayOfWeek() % 7;";
assert.equal(rules.split(clockLine).length,2);let env,teacher,admin,root,sequence=0;
const watchdog=setTimeout(()=>process.exit(124),220000);watchdog.unref();
async function configure(instant=null){
 await env?.cleanup();let source=rules;
 if(instant){const d=new Date(instant),base=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()),ms=d.valueOf()-base;const expression='timestamp.date('+[d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate()].join(', ')+") + duration.value("+ms+", 'ms')";source=source.replace(clockLine,'return (('+expression+") + duration.value(9, 'h')).dayOfWeek() % 7;");}
 env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8798,rules:source}});
 const db=(uid,email)=>env.authenticatedContext(uid+'-'+(++sequence),{email,email_verified:true}).firestore();teacher=db('qa-day-teacher',teacherEmail);admin=db('qa-day-admin',adminEmail);root=db('qa-day-root',rootEmail);
}
before(()=>configure());after(async()=>{await env?.clearFirestore();await env?.cleanup();clearTimeout(watchdog)});
function payload(id,date,email,extra={}){return{studentId:id,date,grade:'4',classNo:'99',departments:['synthetic-course'],status:'present',memo:'synthetic only',updatedBy:email,updatedAt:sdk.serverTimestamp(),...extra}}
async function seed(days=[1,5],count=9){
 await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore(),b=sdk.writeBatch(db);
  if(days!==undefined)b.set(sdk.doc(db,'settings','public'),days===null?{}:{attendanceDays:days});
  for(const [email,role,end,start]of [[teacherEmail,'teacher','2099-12-31','1999-01-01'],[adminEmail,'admin','2099-12-31','1999-01-01'],[rootEmail,'admin','2000-01-01','1999-01-01'],['qa-day-expired@nsworld.net','teacher','2000-01-01','1999-01-01'],['qa-day-expired-admin@nsworld.net','admin','2000-01-01','1999-01-01'],['qa-day-future@nsworld.net','teacher','2099-12-31','2099-01-01'],['qa-day-coach@nsworld.net','coach','2099-12-31','1999-01-01'],['qa-day-external@nsworld.net','external','2099-12-31','1999-01-01'],['qa-day-outsider@example.invalid','teacher','2099-12-31','1999-01-01']])b.set(sdk.doc(db,'access',email),{role,grade:'4',classNo:'99',department:'synthetic-course',employmentStartDate:start,employmentEndDate:end});
  for(let i=1;i<=count;i++){const id='synthetic-'+i;b.set(sdk.doc(db,'students',id),{name:'SYNTHETIC-'+i,grade:'4',classNo:'99',number:String(i),departments:['synthetic-course']});b.set(sdk.doc(db,'attendance',oldDate+'_'+id),payload(id,oldDate,teacherEmail));}await b.commit();
 });
}
async function settings(value,missing=false){await env.withSecurityRulesDisabled(async ctx=>{const ref=sdk.doc(ctx.firestore(),'settings','public');if(missing)await sdk.deleteDoc(ref);else await sdk.setDoc(ref,{attendanceDays:value});});}
async function records(date){let docs;await env.withSecurityRulesDisabled(async ctx=>{const s=await sdk.getDocs(sdk.query(sdk.collection(ctx.firestore(),'attendance'),sdk.where('date','==',date)));docs=Object.fromEntries(s.docs.map(d=>[d.id,d.data()]));});return docs;}
async function permit(promise,allowed){let timer;try{const bounded=Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SYNTHETIC_OPERATION_TIMEOUT')),12000)})]);if(allowed)await bounded;else await assertFails(bounded);}finally{clearTimeout(timer)}}
async function crud(db,email,date,allowed){try{await permit(sdk.setDoc(sdk.doc(db,'attendance',date+'_synthetic-1'),payload('synthetic-1',date,email)),allowed)}catch(e){throw Error('synthetic create result: '+(e.code??e.message),{cause:e})}await permit(sdk.updateDoc(sdk.doc(db,'attendance',oldDate+'_synthetic-2'),{memo:'synthetic correction',updatedBy:email}),allowed);await permit(sdk.deleteDoc(sdk.doc(db,'attendance',oldDate+'_synthetic-3')),allowed);}

test('exact unmodified production candidate uses live request.time KST for teacher writes',async()=>{
 await configure();const today=koreaDateKey(),day=koreaWeekday();await seed([day]);await crud(teacher,teacherEmail,today,day>=1&&day<=5);await seed([day===1?5:1]);await crud(teacher,teacherEmail,today,false);
});
test('clock-substituted candidate verifies Mon..Sun mapping, current weekday and unrestricted reads',async()=>{
 for(let day=0;day<7;day++){const instant='2026-10-'+String(4+day).padStart(2,'0')+'T03:00:00Z';await configure(instant);await seed();await crud(teacher,teacherEmail,'2025-01-01',[1,5].includes(day));await sdk.getDoc(sdk.doc(teacher,'attendance',oldDate+'_synthetic-1'));}
});
test('clock-substituted candidate switches at KST midnight, one millisecond boundary',async()=>{
 for(const [instant,allowed]of [['2026-10-04T14:59:59.999Z',false],['2026-10-04T15:00:00.000Z',true],['2026-10-08T14:59:59.999Z',false],['2026-10-08T15:00:00.000Z',true],['2026-10-09T14:59:59.999Z',true],['2026-10-09T15:00:00.000Z',false]]){await configure(instant);await seed();await permit(sdk.setDoc(sdk.doc(teacher,'attendance','2025-01-01_synthetic-1'),payload('synthetic-1','2025-01-01',teacherEmail)),allowed);}
});
test('settings matrix has exact client/server agreement including corrupt, empty, mixed and strings',async()=>{
 const cases=[undefined,null,false,{},[],[0,6,7],['bad'],[1.5,2.5],[true],[' 2 ','02','2.0'],['1','5',1],[2,3,4],[5,1,3],['2',2,{},1.5],[1,0,'0',6,'7']];
 for(const day of [0,1,2,5]){await configure('2026-10-'+String(4+day).padStart(2,'0')+'T03:00:00Z');await seed();for(const value of cases){await settings(value,value===undefined);const allowed=normalizeAttendanceDays(value).includes(day);try{await permit(sdk.setDoc(sdk.doc(teacher,'attendance','2025-01-01_synthetic-1'),payload('synthetic-1','2025-01-01',teacherEmail)),allowed)}catch(error){throw Error('Synthetic settings mismatch: weekday='+day+', case='+cases.indexOf(value)+', expected='+allowed,{cause:error})}}}
});
test('active admin and root period exception retain historical correction/delete/create on Sunday',async()=>{
 await configure('2026-10-04T03:00:00Z');for(const [db,email]of [[admin,adminEmail],[root,rootEmail]]){await seed([2]);await crud(db,email,'2025-01-01',true);await sdk.setDoc(sdk.doc(db,'attendance','admin-legacy-id'),payload('synthetic-admin-restoration','2020-01-01',email,{grade:'6',classNo:'77'}));}
});
test('expired/future/nonadmin roles/unregistered/unverified/domain and wrong class remain denied',async()=>{
 await configure('2026-10-05T03:00:00Z');await seed();
 for(const email of ['qa-day-expired@nsworld.net','qa-day-expired-admin@nsworld.net','qa-day-future@nsworld.net','qa-day-coach@nsworld.net','qa-day-external@nsworld.net','qa-day-outsider@example.invalid','qa-day-unregistered@nsworld.net']){const db=env.authenticatedContext('synthetic-denied-'+email.split('@')[0],{email,email_verified:true}).firestore();await crud(db,email,'2025-01-01',false);}
 const unverified=env.authenticatedContext('synthetic-unverified',{email:teacherEmail,email_verified:false}).firestore();await crud(unverified,teacherEmail,'2025-01-01',false);const fields=Object.fromEntries(Object.entries(payload('synthetic-1','2025-01-01',teacherEmail)).filter(([k])=>k!=='updatedAt').map(([k,v])=>[k,Array.isArray(v)?{arrayValue:{values:v.map(x=>({stringValue:x}))}}:{stringValue:v}]));const anonymous=await fetch('http://127.0.0.1:8798/v1/projects/'+projectId+'/databases/(default)/documents/attendance/2025-01-01_synthetic-1',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields}),signal:AbortSignal.timeout(12000)});assert.equal(anonymous.status,403);
 await assertFails(sdk.setDoc(sdk.doc(teacher,'attendance','2025-01-01_synthetic-1'),payload('synthetic-1','2025-01-01',teacherEmail,{classNo:'98'})));
});
test('teacher immutable fields/student snapshot/document id checks remain, no today-only restriction',async()=>{
 await configure('2026-10-05T03:00:00Z');await seed();
 for(const change of [{date:'2020-02-04'},{studentId:'synthetic-99'},{grade:'5'},{classNo:'98'},{departments:['other']}])await assertFails(sdk.updateDoc(sdk.doc(teacher,'attendance',oldDate+'_synthetic-1'),{...change,updatedBy:teacherEmail}));
 await assertFails(sdk.setDoc(sdk.doc(teacher,'attendance','forged-id'),payload('synthetic-1','2025-01-01',teacherEmail)));
 await assertFails(sdk.setDoc(sdk.doc(teacher,'attendance','2025-01-01_synthetic-99'),payload('synthetic-99','2025-01-01',teacherEmail)));
 await crud(teacher,teacherEmail,'2025-01-01',true);
});
test('actual new client + candidate rules saves9 in4/4/1 and repeat-without-edits writes0',async()=>{
 await configure('2026-10-05T03:00:00Z');await seed();const c=clientContext({sdk,db:teacher});await c.confirmSave();assert.deepEqual(c.attempts,[4,4,1]);assert.equal(Object.keys(await records(c.todayKey())).length,9);assert.equal(c.alerts.length,0);await c.confirmSave();assert.deepEqual(c.attempts,[4,4,1]);assert.equal(c.els.confirmSaveBtn.disabled,false);
});
test('second chunk actual rule denial preserves4 and retry only writes5',async()=>{
 await configure('2026-10-05T03:00:00Z');await seed();const c=clientContext({sdk,db:teacher});c.state.records[c.todayKey()]['synthetic-5'].classNo='98';await c.confirmSave();assert.deepEqual(c.attempts,[4,4]);let before=await records(c.todayKey());assert.equal(Object.keys(before).length,4);assert.equal(c.els.reviewDialog.closes,0);assert.equal(c.els.confirmSaveBtn.disabled,false);assert.equal(Object.values(c.state.records[c.todayKey()]).filter(r=>r.saved).length,4);
 c.state.records[c.todayKey()]['synthetic-5'].classNo='99';await c.confirmSave();assert.deepEqual(c.attempts,[4,4,4,1]);const after=await records(c.todayKey());assert.equal(Object.keys(after).length,9);for(let i=1;i<=4;i++)assert.equal(after[c.todayKey()+'_synthetic-'+i].updatedAt.toMillis(),before[c.todayKey()+'_synthetic-'+i].updatedAt.toMillis());
});
test('third chunk rule denial is atomic and preserves8 committed records',async()=>{
 await configure('2026-10-05T03:00:00Z');await seed();const c=clientContext({sdk,db:teacher});c.state.records[c.todayKey()]['synthetic-9'].classNo='98';await c.confirmSave();assert.deepEqual(c.attempts,[4,4,1]);assert.equal(Object.keys(await records(c.todayKey())).length,8);assert.equal(Object.values(c.state.records[c.todayKey()]).filter(r=>r.saved).length,8);
});
test('server setting changed between chunks denies remaining5 without rewriting first4',async()=>{
 await configure('2026-10-05T03:00:00Z');await seed();const c=clientContext({sdk,db:teacher});c.afterCommit=async n=>{if(n===1)await settings([2])};await c.confirmSave();assert.deepEqual(c.attempts,[4,4]);assert.equal(Object.keys(await records(c.todayKey())).length,4);assert.equal(c.alerts.length,1);assert.equal(c.els.confirmSaveBtn.disabled,false);
});
test('actual admin UI writer succeeds Sunday while teacher UI writes zero',async()=>{
 await configure('2026-10-04T03:00:00Z');await seed();const a=clientContext({sdk,db:admin,email:adminEmail,role:'admin',instant:'2026-10-04T03:00:00Z'});await a.confirmSave();assert.deepEqual(a.attempts,[4,4,1]);assert.equal(a.alerts.length,0);const t=clientContext({sdk,db:teacher,instant:'2026-10-04T03:00:00Z'});await t.confirmSave();assert.deepEqual(t.attempts,[]);
});
test('a spoofed client Monday cannot bypass the Sunday server gate',async()=>{
 await configure('2026-10-04T03:00:00Z');await seed();const c=clientContext({sdk,db:teacher,instant:'2026-10-05T03:00:00Z'});assert.equal(c.canEnterAttendanceToday(),true);await c.confirmSave();assert.deepEqual(c.attempts,[4]);assert.equal(Object.keys(await records(c.todayKey())).length,0);assert.equal(c.alerts.length,1);assert.ok(Object.values(c.state.records[c.todayKey()]).every(r=>!r.saved));
});
test('actual Sunday administrator clearToday deletes the selected class, teacher UI sends no query',async()=>{
 await configure('2026-10-04T03:00:00Z');await seed();const c=clientContext({sdk,db:admin,email:adminEmail,role:'admin',instant:'2026-10-04T03:00:00Z'});await c.confirmSave();
 Object.assign(c,{confirm:()=>true,hasHomeroom:()=>true,uniqueStudentClasses,collection:sdk.collection,query:sdk.query,where:sdk.where,getDocs:sdk.getDocs,writeBatch:()=>sdk.writeBatch(admin)});
 for(const n of ['waitForSessionOperation','clearToday'])vm.runInContext(extract(n),c);await c.clearToday();assert.equal(Object.keys(await records(c.todayKey())).length,0);
 const t=clientContext({sdk,db:teacher,instant:'2026-10-04T03:00:00Z'});t.getDocs=()=>{throw Error('off-day must not query')};vm.runInContext(extract('clearToday'),t);await t.clearToday();assert.equal(t.alerts.length,1);
});
test('cached32da UI can under-enable admin/timezone but cannot bypass new server off-day policy',async()=>{
 await configure('2026-10-04T03:00:00Z');await seed();await crud(teacher,teacherEmail,'2025-01-01',false);
 const fixture=JSON.parse(fs.readFileSync(new URL('./attendance-weekday-baseline-fixture.json',import.meta.url),'utf8'));assert.equal(fixture.sourceSHA,'32da8032d24bb6c9eebf626c27dd3baa760c82b7');class Sunday extends Date{getDay(){return 0}}
 const c={Date:Sunday,session:{role:'admin'},state:{settings:{attendanceDays:[1,5]}}};vm.createContext(c);for(const n of ['canEdit','isAttendanceDay','canEnterAttendanceToday'])vm.runInContext(fixture.functions[n],c);assert.equal(c.canEnterAttendanceToday(),false);
});
