import assert from 'node:assert/strict';
import { normalizeTrainingBackup } from '../lib/backups.ts';
export async function testAppearance(dispatch,a,b){
 const call=async(headers,route='/api/profile',method='GET',body)=>{const r=await dispatch('http://localhost'+route,{method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 assert.equal((await call({},'/api/profile/appearance','PATCH',{preset:'road',version:0})).status,401);
 let account=(await call(a)).data.account; const before=structuredClone(account);
 assert.equal((await call(a,'/api/profile/appearance','PATCH',{preset:'road',version:account.profile?.version||0,ownerId:'other'})).status,400);
 assert.equal((await call(a,'/api/profile/appearance','PATCH',{preset:'pink',version:0})).status,400);
 for(const preset of ['road','slate','forest']){
  const oldVersion=account.profile?.version||0;
  const saved=await call(a,'/api/profile/appearance','PATCH',{preset,version:oldVersion});assert.equal(saved.status,200);account=saved.data.account;
  assert.equal(account.profile.appearance,preset);assert.equal(account.greetingName,before.greetingName);assert.equal(account.initial,before.initial);
  assert.equal(account.profile.avatarColor,before.profile?.avatarColor??null);
  assert.deepEqual((await call(a)).data.account,account);
  assert.equal((await call(a,'/api/profile/appearance','PATCH',{preset:'slate',version:oldVersion})).status,409);
  const html=await (await dispatch('http://localhost/blocks',{headers:a})).text();assert.match(html,new RegExp('data-appearance="'+preset+'"'));assert.match(html,/aria-label="Appearance"/);
 }
 const foreign=(await call(b)).data.account;assert.notDeepEqual(foreign.profile,account.profile);
 const backup=(await call(a,'/api/export')).data;assert.equal(backup.schemaVersion,10);assert.equal(backup.profile.appearance,'forest');assert.deepEqual(normalizeTrainingBackup(backup),backup);
 // Legacy profile updates change only names/colors and preserve the saved appearance.
 let selected=await call(a,'/api/profile/appearance','PATCH',{preset:'road',version:account.profile.version});
 let updated=await call(a,'/api/profile','PATCH',{firstName:'Casey',lastName:'Runner',avatarColor:3,version:selected.data.account.profile.version});
 assert.equal(updated.status,200);assert.equal(updated.data.account.profile.appearance,'road');
 // Restore original names/color and forest, preserving downstream integration fixtures.
 updated=await call(a,'/api/profile','PATCH',{firstName:before.profile?.firstName??null,lastName:before.profile?.lastName??null,avatarColor:before.profile?.avatarColor??null,version:updated.data.account.profile.version});
 const final=await call(a,'/api/profile/appearance','PATCH',{preset:'forest',version:updated.data.account.profile.version});
 assert.equal(final.status,200);
 console.log('PASS: appearance defaults/presets, SSR, ownership, stale/invalid updates, legacy profile preservation and v9 backups.');return final.data.account;
}
