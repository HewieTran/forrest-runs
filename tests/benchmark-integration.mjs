import assert from 'node:assert/strict';
import { centralToday, addDays } from '../lib/domain.ts';
import { currentPlannerFixture } from './planner-fixture.mjs';

export async function testBenchmark(db,dispatch) {
  const today=centralToday(),{setup}=currentPlannerFixture(today);
  const owner={'oai-authenticated-user-id':'benchmark-owner','oai-authenticated-user-email':'benchmark@example.test','Content-Type':'application/json'};
  async function call(path,method,body,headers=owner){const r=await dispatch('http://localhost'+path,{method,headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
  for(const distance of ['5k','10k','half']) {
    const partial=structuredClone(setup);partial.benchmark.distance=distance;partial.benchmark.effortConfirmed=false;
    const created=await call('/api/blocks','POST',{setup:partial,complete:false});assert.equal(created.status,201);
    const block=created.data.block,path='/api/blocks/'+block.id;
    const loaded=await call(path+'/setup','GET');assert.deepEqual(loaded.data.block.setup.benchmark,partial.benchmark);
    const rejected=await call(path+'/setup','PUT',{setup:partial,version:block.version,complete:true});assert.equal(rejected.status,400);assert.ok(rejected.data.issues.some(i=>i.field==='benchmarkEffort'));
    const failed=await call(path+'/generation','POST',{version:block.version,consent:true,saveImmediately:true});assert.equal(failed.status,400);
    assert.equal((await db.prepare('SELECT generation FROM training_plans WHERE id=?').bind(block.id).first()).generation,null);
    partial.benchmark.effortConfirmed=true;
    const saved=await call(path+'/setup','PUT',{setup:partial,version:block.version,complete:true});assert.equal(saved.status,200);
    assert.deepEqual((await call(path+'/setup','GET')).data.block.setup.benchmark,partial.benchmark);
    assert.equal((await call(path+'/setup','PUT',{setup:partial,version:block.version,complete:true})).status,409);
    assert.equal((await call(path+'/setup','PUT',{setup:partial,version:saved.data.block.version,complete:true},{...owner,'oai-authenticated-user-id':'benchmark-other'})).status,404);
  }
  const future=structuredClone(setup);future.benchmark.date=addDays(today,1);
  assert.equal((await call('/api/blocks','POST',{setup:future,complete:false})).status,400);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM training_ai_usage WHERE owner_id='benchmark-owner'").first()).n,0);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM workouts w JOIN training_plans p ON p.id=w.plan_id WHERE p.owner_id='benchmark-owner'").first()).n,0);
  console.log('PASS: all benchmark distances save/reload, unconfirmed drafts never generate or charge, invalid future dates, ownership and stale saves.');
}
