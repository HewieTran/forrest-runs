// Local integration tests only. The managed preview has no hosted auth dispatcher.
// Synthetic identity headers emulate dispatcher inputs on loopback; never use them against a hosted Site.
import assert from 'node:assert/strict';
import {summarize,weekStart,distanceMilestones} from '../lib/domain.ts';
const origin='http://127.0.0.1:4173';
const identity={'oai-authenticated-user-id':'integration-owner','oai-authenticated-user-email':'test-runner@example.test'};
const other={'oai-authenticated-user-id':'integration-other','oai-authenticated-user-email':'other@example.test'};
async function call(path,method='GET',body,auth=identity){const response=await fetch(origin+path,{method,headers:{...auth,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const result=await response.json();return {status:response.status,result,headers:response.headers};}
const start=await call('/api/training');assert.equal(start.status,200,JSON.stringify(start.result));
const stats=summarize(start.result.workouts,'2026-10-22');
assert.deepEqual([stats.total,stats.completed,stats.runs,stats.support,stats.miles,stats.longest,stats.missingDistance],[158,87,55,32,264.7,13.1,12]);
console.log('PASS: imported totals reconcile with the workbook, including missing distances.');
assert.equal((await call('/api/training','GET',undefined,{})).status,401);
assert.equal((await call('/api/export','GET',undefined,{})).status,401);
const isolated=await call('/api/training','GET',undefined,other);assert.equal(isolated.status,200);assert.equal(isolated.result.workouts.length,0);assert.notEqual(isolated.result.plan.id,start.result.plan.id);
const original=start.result.workouts.find(w=>w.date==='2026-10-22'),url='/api/workouts/'+encodeURIComponent(original.id);
assert.equal((await call(url,'PATCH',original,other)).status,409);assert.equal((await call(url,'PATCH',original,{})).status,401);
assert.equal((await call(url,'PATCH',{...original,effort:11})).status,400);
assert.equal((await call(url,'PATCH',{...original,date:'2026-02-30'})).status,400);
console.log('PASS: authentication, user isolation, and input validation.');
let current=original;
try{
 const saved=await call(url,'PATCH',{...original,done:true,date:'2026-10-26',actualDistance:16,actualPace:'12:00',effort:7,pain:'None',notes:'Local integration test'});assert.equal(saved.status,200,JSON.stringify(saved.result));current=saved.result.workout;
 const reload=await call('/api/training');const found=reload.result.workouts.find(w=>w.id===original.id);
 assert.equal(found.notes,'Local integration test');assert.equal(found.date,'2026-10-26');assert.equal(weekStart(found.date),'2026-10-26');assert.equal(summarize(reload.result.workouts,'2026-10-22').completed,88);assert.ok(distanceMilestones(reload.result.workouts).find(m=>m.distance===16).workout);
 assert.equal((await call(url,'PATCH',original)).status,409);
 console.log('PASS: save, reload persistence, rescheduling, milestone updates, and stale-edit rejection.');
}finally{const restore=await call(url,'PATCH',{...original,version:current.version});assert.equal(restore.status,200,JSON.stringify(restore.result));}
const backup=await call('/api/export');assert.equal(backup.status,200);assert.equal(backup.result.schemaVersion,1);assert.equal(backup.result.workouts.length,158);assert.ok(backup.result.workouts.every(w=>w.originalSource&&w.sourceRow));assert.ok(backup.headers.get('content-disposition').includes('.json'));
assert.equal(summarize(backup.result.workouts,'2026-10-22').completed,87);
const again=await call('/api/training');assert.equal(again.result.workouts.length,158);
console.log('PASS: full backup export and idempotent import; original workout values restored.');
