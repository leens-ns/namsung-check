import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {koreaDateKey,koreaWeekday,normalizeAttendanceDays} from '../access-period.mjs';
import {buildAttendancePayload} from '../attendance-payload.mjs';
export const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
export function extract(name,source=app){
  const m=new RegExp('^(?:async )?function '+name+'\\(','m').exec(source);assert.ok(m,name);
  const tail=source.slice(m.index+1),next=/^(?:async )?function \w+\(|^(?:const|let) \w+/m.exec(tail);
  return next?source.slice(m.index,m.index+1+next.index):source.slice(m.index);
}
export function clientContext({sdk,db,role='teacher',email='qa-day-teacher@nsworld.net',instant='2026-10-05T03:00:00Z',count=9,days=[1,5]}={}){
  const clock={instant};class FixedDate extends Date{constructor(...args){super(...(args.length?args:[clock.instant]))}}
  const date=koreaDateKey(new Date(instant));
  const students=Array.from({length:count},(_,i)=>({id:'synthetic-'+(i+1),name:'SYNTHETIC-'+(i+1),grade:'4',classNo:'99',number:String(i+1),departments:['synthetic-course']}));
  const c={Date:FixedDate,clock,session:{role,email,grade:'4',classNo:'99'},auth:{currentUser:{uid:'qa-day-uid'}},authTransitionId:1,db,
    koreaDateKey:d=>koreaDateKey(d??new FixedDate()),koreaWeekday:d=>koreaWeekday(d??new FixedDate()),normalizeAttendanceDays,
    state:{students,settings:{attendanceDays:days},records:{[date]:Object.fromEntries(students.map(s=>[s.id,{studentId:s.id,date,status:'present',memo:'synthetic only',saved:false}]))}},
    getScopedStudents:()=>students,buildAttendancePayload,serverTimestamp:sdk?.serverTimestamp,doc:sdk?.doc,
    els:{confirmSaveBtn:{disabled:false},reviewDialog:{closes:0,close(){this.closes++}}},alerts:[],attempts:[],renders:0,
    renderAll(){c.renders++},alert:m=>c.alerts.push(m),readableError:e=>e.code??e.message};
  if(sdk)c.writeBatch=()=>{const b=sdk.writeBatch(db);let size=0;return{set(...a){size++;b.set(...a)},async commit(){c.attempts.push(size);await b.commit();if(c.afterCommit)await c.afterCommit(c.attempts.length)}}};
  vm.createContext(c);
  for(const n of ['captureSessionOperation','isCurrentSessionOperation','canEdit','isAdmin','isAttendanceDay','canEnterAttendanceToday','todayKey','getTodayRecord','confirmSave'])vm.runInContext(extract(n),c);
  return c;
}
