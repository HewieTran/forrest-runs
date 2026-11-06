import assert from 'node:assert/strict';
import { centralToday } from '../lib/domain.ts';
import { currentPlannerFixture as plannerFixture, responseFixture } from './planner-fixture.mjs';
import { MONTHLY_BUDGET_MICRODOLLARS, REQUEST_RESERVE_MICRODOLLARS } from '../lib/planner-policy.ts';

export async function testPlannerBudget(db,dispatch,mock) {
  const {setup,output}=plannerFixture(centralToday());
  const now=new Date().toISOString(),period=now.slice(0,7),old='2020-01-01T00:00:00.000Z';
  async function call(owner,path,method='GET',body) {
    const response=await dispatch('http://localhost'+path,{method,headers:{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':owner+'@example.test','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  }
  async function create(owner){const r=await call(owner,'/api/blocks','POST',{setup,complete:true});assert.equal(r.status,201);return r.data.block;}
  const generate=(owner,b)=>call(owner,'/api/blocks/'+b.id+'/generation','POST',{version:b.version,consent:true,saveImmediately:true});
  const pool=mock.get('https://api.openai.com');
  async function seed(id,amount,status='settled',month=period,started=old) {
    await db.prepare("INSERT INTO training_ai_usage (id,owner_id,block_id,period,started_at,model,pricing_version,status,reserved_microdollars,charged_microdollars) VALUES (?,'accounting-test','deleted-block',?,?,'gpt-6-luna','test',?,?,?)").bind(id,month,started,status,REQUEST_RESERVE_MICRODOLLARS,amount).run();
  }
  // Different accounts competing for the final reservation: exactly one reaches
  // the provider. Rejected attempts leave intake/version/generation untouched.
  await seed('near-cap',MONTHLY_BUDGET_MICRODOLLARS-REQUEST_RESERVE_MICRODOLLARS);
  const a=await create('budget-a'),b=await create('budget-b');
  pool.intercept({path:'/v1/responses',method:'POST'}).reply(200,'broken provider JSON');
  const racing=await Promise.all([generate('budget-a',a),generate('budget-b',b)]);
  assert.deepEqual(racing.map(r=>r.status).sort(),[429,502]);
  const denied=racing.findIndex(r=>r.status===429),deniedBlock=denied===0?a:b;
  assert.equal(racing[denied].data.errorCode,'budget');
  const untouched=await db.prepare('SELECT generation,version FROM training_plans WHERE id=?').bind(deniedBlock.id).first();
  assert.equal(untouched.generation,null);assert.equal(untouched.version,deniedBlock.version);
  const uncertain=await db.prepare("SELECT * FROM training_ai_usage WHERE status='uncertain'").first();
  assert.equal(uncertain.charged_microdollars,REQUEST_RESERVE_MICRODOLLARS);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM workouts').first()).n,0);
  // Deleting a block cannot refund usage or reopen the app-wide budget.
  const winnerOwner=denied===0?'budget-b':'budget-a',winnerBlock=denied===0?b:a;
  const preview=await call(winnerOwner,'/api/blocks/'+winnerBlock.id);
  const deletion=await call(winnerOwner,'/api/blocks/'+winnerBlock.id,'DELETE',{version:preview.data.deletion.version,revision:preview.data.deletion.revision,confirmation:preview.data.deletion.name});
  assert.equal(deletion.status,200,JSON.stringify(deletion.data));
  assert.ok(await db.prepare('SELECT id FROM training_ai_usage WHERE id=?').bind(uncertain.id).first());
  assert.equal((await generate(denied===0?'budget-a':'budget-b',deniedBlock)).data.errorCode,'budget');
  // Outstanding prior-month charges remain counted; settled old charges don't.
  await db.prepare('DELETE FROM training_ai_usage').run();
  await seed('old-unknown',MONTHLY_BUDGET_MICRODOLLARS,'uncertain','2020-01');
  assert.equal((await generate('budget-a',await create('budget-a'))).data.errorCode,'budget');
  await db.prepare("UPDATE training_ai_usage SET status='settled' WHERE id='old-unknown'").run();
  const successful=await create('budget-success');
  pool.intercept({path:'/v1/responses',method:'POST'}).reply(200,responseFixture(output));
  const saved=await generate('budget-success',successful);assert.equal(saved.status,200);
  assert.equal(saved.data.block.generation.status,'accepted');
  const charge=await db.prepare('SELECT * FROM training_ai_usage WHERE id=?').bind(saved.data.block.generation.id).first();
  assert.equal(charge.status,'settled');assert.equal(charge.charged_microdollars,1100);
  assert.equal((await generate('budget-success',successful)).status,200);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM training_ai_usage WHERE owner_id='budget-success'").first()).n,1);
  // No usage is erased by intake edits, and invalid paid output retains tokens.
  const invalid=await create('budget-invalid');
  pool.intercept({path:'/v1/responses',method:'POST'}).reply(200,responseFixture({...output,sessions:[]}));
  const failed=await generate('budget-invalid',invalid);assert.equal(failed.status,502);
  const invalidCharge=await db.prepare('SELECT * FROM training_ai_usage WHERE id=?').bind(failed.data.block.generation.id).first();
  assert.equal(invalidCharge.input_tokens,1000);assert.equal(invalidCharge.charged_microdollars,1100);
  const edited=await call('budget-invalid','/api/blocks/'+invalid.id+'/setup','PUT',{setup,version:failed.data.block.version});assert.equal(edited.status,200);
  assert.ok(await db.prepare('SELECT id FROM training_ai_usage WHERE id=?').bind(invalidCharge.id).first());
  // A failed ledger insert rolls back the block reservation before any API call.
  const rollback=await create('budget-rollback');
  await db.prepare("CREATE TRIGGER test_usage_failure BEFORE INSERT ON training_ai_usage WHEN NEW.owner_id='budget-rollback' BEGIN SELECT RAISE(ABORT,'synthetic usage failure'); END").run();
  assert.equal((await generate('budget-rollback',rollback)).status,500);
  const clean=await db.prepare('SELECT version,generation FROM training_plans WHERE id=?').bind(rollback.id).first();assert.equal(clean.generation,null);assert.equal(clean.version,rollback.version);
  await db.prepare('DROP TRIGGER test_usage_failure').run();
  // Daily attempts survive deletion and fail before any provider call.
  for(let i=0;i<10;i++)await seed('daily-'+i,0,'settled',period,now);
  await db.prepare("UPDATE training_ai_usage SET owner_id='budget-daily' WHERE id LIKE 'daily-%'").run();
  assert.equal((await generate('budget-daily',await create('budget-daily'))).data.errorCode,'daily_limit');
  mock.assertNoPendingInterceptors();
  console.log('PASS: global atomic budget, failed/deleted/intake-edited attempts, month rollover, charged invalid output, idempotent autosave, daily limits and accounting rollback.');
}
