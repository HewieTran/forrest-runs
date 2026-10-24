import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeDistanceTarget } from '../lib/distance-conversion.ts';
const row = description => ({type:'Easy Run',plannedWorkout:description,plannedDistance:null,targetMetric:null});
test('offline proposals recognize explicit single distances without changing records', () => {
  for(const description of ['5 mi easy','5 mile steady','5 miles recovery']) {
    const input=row(description), copy=structuredClone(input);
    assert.equal(proposeDistanceTarget(input).miles,5);assert.deepEqual(input,copy);
  }
  assert.equal(proposeDistanceTarget(row('Race 26.2 mi')).miles,26.2);
  assert.equal(proposeDistanceTarget(row('5 mi total: 3 x 10 min tempo')).miles,5);
  assert.ok(Math.abs(proposeDistanceTarget(row('8 km easy')).miles - 8/1.609344)<1e-10);
});
test('ranges, intervals, extra strides, absent distances, and existing targets stay for review or are skipped', () => {
  for(const description of ['5–6 mi easy','4.5-5 mi total: 2 x 15 min tempo','1 mi warmup + 3 x 1 mi + cooldown','5 mi easy + 6 x 20 sec strides','6 mi with 3 mi @ marathon pace','30 min tempo','Easy run only'])
    assert.equal(proposeDistanceTarget(row(description)).status,'review',description);
  assert.equal(proposeDistanceTarget({...row('5 mi easy'),plannedDistance:4}).status,'skip');
  assert.equal(proposeDistanceTarget({...row('5 mi easy'),targetMetric:'duration'}).status,'skip');
  assert.equal(proposeDistanceTarget({...row('5 mi easy'),type:'Strength'}).status,'skip');
});
