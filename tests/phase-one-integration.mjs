import assert from 'node:assert/strict';
import { simpleSetup } from '../lib/setup.ts';
import { centralToday, addDays } from '../lib/domain.ts';
import { normalizeTrainingBackup } from '../lib/backups.ts';
import { testRestore } from './blocks-integration.mjs';
import { editWorkoutStep, structureMeasurements } from '../lib/workout-structure.ts';
export async function testPhaseOne(db,dispatch,provider='simulation'){
 const headers={'Content-Type':'application/json','oai-authenticated-user-id':'phase-one-owner','oai-authenticated-user-email':'phase-one@example.test'};
 const other={...headers,'oai-authenticated-user-id':'phase-one-other'};
 async function call(path,method='GET',body,auth=headers){const response=await dispatch('http://localhost'+path,{method,headers:auth,body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};}
 const today=centralToday(),setup=simpleSetup(undefined,'',addDays(today,28),today);
 setup.step=3;setup.goal.targetDurationSeconds=1801;setup.runner={...setup.runner,experience:'novice',age:35,height:68,weight:150};setup.availability.days=[1,3,6];
 setup.benchmark={distance:'5k',durationSeconds:2100,date:today,effortConfirmed:true};
 const created=await call('/api/blocks','POST',{setup,complete:true});assert.equal(created.status,201,JSON.stringify(created.data));
 const id=created.data.block.id,path='/api/blocks/'+id,scope='?blockId='+id;
 assert.equal((await call(path+'/generation','POST',{version:1,consent:true,saveImmediately:true},other)).status,404);
 const generated=await call(path+'/generation','POST',{version:1,consent:true,saveImmediately:true});assert.equal(generated.status,200,JSON.stringify(generated.data));
 const block=generated.data.block;assert.equal(block.status,'draft');assert.equal(block.generation.status,'accepted');assert.equal(block.generation.provider,provider);if(provider==='simulation')assert.equal(block.generation.usage,null);
 assert.deepEqual(block.setup.benchmark,setup.benchmark);
 assert.deepEqual(block.generation.setupSnapshot.benchmark,setup.benchmark);
 assert.equal(block.generation.input.baseline.results[0].durationSeconds,2100);
 assert.equal(block.generation.input.baseline.results[0].distanceMeters,5000);
 const loaded=(await call('/api/training'+scope)).data;assert.ok(loaded.workouts.length>0);assert.ok(loaded.restDays.length>0);
 assert.equal(loaded.workouts.length+loaded.restDays.length,29);assert.ok(loaded.workouts.every(w=>w.plannedDistance>0&&w.plannedDurationSeconds>0&&w.plannedPaceSecondsPerMile>0));
 const duplicate=await call(path+'/generation','POST',{version:1,consent:true,saveImmediately:true});assert.equal(duplicate.status,200);assert.equal(duplicate.data.block.generation.id,block.generation.id);
 assert.equal((await call('/api/training'+scope)).data.workouts.length,loaded.workouts.length);
 const list=await dispatch('http://localhost/blocks',{headers});const html=await list.text();assert.match(html,/Not started/);assert.doesNotMatch(html,/Create manually|Manual block|cheesy/);
 const settings=await dispatch('http://localhost/blocks/'+id+'/settings',{headers});assert.match(await settings.text(),/Training block settings/);
 const foreign=await dispatch('http://localhost/blocks/'+id+'/settings',{headers:other});assert.doesNotMatch(await foreign.text(),/Training block settings/);
 let workout=loaded.workouts[0],edit='/api/workouts/'+workout.id+scope;
 const copied=await call(edit,'PATCH',{...workout,done:true,resultOrigins:{actualDistance:999}});assert.equal(copied.status,200,JSON.stringify(copied.data));
 workout=copied.data.workout;assert.equal(workout.actualDistance,workout.plannedDistance);assert.equal(workout.actualDurationSeconds,workout.plannedDurationSeconds);assert.equal(workout.actualPaceSecondsPerMile,workout.plannedPaceSecondsPerMile);assert.equal(workout.resultOrigins.actualDistance,workout.plannedDistance);
 assert.equal((await call(edit,'PATCH',{...loaded.workouts[0],done:true})).status,409);
 const edited=await call(edit,'PATCH',{...workout,manualResultFields:['actualDistance'],notes:'Manual value even though unchanged'});assert.equal(edited.status,200);workout=edited.data.workout;assert.equal('actualDistance' in workout.resultOrigins,false);
 // Include an untouched copied workout in the backup to prove provenance survives restore.
 const second=loaded.workouts[1];assert.equal((await call('/api/workouts/'+second.id+scope,'PATCH',{...second,done:true})).status,200);
 const backup=(await call('/api/export'+scope)).data;assert.equal(backup.schemaVersion,6);assert.deepEqual(normalizeTrainingBackup(backup),backup);await testRestore(backup);
 const unchecked=await call(edit,'PATCH',{...workout,done:false});assert.equal(unchecked.status,200);workout=unchecked.data.workout;assert.equal(workout.actualDistance,workout.plannedDistance);assert.equal(workout.actualDurationSeconds,null);assert.equal(workout.actualPaceSecondsPerMile,null);assert.equal(workout.resultOrigins,null);
 const zero=await call(edit,'PATCH',{...workout,actualDistance:0,actualDurationSeconds:0,done:true});assert.equal(zero.status,200);assert.equal(zero.data.workout.actualDistance,0);assert.equal(zero.data.workout.actualDurationSeconds,0);
 assert.equal((await call(edit,'PATCH',{...zero.data.workout,done:false},other)).status,404);
 if(provider==='simulation')assert.equal((await call(path,'PATCH',{status:'active',version:block.version})).status,409);
 else {
  assert.deepEqual((await call('/api/blocks')).data.blocks.map(item => item.id), [id]);
  const started=await call(path,'PATCH',{status:'active',version:block.version});assert.equal(started.status,200,JSON.stringify(started.data));
  const finished=await call(path,'PATCH',{status:'completed',version:started.data.block.version});assert.equal(finished.status,200);
 }
 assert.equal((await call('/api/training'+scope)).data.plan.generation.alteredAt,null);
 const beforeStepEdit=(await call('/api/training'+scope)).data;
 const stepWorkout=beforeStepEdit.workouts[0],stepPath='/api/workouts/'+stepWorkout.id+scope;
 assert.ok(stepWorkout.planStructure.steps.length>0);
 assert.equal((await call(stepPath,'PATCH',{...stepWorkout,plannedDurationSeconds:1,confirmPlanChange:true})).status,400);
 const planStructure=editWorkoutStep(stepWorkout.planStructure,0,'duration',stepWorkout.planStructure.steps[0].durationSeconds+60);
 const stepInput={...stepWorkout,planStructure,...structureMeasurements(planStructure)};
 assert.equal((await call(stepPath,'PATCH',stepInput,other)).status,404);
 assert.equal((await call(stepPath,'PATCH',stepInput)).status,409);
 const stepSave=await call(stepPath,'PATCH',{...stepInput,confirmPlanChange:true});assert.equal(stepSave.status,200,JSON.stringify(stepSave.data));
 assert.equal((await call(stepPath,'PATCH',{...stepInput,confirmPlanChange:true})).status,409);
 const afterStepEdit=(await call('/api/training'+scope)).data;
 const stepReload=afterStepEdit.workouts.find(w=>w.id===stepWorkout.id);
 assert.deepEqual(stepReload.planStructure,planStructure);
 assert.deepEqual(stepReload.originalSource,stepWorkout.originalSource);
 assert.deepEqual(afterStepEdit.plan.generation.output,beforeStepEdit.plan.generation.output);
 assert.ok(afterStepEdit.plan.generation.alteredAt);
 // Guidance-only changes must also be tracked even when numeric totals stay identical.
 const noteChange={...stepReload,planStructure:{...planStructure,notes:'Updated coaching note only.'}};
 assert.equal((await call(stepPath,'PATCH',noteChange)).status,409);
 const beforeNoteVersion=afterStepEdit.plan.version;
 assert.equal((await call(stepPath,'PATCH',{...noteChange,confirmPlanChange:true})).status,200);
 assert.equal((await call('/api/training'+scope)).data.plan.version,beforeNoteVersion+1);
 const stepsBackup=(await call('/api/export'+scope)).data;assert.deepEqual(normalizeTrainingBackup(stepsBackup),stepsBackup);await testRestore(stepsBackup);
 console.log('PASS: structured steps save/reload/backup, derived totals, rejected conflicting targets, ownership, confirmation, stale edits and immutable original snapshots.');
 console.log('PASS: confirmed benchmark → numeric generation → direct save/reload, idempotent retry, settings ownership, copied/manual/zero results, stale edits and v6 restore.');
}
