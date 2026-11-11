import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const directory = mkdtempSync(path.join(tmpdir(), 'forrest-cognito-test-'));
const probe = createServer().listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const publicOrigin = 'https://forrest.example.test';
const domain = 'https://login.example.test';
const app = spawn(process.execPath, ['scripts/node-proof.mjs', 'start'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_OPTIONS: '--import ./tests/cognito-fixture.mjs',
    FORREST_AWS_BETA: '1', FORREST_PROOF_PORT: String(port),
    FORREST_SQLITE_PATH: path.join(directory, 'beta.sqlite'),
    FORREST_BETA_ORIGIN: publicOrigin,
    FORREST_COGNITO_DOMAIN: domain,
    FORREST_COGNITO_ISSUER: 'https://issuer.example.test/pool',
    FORREST_COGNITO_CLIENT_ID: 'fixture-client', FORREST_COGNITO_CLIENT_SECRET: 'fixture-client-secret',
    FORREST_BETA_SESSION_SECRET: 'test-only-signing-key-0123456789abcdef',
    FORREST_BETA_ALLOWED_EMAILS: 'runner-a@example.test, runner-b@example.test',
  },
});
let log = '';
for (const stream of [app.stdout, app.stderr]) stream.on('data', chunk => { log = (log + chunk).slice(-12000); });

function request(route, options = {}) {
  return fetch(base + route, { redirect: 'manual', signal: AbortSignal.timeout(12000), ...options });
}

async function callback(claim, { validState = true, returnTo = '/blocks' } = {}) {
  const start = await request(`/auth/sign-in?${new URLSearchParams({ return_to: returnTo })}`);
  assert.equal(start.status, 303);
  const pending = start.headers.getSetCookie()[0];
  assert.match(pending, /^__Host-forrest-beta-login=/);
  for (const flag of ['Secure', 'HttpOnly', 'SameSite=Lax']) assert.ok(pending.includes(flag));
  const authorize = new URL(start.headers.get('location'));
  assert.equal(authorize.origin, domain);
  assert.equal(authorize.searchParams.get('identity_provider'), 'Google');
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorize.searchParams.get('redirect_uri'), `${publicOrigin}/auth/callback`);
  const code = Buffer.from(JSON.stringify({
    nonce: authorize.searchParams.get('nonce'), challenge: authorize.searchParams.get('code_challenge'), ...claim,
  })).toString('base64url');
  const state = validState ? authorize.searchParams.get('state') : 'invalid-state';
  return request(`/auth/callback?${new URLSearchParams({ code, state })}`, { headers: { Cookie: pending.split(';')[0] } });
}

function sessionCookie(response, redirectPath = '/blocks') {
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), publicOrigin + redirectPath);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.some(cookie => cookie.startsWith('__Host-forrest-beta-login=;') && cookie.includes('Max-Age=0')));
  const session = cookies.find(cookie => cookie.startsWith('__Host-forrest-beta='));
  assert.ok(session);
  for (const flag of ['Secure', 'HttpOnly', 'SameSite=Lax']) assert.ok(session.includes(flag));
  return session.split(';')[0];
}

try {
  const deadline = Date.now() + 30000;
  let home;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) throw Error(log);
    try { home = await request('/'); break; } catch { await sleep(100); }
  }
  assert.ok(home, 'The beta did not start.');
  assert.match(await home.text(), /Sign in with Google/);
  assert.equal((await request('/node-proof-login')).status, 404);
  assert.equal((await request('/api/blocks')).status, 401);
  const a = { sub: 'subject-a', email: 'Runner-A@example.test', name: 'Runner A' };
  const b = { sub: 'subject-b', email: 'runner-b@example.test', name: 'Runner B' };
  assert.equal((await callback(a, { validState: false })).status, 400);
  assert.equal((await callback({ ...a, nonce: 'wrong-nonce' })).status, 403);
  assert.equal((await callback({ ...a, verified: false })).status, 403);
  assert.equal((await callback({ ...a, provider: 'Other' })).status, 403);
  assert.equal((await callback({ ...a, email: 'not-approved@example.test' })).status, 403);
  assert.equal((await callback({ ...a, expires: Math.floor(Date.now() / 1000) - 60 })).status, 502);
  const aCookie = sessionCookie(await callback(a, { returnTo: '/\\untrusted.example.test' }), '/');
  const bCookie = sessionCookie(await callback(b));
  assert.equal((await request('/api/blocks', { headers: { Cookie: `${aCookie}tampered` } })).status, 401);
  assert.deepEqual((await (await request('/api/blocks', { headers: { Cookie: bCookie } })).json()).blocks, []);
  const page = await request('/blocks', { headers: { Cookie: aCookie } });
  assert.match(await page.text(), /Sign out/);

  const created = await request('/api/blocks', {
    method: 'POST', headers: { Cookie: aCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raceName: 'Cognito account isolation', raceDate: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10) }),
  });
  assert.equal(created.status, 201);
  const { block } = await created.json();
  assert.equal((await request(`/api/training?blockId=${block.id}`, { headers: { Cookie: aCookie } })).status, 200);
  assert.equal((await request(`/api/training?blockId=${block.id}`, { headers: { Cookie: bCookie } })).status, 404);

  assert.equal((await request('/auth/sign-out', { method: 'POST', headers: { Origin: 'https://other.example.test', Cookie: aCookie } })).status, 403);
  const signedOut = await request('/auth/sign-out', { method: 'POST', headers: { Origin: publicOrigin, Cookie: aCookie } });
  assert.equal(signedOut.status, 303);
  const logout = new URL(signedOut.headers.get('location'));
  assert.equal(logout.origin + logout.pathname, `${domain}/logout`);
  assert.equal(logout.searchParams.get('logout_uri'), `${publicOrigin}/`);
  assert.ok(signedOut.headers.getSetCookie().some(cookie => cookie.startsWith('__Host-forrest-beta=;') && cookie.includes('Max-Age=0')));
  assert.equal((await request('/api/blocks')).status, 401);
  console.log('PASS: Cognito callback, account approval, session cookies, account isolation and sign-out.');
} catch (error) {
  console.error(log);
  throw error;
} finally {
  if (app.exitCode === null) {
    const exit = once(app, 'exit');
    app.kill('SIGTERM');
    const force = setTimeout(() => app.kill('SIGKILL'), 5000);
    await exit;
    clearTimeout(force);
  }
  rmSync(directory, { recursive: true, force: true });
}
