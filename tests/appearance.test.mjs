import test from 'node:test';
import assert from 'node:assert/strict';
import { APPEARANCE_PRESETS, DEFAULT_APPEARANCE, resolveAppearance, validateAppearance } from '../lib/appearance.ts';
import { normalizeTrainingBackup } from '../lib/backups.ts';
test('forest is the default; all four approved presets remain available', () => {
 assert.equal(DEFAULT_APPEARANCE,'forest'); assert.deepEqual(APPEARANCE_PRESETS.map(x=>x.id),['forest','road','slate','japanese']);
 for(const value of [undefined,null,'unknown',''])assert.equal(resolveAppearance(value),'forest');
 for(const preset of APPEARANCE_PRESETS)assert.equal(resolveAppearance(preset.id),preset.id);
});
test('appearance accepts only approved preset/version and rejects ownership or invalid data', () => {
 assert.deepEqual(validateAppearance({preset:'road',version:2}),{preset:'road',version:2});
 for(const input of [null,[],{preset:'url(https://external)',version:0},{preset:'road',version:-1},{preset:'forest',version:.1},{preset:'slate',version:0,ownerId:'other'}])assert.throws(()=>validateAppearance(input));
});
test('backup v9 carries appearance and old v8 profiles stay unchanged',()=>{
 const old={schemaVersion:8,exportedAt:'2026-11-25T12:00:00.000Z',blocks:[],workouts:[],restDays:[],profile:{firstName:'Casey',lastName:null,avatarColor:null,version:1,updatedAt:'2026-11-25T12:00:00.000Z'}};
 assert.deepEqual(normalizeTrainingBackup(old),old);
 const current={...old,schemaVersion:9,profile:{...old.profile,appearance:'japanese'}};
 assert.deepEqual(normalizeTrainingBackup(current),current);
 assert.throws(()=>normalizeTrainingBackup({...current,profile:{...current.profile,appearance:'bad'}}));
});
