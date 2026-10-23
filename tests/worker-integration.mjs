import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url),wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=wranglerRequire('miniflare');
const chunks=JSON.parse(await readFile('.sites-runtime/training-import.env.json','utf8'));
const serverFiles=await readdir('dist/server',{recursive:true});
const modules=['index.js',...serverFiles.filter(p=>p.endsWith('.js')&&p!=='index.js')].map(p=>({type:'ESModule',path:path.resolve('dist/server',p)}));
const mf=new Miniflare({modules,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false,d1Databases:{DB:'00000000-0000-4000-8000-000000000000'},bindings:{...chunks,TRAINING_SEED_OWNER:'test-runner@example.test'}});
try {
 const db=await mf.getD1Database('DB');
 const sql=await readFile('drizzle/0000_hard_ronan.sql','utf8');
 for(const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 const nativeFetch=globalThis.fetch;
 globalThis.fetch=(input,init)=>typeof input==='string'&&input.startsWith('http://127.0.0.1:4173')?mf.dispatchFetch(input,init):nativeFetch(input,init);
 await import('./api-local.mjs');
 const preview=await mf.dispatchFetch('http://localhost/preview');
 if(preview.status!==404)throw new Error('The development preview must not be exposed in production.');
 console.log('PASS: production build hides the synthetic preview.');
}finally {await mf.dispose();}
