import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { JAPANESE_ART } from '../lib/appearance-art.ts';
import { WORKOUT_PERIODS, periodArtwork } from '../lib/workout-period.ts';

test('replacement mapping has an existing independent asset for every workout period', () => {
 for (const period of WORKOUT_PERIODS) {
  assert.ok(existsSync('public'+JAPANESE_ART.workouts[period]));
  assert.equal(periodArtwork(period),`/run-${period}.webp`);
 }
 for(const path of [JAPANESE_ART.background,JAPANESE_ART.journey,JAPANESE_ART.thumbnail]) assert.ok(existsSync('public'+path));
});
test('extending the appearance constraint preserves every existing profile field', () => {
 const db=new DatabaseSync(':memory:');
 try {
  db.exec(readFileSync('drizzle/0011_account_profiles.sql','utf8'));
  db.exec(readFileSync('drizzle/0012_appearance.sql','utf8'));
  for(const [i,preset] of ['forest','road','slate'].entries()) db.prepare('INSERT INTO training_profiles VALUES (?,?,?,?,?,?,?)').run('owner'+i,'Casey','Runner',i,7,'2026-11-26T12:00:00Z',preset);
  const before=db.prepare('SELECT * FROM training_profiles ORDER BY owner_id').all();
  db.exec(readFileSync('drizzle/0013_japanese_appearance.sql','utf8'));
  assert.deepEqual(db.prepare('SELECT * FROM training_profiles ORDER BY owner_id').all(),before);
  db.prepare('UPDATE training_profiles SET appearance=? WHERE owner_id=?').run('japanese','owner0');
  assert.equal(db.prepare('SELECT appearance FROM training_profiles WHERE owner_id=?').get('owner0').appearance,'japanese');
  assert.throws(()=>db.prepare('UPDATE training_profiles SET appearance=?').run('unknown'));
 }finally{db.close();}
});
