import assert from 'node:assert/strict';
import { normalizeTrainingBackup } from '../lib/backups.ts';

// Shared acceptance checks run against both production Node and disposable Worker handlers.
export async function testProfile(dispatch, aHeaders, bHeaders) {
  const call = async (headers, route = '/api/profile', method = 'GET', body) => {
    const response = await dispatch('http://localhost' + route, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await call({})).status, 401);
  assert.equal((await call({}, '/api/profile', 'PATCH', {})).status, 401);
  const initial = await call(aHeaders);
  assert.equal(initial.status, 200); assert.equal(initial.data.account.profile, null);
  const automatic = initial.data.account.automaticColor, fallback = initial.data.account.greetingName;
  let version = 0;
  const save = async (firstName, lastName, avatarColor = null) => {
    const response = await call(aHeaders, '/api/profile', 'PATCH', { firstName, lastName, avatarColor, version });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    version++; assert.equal(response.data.account.profile.version, version); return response.data.account;
  };
  let saved = await save('Hieu', '', 2);
  assert.equal(saved.greetingName, 'Hieu'); assert.equal(saved.initial, 'H');
  assert.equal(saved.profile.lastName, null); assert.equal(saved.profile.avatarColor, 2);
  const stale = await call(aHeaders, '/api/profile', 'PATCH', { firstName: 'Stale', lastName: '', avatarColor: null, version: 0 });
  assert.equal(stale.status, 409);
  for (const invalid of [{ ownerId: 'profile-b' }, { firstName: 'x'.repeat(81) }, { avatarColor: 8 }, { version: -1 }]) {
    assert.equal((await call(aHeaders, '/api/profile', 'PATCH', { firstName: 'Not saved', lastName: '', avatarColor: null, version, ...invalid })).status, 400);
  }
  assert.deepEqual((await call(aHeaders)).data.account, saved);
  assert.equal((await call(bHeaders)).data.account.profile, null);
  const other = await call(bHeaders, '/api/profile', 'PATCH', { firstName: 'Other', lastName: '', avatarColor: 5, version: 0 });
  assert.equal(other.status, 200);
  assert.deepEqual((await call(aHeaders)).data.account, saved);
  saved = await save('', 'Van Tran'); assert.equal(saved.greetingName, 'Van Tran'); assert.equal(saved.initial, 'V');
  saved = await save('Hiếu', 'Tran'); assert.equal(saved.greetingName, 'Hiếu'); assert.equal(saved.initial, 'H');
  saved = await save('', ''); assert.equal(saved.greetingName, fallback); assert.equal(saved.profile.avatarColor, null); assert.equal(saved.automaticColor, automatic);
  saved = await save('Casey', 'Runner', 3);
  const page = await dispatch('http://localhost/blocks', { headers: aHeaders });
  assert.equal(page.status, 200);
  const html = (await page.text()).replaceAll('<!-- -->', '');
  assert.match(html, /Welcome back, Casey/);
  assert.match(html, /title="Casey Runner"/);
  assert.doesNotMatch(html, /Export backup|href="\/api\/export"/);
  assert.match(html, /Edit profile/);
  const backup = (await call(aHeaders, '/api/export')).data;
  assert.equal(backup.schemaVersion, 8); assert.deepEqual(backup.profile, saved.profile);
  assert.deepEqual(normalizeTrainingBackup(backup), backup);
  assert.equal('ownerId' in backup.profile, false);
  assert.notDeepEqual((await call(bHeaders, '/api/export')).data.profile, saved.profile);
  console.log('PASS: profiles authenticate, isolate owners, persist all name/color rules, reject stale/invalid updates, render SSR fallback and preserve portable backups with export hidden.');
  return saved;
}
