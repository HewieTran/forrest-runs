import assert from 'node:assert/strict';
import test from 'node:test';
import { finishTimeFromParts, finishTimeParts, heightFromParts, heightParts } from '../lib/setup-number-entry.ts';

test('finish times accept minutes alone and reopen from the saved duration format', () => {
  assert.equal(finishTimeFromParts(['', '30', '']), 1800);
  assert.deepEqual(finishTimeParts('2:05:00'), ['2', '05', '00']);
  assert.equal(finishTimeFromParts(finishTimeParts('2:05:00')), 7500);
  assert.equal(finishTimeFromParts(finishTimeParts('')), null);
});

test('finish times reject invalid parts without silently changing the duration', () => {
  for (const parts of [['', '60', ''], ['', '27', '60'], ['', '0', ''], ['2.5', '', ''], ['24', '', '01']]) {
    assert.equal(finishTimeFromParts(parts), NaN);
  }
  assert.equal(finishTimeFromParts(['24', '', '']), 86400);
});

test('imperial height round trips older fractional inches and accepts an empty draft', () => {
  assert.deepEqual(heightParts(70), ['5', '10']);
  assert.deepEqual(heightParts(69.7), ['5', '9.7']);
  assert.equal(heightFromParts(heightParts(69.7)), 69.7);
  assert.equal(heightFromParts(['5', '']), 60);
  assert.equal(heightFromParts(heightParts(null)), null);
  assert.equal(heightFromParts(['5', '12']), NaN);
  assert.equal(heightFromParts(['5.5', '0']), NaN);
});
