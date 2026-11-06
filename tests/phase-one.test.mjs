import test from 'node:test';
import assert from 'node:assert/strict';
import { simpleSetup, validateSetup, setupIssues, plannerIntake, setupTargetTime } from '../lib/setup.ts';
import { preparePlanner, validatePlanOutput, workoutForSession } from '../lib/planner.ts';
import { simulatedPlan } from '../lib/simulated-plan.ts';
import { applyCompletion } from '../lib/workout-completion.ts';
import { exampleSetup } from './setup-fixture.mjs';
export function phaseOneSetup(today = '2026-10-27') {
 const setup = simpleSetup(undefined, '', '2026-11-24', today);
 setup.step=3;setup.runner={...setup.runner,experience:'novice',age:35,height:68,weight:150};
 setup.goal.targetDurationSeconds=1801;setup.availability.days=[1,3,6];
 setup.benchmark={distance:'5k',durationSeconds:2100,date:today,effortConfirmed:true};return setup;
}
test('benchmark intake supports all experience levels without deferred workload inputs',()=>{
 for(const experience of ['novice','intermediate','advanced']){
  const setup=phaseOneSetup();setup.runner.experience=experience;
  assert.deepEqual(setupIssues(validateSetup(setup)),[]);
  const input=preparePlanner(setup,'2026-10-27');
  assert.equal(input.goal.targetDurationSeconds,1801);assert.equal(setupTargetTime(setup),'0:30:01');
  assert.equal(input.runner.experience,experience);assert.equal(input.baseline.weeklyDistanceMiles,null);
  const output=simulatedPlan(input).output;assert.equal(output.outcome,'plan');
  for(const session of output.sessions){const workout=workoutForSession(session);assert.ok(workout.plannedDistance>0);assert.ok(workout.plannedPaceSecondsPerMile>0);assert.ok(workout.plannedDurationSeconds>0);}
  const invalid=structuredClone(output);invalid.sessions[0].steps[0].paceSecondsPerMile=null;
  assert.throws(()=>validatePlanOutput(invalid,input));
 }
 for(const field of ['experience','age','height','weight']) {const setup=phaseOneSetup();setup.runner[field]=null;assert.ok(setupIssues(setup).some(issue=>issue.field===field));}
 const bad=phaseOneSetup();bad.goal.distanceKm=10;assert.ok(setupIssues(bad).length);
});
test('editing legacy intake preserves historical answers but defers them in new generation',()=>{
 const old=exampleSetup(),snapshot=structuredClone(old),upgraded=simpleSetup(old);
 assert.deepEqual(old,snapshot);assert.deepEqual(upgraded.baseline,old.baseline);
 upgraded.runner.experience='intermediate';
 assert.ok(setupIssues(upgraded).some(issue=>issue.field==='benchmarkEffort'));
 upgraded.benchmark={distance:'10k',durationSeconds:3600,date:'2026-10-20',effortConfirmed:true};
 const input=plannerIntake(upgraded);assert.equal(input.baseline.results.length,1);assert.equal(input.availability.maxSessionDurationSeconds,null);
 assert.equal(input.goal.targetDurationSeconds,1500);
});
const workout={type:'Easy Run',done:false,actualPace:'',actualDistance:null,actualDurationSeconds:null,actualPaceSecondsPerMile:null,plannedDistance:5,plannedDurationSeconds:3600,plannedPaceSecondsPerMile:720,resultOrigins:null};
test('checking copies known targets and unchecking clears only untouched copies',()=>{
 const done=applyCompletion(workout,{done:true});assert.deepEqual(done.resultOrigins,{actualDistance:5,actualDurationSeconds:3600,actualPaceSecondsPerMile:720});
 const edited=applyCompletion(done,{actualDistance:5},['actualDistance']);
 const undone=applyCompletion(edited,{done:false});assert.equal(undone.actualDistance,5);assert.equal(undone.actualDurationSeconds,null);assert.equal(undone.actualPaceSecondsPerMile,null);assert.equal(undone.resultOrigins,null);
 const zero=applyCompletion({...workout,actualDistance:0,actualDurationSeconds:0},{done:true});assert.equal(zero.actualDistance,0);assert.equal(zero.actualDurationSeconds,0);
 const unknown=applyCompletion({...workout,plannedDistance:null,plannedDurationSeconds:null,plannedPaceSecondsPerMile:null},{done:true});assert.equal(unknown.actualDistance,null);assert.equal(unknown.resultOrigins,null);
 const strength=applyCompletion({...workout,type:'Strength'},{done:true});assert.equal(strength.actualDistance,null);assert.equal(strength.actualPaceSecondsPerMile,null);assert.equal(strength.actualDurationSeconds,3600);
 const derived=applyCompletion({...workout,plannedPaceSecondsPerMile:null},{done:true});assert.equal(derived.actualPaceSecondsPerMile,720);
});
