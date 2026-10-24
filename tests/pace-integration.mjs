import assert from 'node:assert/strict';
import {normalizeTrainingBackup} from '../lib/backups.ts';
import {testRestore} from './blocks-integration.mjs';

export async function testPaces(db,dispatch){
  const owner={'oai-authenticated-user-id':'pace-owner','oai-authenticated-user-email':'pace@example.test'};
  const foreign={'oai-authenticated-user-id':'pace-foreign','oai-authenticated-user-email':'foreign@example.test'};
  const call=async(path,method='GET',body,headers=owner)=>{const response=await dispatch('http://localhost'+path,{method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};};
  const block=(await call('/api/training')).data.plan,scope='?blockId='+encodeURIComponent(block.id);
  const input={date:'2026-10-23',phase:'Peak',type:'Easy Run',plannedWorkout:'Original 5 mile easy',targetPace:'11:30–11:45 /mi',done:true,actualDistance:5,actualPace:'11:20 /mi',effort:null,pain:'',notes:'Preserve all original guidance',version:1,plannedDistance:5,plannedDurationSeconds:3600,targetMetric:'distance',plannedPaceSecondsPerMile:720.25,actualPaceSecondsPerMile:680,actualDurationSeconds:3400};
  const created=await call('/api/workouts'+scope,'POST',input);assert.equal(created.status,201);
  let saved=created.data.workout;const path='/api/workouts/'+encodeURIComponent(saved.id)+scope;
  assert.equal(saved.plannedPaceSecondsPerMile,720.25);assert.equal(saved.actualPaceSecondsPerMile,680);
  const old={...saved,notes:'Unrelated edit from old client'};
  for(const key of ['plannedDistance','plannedDurationSeconds','targetMetric','actualDurationSeconds','plannedPaceSecondsPerMile','actualPaceSecondsPerMile'])delete old[key];
  saved=(await call(path,'PATCH',old)).data.workout;
  assert.equal(saved.plannedPaceSecondsPerMile,720.25);assert.equal(saved.actualPaceSecondsPerMile,680);
  assert.equal(saved.targetPace,input.targetPace);assert.equal(saved.actualPace,input.actualPace);
  assert.equal((await call(path,'PATCH',saved,foreign)).status,404);
  assert.equal((await call(path,'PATCH',{...saved,version:saved.version-1})).status,409);
  for(const value of ['12:00',0,-1,86401])assert.equal((await call(path,'PATCH',{...saved,plannedPaceSecondsPerMile:value})).status,400);
  const cleared=await call(path,'PATCH',{...saved,plannedPaceSecondsPerMile:null,actualPaceSecondsPerMile:null});assert.equal(cleared.status,200);
  assert.equal(cleared.data.workout.plannedDistance,5);assert.equal(cleared.data.workout.targetPace,input.targetPace);
  saved=(await call(path,'PATCH',{...cleared.data.workout,plannedPaceSecondsPerMile:720.25,actualPaceSecondsPerMile:680})).data.workout;
  const reloaded=(await call('/api/training'+scope)).data.workouts.find(w=>w.id===saved.id);assert.deepEqual(reloaded,saved);
  const backup=(await call('/api/export'+scope)).data;assert.equal(backup.schemaVersion,4);assert.deepEqual(normalizeTrainingBackup(backup),backup);await testRestore(backup);
  const before=(await db.prepare('SELECT * FROM workouts WHERE id=?').bind(saved.id).first());
  for(const value of [0,-1,86401,'not a number'])await assert.rejects(()=>db.prepare('UPDATE workouts SET planned_pace_seconds_per_mile=? WHERE id=?').bind(value,saved.id).run());
  assert.deepEqual(await db.prepare('SELECT * FROM workouts WHERE id=?').bind(saved.id).first(),before);
  console.log('PASS: numeric paces persist/reload, old clients preserve them, ownership/concurrency checks hold, v4 backups restore, and database constraints reject invalid pace values.');
}
