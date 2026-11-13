import assert from 'node:assert/strict';
import { insertExistingTestBlock } from './d1-helpers.mjs';
import {normalizeTrainingBackup} from '../lib/backups.ts';
import {testRestore} from './blocks-integration.mjs';

export async function testPaces(db,dispatch){
  const owner={'oai-authenticated-user-id':'pace-owner','oai-authenticated-user-email':'pace@example.test'};
  const foreign={'oai-authenticated-user-id':'pace-foreign','oai-authenticated-user-email':'foreign@example.test'};
  const call=async(path,method='GET',body,headers=owner)=>{const response=await dispatch('http://localhost'+path,{method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};};
  await insertExistingTestBlock(db, owner);
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
  const backup=(await call('/api/export'+scope)).data;assert.equal(backup.schemaVersion,6);assert.deepEqual(normalizeTrainingBackup(backup),backup);await testRestore(backup);
  const before=(await db.prepare('SELECT * FROM workouts WHERE id=?').bind(saved.id).first());
  for(const value of [0,-1,86401,'not a number'])await assert.rejects(()=>db.prepare('UPDATE workouts SET planned_pace_seconds_per_mile=? WHERE id=?').bind(value,saved.id).run());
  assert.deepEqual(await db.prepare('SELECT * FROM workouts WHERE id=?').bind(saved.id).first(),before);
  console.log('PASS: numeric paces persist/reload, old clients preserve them, ownership/concurrency checks hold, v5 backups restore, and database constraints reject invalid pace values.');
  for (const type of ['Mobility', 'Strength']) {
    const createdSupport = await call('/api/workouts'+scope, 'POST', {
      ...input, type, plannedWorkout: type, done: false,
      plannedDistance: null, plannedPaceSecondsPerMile: null, targetMetric: 'duration',
      actualDistance: null, actualPace: '', actualPaceSecondsPerMile: null, actualDurationSeconds: null,
    });
    assert.equal(createdSupport.status, 201, JSON.stringify(createdSupport.data));
    const support = (await call('/api/training'+scope)).data.workouts.find(w => w.id === createdSupport.data.workout.id);
    assert.deepEqual([support.plannedDistance, support.plannedPaceSecondsPerMile, support.actualDistance, support.actualPaceSecondsPerMile], [null, null, null, null]);
    const edited = await call('/api/workouts/'+encodeURIComponent(support.id)+scope, 'PATCH', {
      ...support, done: true, plannedDistance: 2, plannedPaceSecondsPerMile: 900,
      actualDistance: 1.5, actualPaceSecondsPerMile: 960,
      manualResultFields: ['actualDistance', 'actualPaceSecondsPerMile'],
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.data));
    const loaded = (await call('/api/training'+scope)).data.workouts.find(w => w.id === support.id);
    assert.deepEqual([loaded.plannedDistance, loaded.plannedPaceSecondsPerMile, loaded.actualDistance, loaded.actualPaceSecondsPerMile], [2, 900, 1.5, 960]);
    assert.deepEqual(loaded.resultOrigins, { actualDurationSeconds: input.plannedDurationSeconds });
  }
  const summary = (await call('/api/blocks')).data.blocks.find(b => b.id === block.id);
  assert.equal(summary.recordedMiles, 5);
  console.log('PASS: manual distance and pace save and reload on Mobility and Strength without counting toward running mileage.');

  const newRun = await call('/api/workouts'+scope, 'POST', {
    ...input, done: false, actualDistance: null, actualDurationSeconds: null,
    actualPace: '', actualPaceSecondsPerMile: null,
  });
  assert.equal(newRun.status, 201, JSON.stringify(newRun.data));
  const logged = await call('/api/workouts/'+encodeURIComponent(newRun.data.workout.id)+scope, 'PATCH', {
    ...newRun.data.workout, done: true, actualDistance: 2.45, actualDurationSeconds: 1785,
  });
  assert.equal(logged.status, 200, JSON.stringify(logged.data));
  const recorded = (await call('/api/training'+scope)).data.workouts.find(w => w.id === logged.data.workout.id);
  assert.equal(recorded.actualDistance, 2.45);
  assert.equal(recorded.actualDurationSeconds, 1785);
  assert.equal(recorded.actualPaceSecondsPerMile, null);
  assert.equal(recorded.resultOrigins, null);
  console.log('PASS: completing a run with recorded distance and time preserves the optional pace field for the calculated summary.');
}
