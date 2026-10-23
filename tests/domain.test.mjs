import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,distanceMilestones,phaseMilestones,mileageWeeks,validateWorkout,weekStart,validDate} from '../lib/domain.ts';
const base={id:'one',planId:'plan',date:'2026-10-22',phase:'Peak',type:'Easy Run',plannedWorkout:'5 mi easy',targetPace:'Conversational',done:true,actualDistance:5,actualPace:'13:00',effort:5,pain:'None',notes:'',sourceRow:2,originalSource:null,version:1,updatedAt:'2026-10-22T12:00:00Z'};
test('missing distance stays missing; zero remains a recorded value; strength miles do not inflate runs',()=>{
 const s=summarize([base,{...base,id:'two',actualDistance:null},{...base,id:'zero',actualDistance:0},{...base,id:'strength',type:'Strength',actualDistance:100},{...base,id:'future',date:'2026-11-01',done:false}], '2026-10-23');
 assert.deepEqual([s.total,s.completed,s.runs,s.support,s.miles,s.missingDistance,s.percent,s.due,s.dueCompleted],[5,4,3,1,5,1,80,4,4]);
});
test('milestones use completed recorded runs and retain first achievement date',()=>{
 const rows=[{...base,id:'later',date:'2026-10-23',actualDistance:16},{...base,id:'early',actualDistance:13.1},{...base,id:'planned',actualDistance:20,done:false}];
 const m=distanceMilestones(rows);assert.equal(m[0].workout.id,'early');assert.equal(m[1].workout.id,'early');assert.equal(m[2].workout.id,'later');assert.equal(m[3].workout,null);
});
test('past dates alone do not complete a training phase',()=>{
 const p=phaseMilestones([{...base,phase:'Base Build',date:'2026-05-26',done:false}], '2026-10-22')[0];assert.equal(p.state,'past');assert.equal(p.done,0);
});
test('rescheduling changes the Monday-based mileage bucket',()=>{
 assert.equal(weekStart('2026-10-25'),'2026-10-19');assert.equal(weekStart('2026-10-26'),'2026-10-26');
 const weeks=mileageWeeks([{...base,date:'2026-10-26'}],'2026-10-26');assert.equal(weeks.at(-1).miles,5);assert.equal(weeks.at(-2).miles,0);
});
test('validation preserves blank versus zero and rejects invalid dates and effort',()=>{
 assert.equal(validateWorkout({...base,actualDistance:null}).actualDistance,null);assert.equal(validateWorkout({...base,actualDistance:0}).actualDistance,0);
 for(const distance of [-1,NaN,Infinity,'5'])assert.throws(()=>validateWorkout({...base,actualDistance:distance}));
 assert.throws(()=>validateWorkout({...base,effort:11}));assert.throws(()=>validateWorkout({...base,effort:2.5}));
 assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2028-02-29'),true);
});
