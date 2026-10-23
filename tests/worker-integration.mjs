import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Miniflare, applyAllMigrations } from './d1-helpers.mjs';
import { testBlocks } from './blocks-integration.mjs';
const chunks=JSON.parse(await readFile('.sites-runtime/training-import.env.json','utf8'));
const serverFiles=await readdir('dist/server',{recursive:true});
const modules=['index.js',...serverFiles.filter(p=>p.endsWith('.js')&&p!=='index.js')].map(p=>({type:'ESModule',path:path.resolve('dist/server',p)}));
const mf=new Miniflare({modules,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false,d1Databases:{DB:'00000000-0000-4000-8000-000000000000'},bindings:{...chunks,TRAINING_SEED_OWNER:'test-runner@example.test'}});
try {
 const db=await mf.getD1Database('DB');
 await applyAllMigrations(db);
 const nativeFetch=globalThis.fetch;
 globalThis.fetch=(input,init)=>typeof input==='string'&&input.startsWith('http://127.0.0.1:4173')?mf.dispatchFetch(input,init):nativeFetch(input,init);
 await import('./api-local.mjs');
 const anonymous=await mf.dispatchFetch('http://localhost/');
 assert.equal(anonymous.status,200);
 const signInPage=await anonymous.text();
 assert.match(signInPage,/Sign in with ChatGPT/);
 assert.match(signInPage,/\/signin-with-chatgpt\?return_to=%2F/);
 const named=await mf.dispatchFetch('http://localhost/api/training',{headers:{
  'oai-authenticated-user-id':'integration-owner',
  'oai-authenticated-user-email':'test-runner@example.test',
  'oai-authenticated-user-full-name':encodeURIComponent('Hiếu Tran'),
  'oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8',
 }});
 assert.equal(named.status,200);
 const namedData=await named.json();
 assert.equal(namedData.plan.id,'plan:integration-owner');
 assert.equal(namedData.displayName,'Hiếu');
 assert.ok(namedData.workouts.every(workout=>workout.id.startsWith('plan:integration-owner:row:')));
 console.log('PASS: app identity preserves owner IDs, imported workout IDs, decoded display names, and sign-in behavior.');
 await testBlocks(db, (input, init) => mf.dispatchFetch(input, init));
 const preview=await mf.dispatchFetch('http://localhost/preview');
 if(preview.status!==404)throw new Error('The development preview must not be exposed in production.');
 console.log('PASS: production build hides the synthetic preview.');
}finally {await mf.dispose();}
