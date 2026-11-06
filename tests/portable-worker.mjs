import { readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { Miniflare, applyAllMigrations, createFetchMock } from './d1-helpers.mjs';
import { testPhaseOne } from './phase-one-integration.mjs';
// No workbook, runtime secrets or live provider requests. Production handlers,
// isolated D1, synthetic identities and denied outbound networking throughout.
await access('dist/server/index.js');
const files=await readdir('dist/server',{recursive:true}),modules=['index.js',...files.filter(f=>f.endsWith('.js')&&f!=='index.js')].map(f=>({type:'ESModule',path:path.resolve('dist/server',f)}));
const fetchMock=createFetchMock();fetchMock.disableNetConnect();
const options={modules,fetchMock,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false,d1Databases:{DB:'phase-one-tests-only'}};
const worker=new Miniflare({...options,bindings:{TRAINING_PLANNER_MODE:'simulation'}});
try{
 const db=await worker.getD1Database('DB');await applyAllMigrations(db);const dispatch=(input,init)=>worker.dispatchFetch(input,init);
 await testPhaseOne(db,dispatch);
 for(const [file,name] of [['benchmark','testBenchmark'],['lifecycle','testLifecycle'],['setup','testSetup'],['workout-contract','testWorkoutContract'],['progress','testProgress'],['pace','testPaces'],['delete-blocks','testDeleteBlocks']]){
  const suite=await import('./'+file+'-integration.mjs');await suite[name](db,dispatch,...(name==='testLifecycle'?[0]:[]));
 }
}finally{await worker.dispose();}
