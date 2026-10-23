import assert from 'node:assert/strict';

export async function testProgress(db, dispatch) {
  const auth={'oai-authenticated-user-id':'lifecycle-owner','oai-authenticated-user-email':'lifecycle@example.test'};
  const foreign={'oai-authenticated-user-id':'progress-foreign','oai-authenticated-user-email':'progress-foreign@example.test'};
  const before=(await db.prepare('SELECT * FROM workouts ORDER BY id').all()).results;
  const blocks=(await db.prepare("SELECT id,race_name FROM training_plans WHERE owner_id='lifecycle-owner' ORDER BY id").all()).results;
  for(const block of blocks){
    const route='/blocks/'+encodeURIComponent(block.id)+'/progress';
    const response=await dispatch('http://localhost'+route,{headers:auth});
    const html=await response.text();
    assert.equal(response.status,200);
    assert.ok(html.includes('aria-label="Progress overview"'),`Progress page renders encoded ID ${block.id}`);
    assert.ok(html.includes(block.race_name));
    assert.ok(html.includes('Selected block only'));
    const other=await dispatch('http://localhost'+route,{headers:foreign});
    const hidden=await other.text();
    assert.ok(!hidden.includes('aria-label="Progress overview"'));
    assert.ok(hidden.includes('Block unavailable.'));
  }
  const privateRoute='/blocks/'+encodeURIComponent(blocks[0].id)+'/progress';
  const anonymous=await dispatch('http://localhost'+privateRoute);
  const anonymousHtml=await anonymous.text();
  assert.ok(!anonymousHtml.includes('aria-label="Progress overview"'));
  assert.ok(anonymous.status>=300 && anonymous.status<400 || anonymousHtml.includes('signin-with-chatgpt'));
  const missing=await dispatch('http://localhost/blocks/missing/progress',{headers:auth});
  assert.ok(!(await missing.text()).includes('aria-label="Progress overview"'));
  assert.deepEqual((await db.prepare('SELECT * FROM workouts ORDER BY id').all()).results,before);
  console.log('PASS: progress renders owned/encoded blocks, rejects foreign/anonymous/missing blocks, and never changes workout records.');
}
