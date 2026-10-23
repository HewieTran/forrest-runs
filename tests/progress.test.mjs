import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_WORKOUT_MEASUREMENTS } from '../lib/domain.ts';
import { targetResult, completionGroups, calendarIndex, dayState, annualMileage, blockRange, calendarYears } from '../lib/progress.ts';
const base = { ...EMPTY_WORKOUT_MEASUREMENTS, id:'one', planId:'selected', date:'2026-10-22', type:'Easy Run', done:true, actualDistance:5, plannedDistance:5, targetMetric:'distance' };
const data = rows => ({ today:'2026-10-23', plan:{ raceDate:'2027-02-21' }, workouts:rows, restDays:[{date:'2026-10-21'}] });
test('target comparison uses the explicitly selected metric, preserves unknown and recorded zero', () => {
  assert.equal(targetResult(base),'met');
  assert.equal(targetResult({...base,actualDistance:6}),'above');
  assert.equal(targetResult({...base,actualDistance:0}),'below');
  assert.equal(targetResult({...base,actualDistance:null}),'unknown');
  assert.equal(targetResult({...base,targetMetric:null}),'unknown');
  assert.equal(targetResult({...base,done:false}),'unknown');
  assert.equal(targetResult({...base,targetMetric:'duration',plannedDurationSeconds:600,actualDurationSeconds:600,actualDistance:99}),'met');
});
test('completion splits runs/support and excludes today, future and rest', () => {
  const groups=completionGroups([base,{...base,type:'Strength',done:false},{...base,type:'Mobility'},{...base,date:'2026-10-23'},{...base,date:'2027-01-01'}],'2026-10-23');
  assert.deepEqual(groups.map(g=>[g.completed,g.scheduled,g.percent]),[[2,3,67],[1,1,100],[1,2,50]]);
  assert.equal(completionGroups([],'2026-10-23')[0].percent,null);
});
test('calendar separates rest, unscheduled, uncompleted, upcoming and partial days', () => {
  const index=calendarIndex(data([base,{...base,date:'2026-10-23',done:false},{...base,date:'2026-10-20',done:false}]));
  assert.equal(dayState('2026-10-21','2026-10-23',index),'rest');
  assert.equal(dayState('2026-10-20','2026-10-23',index),'missed');
  assert.equal(dayState('2026-10-23','2026-10-23',index),'upcoming');
  assert.equal(dayState('2026-10-24','2026-10-23',index),'empty');
  assert.equal(dayState('2026-01-01','2026-10-23',index),'outside');
  assert.equal(dayState(base.date,'2026-10-23',calendarIndex(data([base,{...base,done:false}]))),'partial');
  assert.equal(dayState(base.date,'2026-10-23',calendarIndex(data([base,{...base,actualDistance:null}]))),'unknown');
  assert.equal(dayState(base.date,'2026-10-23',calendarIndex(data([base,{...base,actualDistance:6}]))),'above');
  assert.equal(dayState(base.date,'2026-10-23',calendarIndex(data([base,{...base,actualDistance:4}]))),'below');
});
test('annual Monday buckets clip New Year and retain missing planned/recorded distances', () => {
  const rows=[{...base,date:'2026-12-31',actualDistance:4},{...base,date:'2027-01-01',actualDistance:6},{...base,date:'2027-01-02',plannedDistance:null,actualDistance:null},{...base,type:'Strength',date:'2027-01-01',actualDistance:99},{...base,date:'2027-01-03',done:false,actualDistance:99}];
  const old=annualMileage(rows,2026).at(-1), next=annualMileage(rows,2027)[0];
  assert.equal(old.recorded,4);assert.equal(next.recorded,6);assert.equal(next.planned,10);
  assert.deepEqual([next.start,next.end,next.missingPlanned,next.missingRecorded,next.scheduled,next.completed],['2027-01-01','2027-01-03',1,1,3,2]);
  assert.equal(annualMileage([{...base,actualDistance:0}],2026).find(w=>w.completed).recorded,0);
  assert.equal(annualMileage([],2028).length,53);
});
test('calendar retains cross-year records beyond the race and explicit setup bounds', () => {
  const input=data([{...base,date:'2025-12-31'},{...base,date:'2028-02-29'}]);
  input.plan.setup={goal:{startDate:'2025-09-01',targetDate:'2027-02-21'}};
  assert.deepEqual(blockRange(input),{start:'2025-09-01',end:'2028-02-29'});
  assert.deepEqual(calendarYears(blockRange(input)),[2025,2026,2027,2028]);
});
