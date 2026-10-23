import assert from 'node:assert/strict';

export async function testLifecycle(db, dispatch) {
  const auth = { 'oai-authenticated-user-id': 'lifecycle-owner', 'oai-authenticated-user-email': 'lifecycle@example.test' };
  const foreign = { 'oai-authenticated-user-id': 'lifecycle-foreign', 'oai-authenticated-user-email': 'foreign@example.test' };
  async function call(path, method = 'GET', body, headers = auth) {
    const response = await dispatch('http://localhost' + path, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  const starter = (await call('/api/training')).data.plan;
  // Follow the library's real link: legacy block IDs contain a colon, unlike new UUIDs.
  const originalLibrary = await dispatch('http://localhost/blocks', { headers: auth });
  const originalLibraryHtml = await originalLibrary.text();
  const continuePath = originalLibraryHtml.match(/href="([^"]+)"[^>]*>Continue training/)?.[1];
  assert.equal(continuePath, '/blocks/' + encodeURIComponent(starter.id));
  const originalDetail = await dispatch('http://localhost' + continuePath, { headers: auth });
  const originalDetailHtml = await originalDetail.text();
  assert.match(originalDetailHtml, /aria-label="Weekly workout tracker"/, 'The Continue training link must render the legacy block tracker, including when a streamed 404 returns HTTP 200.');
  const originalForeign = await dispatch('http://localhost' + continuePath, { headers: foreign });
  const originalForeignHtml = await originalForeign.text();
  assert.ok(originalForeignHtml.includes('Block unavailable.'));
  assert.ok(!originalForeignHtml.includes('aria-label="Weekly workout tracker"'));
  console.log('PASS: the library Continue training link opens the original colon-containing block ID and still rejects another account.');
  const create = name => call('/api/blocks', 'POST', { raceName: name, raceDate: '2027-03-14', status: 'active', ownerId: 'lifecycle-foreign', id: 'spoof', version: 999 });
  const result = await create('  Spring 10K  ');
  assert.equal(result.status, 201);
  const draft = result.data.block;
  assert.equal(draft.raceName, 'Spring 10K');
  assert.equal(draft.status, 'draft');
  assert.equal(draft.version, 1);
  assert.notEqual(draft.id, 'spoof');
  assert.equal('ownerId' in draft, false);
  assert.equal((await call('/api/training')).data.plan.id, starter.id);
  assert.equal((await call('/api/blocks', 'POST', {}, {})).status, 401);
  assert.equal((await call('/api/blocks', 'POST', { raceName: 'Bad date', raceDate: '2027-02-30' })).status, 400);
  const statusUrl = id => '/api/blocks/' + encodeURIComponent(id);
  const change = (block, status, headers = auth) => call(statusUrl(block.id), 'PATCH', { status, version: block.version }, headers);
  assert.equal((await change(draft, 'active', {})).status, 401);
  assert.equal((await change(draft, 'active', foreign)).status, 404);
  assert.equal((await call('/api/blocks/missing', 'PATCH', { status: 'active', version: 1 })).status, 404);
  assert.equal((await change(draft, 'completed')).status, 409);
  assert.equal((await change(draft, 'deleted')).status, 400);
  assert.equal((await change(draft, 'active')).status, 409);
  assert.equal((await call('/api/training')).data.plan.id, starter.id);
  console.log('PASS: draft creation, spoofed fields, status validation, ownership, and protection of the current active block.');

  const workout = { date: '2026-10-23', phase: 'Base Build', type: 'Easy Run', plannedWorkout: 'Easy running', targetPace: 'Conversational', done: true, actualDistance: null, actualPace: '', effort: null, pain: '', notes: 'Retain this result', version: 1 };
  for (const values of [{}, { actualDistance: 0 }, { actualDistance: 5 }, { actualDistance: 99, type: 'Strength' }, { actualDistance: 99, done: false }]) {
    assert.equal((await call('/api/workouts?blockId=' + encodeURIComponent(draft.id), 'POST', { ...workout, ...values })).status, 201);
  }
  const before = (await db.prepare('SELECT * FROM workouts WHERE plan_id = ? ORDER BY id').bind(draft.id).all()).results;
  const library = await call('/api/blocks');
  const summary = library.data.blocks.find(block => block.id === draft.id);
  assert.deepEqual([summary.workoutCount, summary.completedCount, summary.recordedMiles, summary.firstWorkoutDate, summary.lastWorkoutDate], [5, 4, 5, '2026-10-23', '2026-10-23']);
  assert.ok(library.data.blocks.every(block => !('ownerId' in block) && !('notes' in block)));
  assert.equal(library.headers.get('cache-control'), 'private, no-store');
  assert.equal((await change(starter, 'completed')).status, 200);
  const second = (await create('Second draft')).data.block;
  const competing = await Promise.all([change(draft, 'active'), change(second, 'active')]);
  assert.deepEqual(competing.map(r => r.status).sort(), [200, 409]);
  let winner = competing.find(r => r.status === 200).data.block;
  assert.equal((await db.prepare("SELECT count(*) AS count FROM training_plans WHERE owner_id = 'lifecycle-owner' AND status = 'active'").first()).count, 1);
  assert.equal((await change({ ...winner, version: winner.version - 1 }, 'completed')).status, 409);
  const raceSettings = { raceName: winner.raceName, raceDate: winner.raceDate, version: winner.version - 1 };
  assert.equal((await call('/api/training?blockId=' + encodeURIComponent(winner.id), 'PATCH', raceSettings)).status, 409);
  winner = (await change(winner, 'completed')).data.block;
  assert.equal(winner.status, 'completed');
  winner = (await change(winner, 'archived')).data.block;
  assert.equal(winner.status, 'archived');
  assert.equal((await change(winner, 'active')).status, 409);
  winner = (await change(winner, 'draft')).data.block;
  assert.equal(winner.status, 'draft');
  const draftNow = (await call('/api/training?blockId=' + encodeURIComponent(draft.id))).data;
  // Exercise archival of the populated block too, regardless of which activation won.
  const archived = (await change(draftNow.plan, 'archived')).data.block;
  assert.equal(archived.status, 'archived');
  const after = (await db.prepare('SELECT * FROM workouts WHERE plan_id = ? ORDER BY id').bind(draft.id).all()).results;
  assert.deepEqual(after, before);
  const archiveExport = await call('/api/export');
  assert.ok(archiveExport.data.blocks.find(block => block.id === draft.id && block.status === 'archived'));
  assert.equal(archiveExport.data.workouts.filter(workout => workout.planId === draft.id).length, 5);
  assert.equal((await dispatch('http://localhost/api/blocks/' + encodeURIComponent(draft.id), { method: 'DELETE', headers: auth })).status, 405);
  console.log('PASS: exact summary calculations, competing activations, stale versions, lifecycle transitions, and untouched archived workout records.');

  const page = await dispatch('http://localhost/blocks', { headers: auth });
  assert.equal(page.status, 200);
  const pageText = await page.text();
  assert.match(pageText, /Training blocks/);
  assert.match(pageText, /Spring 10K/);
  const detail = await dispatch('http://localhost/blocks/' + encodeURIComponent(draft.id), { headers: auth });
  assert.equal(detail.status, 200);
  assert.match(await detail.text(), /aria-label="Weekly workout tracker"/);
  // Decode a page segment once, including literal percent escapes and other delimiters.
  // Double decoding must not alias a different stored ID.
  for (const id of ['reserved:literal%3A', 'reserved:literal%25', 'reserved:space and +?/#é']) {
    await db.prepare(`INSERT INTO training_plans
      (id,owner_id,status,race_name,race_date,pace_guide,created_at,updated_at)
      VALUES (?,'lifecycle-owner','draft','Encoded ID example','2027-05-01','[]','2026-10-23T00:00:00.000Z','2026-10-23T00:00:00.000Z')`).bind(id).run();
    const encoded = await dispatch('http://localhost/blocks/' + encodeURIComponent(id), { headers: auth });
    assert.ok((await encoded.text()).includes('aria-label="Weekly workout tracker"'), `Stored ID must round-trip: ${id}`);
    const foreignEncoded = await dispatch('http://localhost/blocks/' + encodeURIComponent(id), { headers: foreign });
    assert.ok((await foreignEncoded.text()).includes('Block unavailable.'));
  }
  const privatePage = await dispatch('http://localhost/blocks/' + encodeURIComponent(draft.id), { headers: foreign });
  assert.equal(privatePage.status, 404);
  const home = await dispatch('http://localhost/', { headers: auth });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Training blocks/);
  const firstPost = { 'oai-authenticated-user-id': 'first-post-owner', 'oai-authenticated-user-email': 'test-runner@example.test' };
  const first = await call('/api/blocks', 'POST', { raceName: 'Next goal', raceDate: '2027-05-01' }, firstPost);
  assert.equal(first.status, 201);
  assert.equal((await call('/api/training', 'GET', undefined, firstPost)).data.workouts.length, 158);
  assert.equal((await call('/api/blocks', 'GET', undefined, firstPost)).data.blocks.length, 2);
  console.log('PASS: library/detail pages, foreign-block 404, home navigation, and preservation of the initial import when creating a first draft.');
}
