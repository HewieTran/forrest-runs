import test from 'node:test';
import assert from 'node:assert/strict';
import { measurementIn } from '../lib/runner-measurements.ts';
import { initialLinkedPlan, changePlanUnit, formatDistance, workoutTimeText } from '../lib/workout-form.ts';
import { EMPTY_WORKOUT_MEASUREMENTS } from '../lib/domain.ts';
import { scheduleTarget } from '../lib/workout-schedule.ts';
test('presentation precision and repeated conversions retain original canonical values', () => {
  const height = { value: 157.2999, units: 'km' }, weight = { value: 137.284619, units: 'mi' };
  for (let i = 0; i < 100; i++) {
    assert.equal(measurementIn(height, 'km', 'height'), height.value);
    assert.equal(measurementIn(weight, 'mi', 'weight'), weight.value);
    assert.equal(measurementIn(height, 'mi', 'height'), height.value / 2.54);
  }
  assert.equal(formatDistance(3.141592653, 'mi'), '3.14');
  assert.equal(formatDistance(.001, 'mi'), '0.001');
  const original = initialLinkedPlan({ ...EMPTY_WORKOUT_MEASUREMENTS, plannedDistance: 3.141592653, plannedPaceSecondsPerMile: 721.3456, plannedDurationSeconds: 2266 });
  let plan = original;
  for (let i = 0; i < 100; i++) plan = changePlanUnit(changePlanUnit(plan, 'km'), 'mi');
  assert.deepEqual(plan.exact, original.exact);
  assert.equal(scheduleTarget({ type: 'Easy Run', plannedDistance: 5 }, 'km'), '8.05 km');
  assert.equal(workoutTimeText(['', '', '']), '');
  assert.equal(workoutTimeText(['', '5', '']), '0:05:00');
});
