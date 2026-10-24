import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_WORKOUT_MEASUREMENTS, validateWorkout } from '../lib/domain.ts';
import { parseInput, inputFeedback, initialLinkedPlan, editLinkedPlan, changePlanUnit, KM_PER_MILE } from '../lib/workout-form.ts';
const blank={...EMPTY_WORKOUT_MEASUREMENTS};
test('form parsing rejects descriptions, malformed times, invalid seconds and non-integer effort; null and zero differ',()=>{
  assert.equal(parseInput('5.5','distance','mi'),5.5);
  assert.equal(parseInput('.5','distance','mi'),.5);
  assert.equal(parseInput('8','distance','km'),8/KM_PER_MILE);
  assert.equal(parseInput('','actualDistance','mi'),null);
  assert.equal(parseInput('0','actualDistance','mi'),0);
  assert.equal(parseInput('0:00:00','actualDuration','mi'),0);
  for(const [text,kind] of [['5 mi easy','distance'],['1e2','distance'],['0','distance'],['-1','actualDistance'],['12:75','pace'],['0:00','pace'],['1:99:00','duration'],['0:00:00','duration'],['2.5','effort'],['11','effort']])assert.equal(parseInput(text,kind,'mi'),null);
  assert.equal(inputFeedback('12:','pace','mi',false).state,'hint');
  assert.equal(inputFeedback('12:','pace','mi',true).state,'error');
  assert.equal(inputFeedback('12:75','pace','mi',false).state,'error');
});
test('two most recent explicit inputs calculate the third, retain exact values and keep completion criterion stable',()=>{
  let plan=initialLinkedPlan(blank);
  plan=editLinkedPlan(plan,'distance','5','mi',true);
  plan=editLinkedPlan(plan,'pace','12:00','mi',true);
  assert.equal(plan.text.duration,'1:00:00');assert.equal(plan.targetMetric,'distance');
  plan=editLinkedPlan(plan,'distance','5','mi',true);
  plan=editLinkedPlan(plan,'duration','0:50:00','mi',true);
  assert.equal(plan.text.pace,'10:00');
  plan=editLinkedPlan(plan,'pace','12:00','mi',true);
  assert.equal(plan.exact.distance,50/12);assert.equal(plan.targetMetric,'distance');
  const original=structuredClone(plan);
  for(let i=0;i<20;i++){plan=changePlanUnit(plan,'km');plan=changePlanUnit(plan,'mi');}
  assert.deepEqual(plan.exact,original.exact);
  const paused=editLinkedPlan(plan,'pace','12:75','mi',true);
  assert.equal(paused.exact.duration,plan.exact.duration);
  assert.equal(paused.text.duration,plan.text.duration);
  assert.equal(changePlanUnit(paused,'km').text.pace,'12:75');
});
test('duration-led new workouts keep time as their target and strength never auto-calculates running distance',()=>{
  let plan=initialLinkedPlan(blank);
  plan=editLinkedPlan(plan,'duration','1:00:00','mi',true);
  plan=editLinkedPlan(plan,'pace','12:00','mi',true);
  assert.equal(plan.exact.distance,5);assert.equal(plan.targetMetric,'duration');
  const strength=editLinkedPlan(initialLinkedPlan(blank),'duration','0:30:00','mi',false);
  assert.equal(strength.exact.distance,null);assert.equal(strength.exact.duration,1800);
});
test('numeric pace API fields reject text/non-finite/zero while legacy pace guidance remains intact',()=>{
  const input={date:'2026-10-23',phase:'Peak',type:'Easy Run',plannedWorkout:'Original intervals',targetPace:'11:30–11:45 /mi; controlled',done:false,actualDistance:null,actualPace:'Original pace text',effort:null,pain:'',notes:'',version:1};
  const saved=validateWorkout({...input,plannedPaceSecondsPerMile:720,actualPaceSecondsPerMile:710.25});
  assert.equal(saved.targetPace,input.targetPace);assert.equal(saved.actualPace,input.actualPace);
  for(const value of ['12:00','easy',0,-1,Infinity,NaN,86401])assert.throws(()=>validateWorkout({...input,plannedPaceSecondsPerMile:value}));
});
