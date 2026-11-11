import { cookies } from 'next/headers';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from '../db/schema';
import type { AppUser } from '../lib/user';
import type { TrainingDatabase } from './database';
import { openSQLite, runSQLite, batchSQLite } from './sqlite.mjs';
import { PROOF_COOKIE, readProofUser, signProofUser, proofReturnPath } from './proof-session.mjs';
import { BETA_SESSION_COOKIE, betaSignInPath, finishBetaSignIn, finishBetaSignOut, getBetaUser, isAwsBeta, startBetaSignIn } from './cognito';

function requireNodeMode() {
  if (!isAwsBeta() && process.env.FORREST_NODE_PROOF !== '1') throw new Error('The standalone Node runtime is disabled.');
}

let database: TrainingDatabase | undefined;

export function getDatabase(): TrainingDatabase {
  requireNodeMode();
  if (!database) {
    const filename = process.env.FORREST_SQLITE_PATH;
    if (!filename) throw new Error('Choose a separate SQLite file for this Node deployment.');
    const connection = openSQLite(filename);
    database = drizzle(
      async (sql, params, method) => runSQLite(connection, { sql, params, method }),
      async queries => batchSQLite(connection, queries),
      { schema },
    );
  }
  return database;
}

export function getRuntimeVariables(): Record<string, string | undefined> {
  requireNodeMode();
  return { TRAINING_PLANNER_MODE: 'simulation' };
}

export async function getAuthenticatedUser(): Promise<AppUser | null> {
  requireNodeMode();
  const requestCookies = await cookies();
  if (isAwsBeta()) return getBetaUser(requestCookies.get(BETA_SESSION_COOKIE)?.value);
  return readProofUser(requestCookies.get(PROOF_COOKIE)?.value, process.env.FORREST_PROOF_SESSION_SECRET);
}

export function signInPath(returnTo: string) {
  if (isAwsBeta()) return betaSignInPath(returnTo);
  return '/node-proof-login?return_to=' + encodeURIComponent(proofReturnPath(returnTo));
}

export function signInLabel() {
  return isAwsBeta() ? 'Sign in with Google' : 'Open local proof accounts';
}

export function signOutPath() {
  return isAwsBeta() ? '/auth/sign-out' : null;
}

export async function handleBetaSignIn(request: Request) {
  return isAwsBeta() ? startBetaSignIn(request) : new Response('Not found.', { status: 404 });
}

export async function handleBetaCallback(request: Request) {
  return isAwsBeta() ? finishBetaSignIn(request) : new Response('Not found.', { status: 404 });
}

export async function handleBetaSignOut(request: Request) {
  return isAwsBeta() ? finishBetaSignOut(request) : new Response('Not found.', { status: 404 });
}

export async function handleLocalSignIn(request: Request): Promise<Response> {
  if (isAwsBeta() || process.env.FORREST_NODE_PROOF !== '1') return new Response('Not found.', { status: 404 });
  const url = new URL(request.url);
  const origin = new URL('http://' + request.headers.get('host'));
  if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) return new Response('Local proof only.', { status: 403 });
  if (request.method === 'GET') {
    return new Response(`<!doctype html><html lang="en"><title>Forrest Runs local proof</title>
      <main><h1>Local compatibility proof</h1><p>Choose a synthetic runner to test separate training accounts.</p>
      <form method="post"><button name="runner" value="a">Runner A</button>
      <button name="runner" value="b">Runner B</button></form></main></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  if (request.headers.get('origin') !== origin.origin) return new Response('Origin unavailable.', { status: 403 });
  const runner = (await request.formData()).get('runner');
  if (runner !== 'a' && runner !== 'b') return new Response('Choose a proof runner.', { status: 400 });
  const user: AppUser = { userId: 'node-proof-' + runner, email: `runner-${runner}@example.test`, displayName: 'Runner ' + runner.toUpperCase(), fullName: 'Runner ' + runner.toUpperCase() };
  const token = signProofUser(user, process.env.FORREST_PROOF_SESSION_SECRET);
  return new Response(null, { status: 303, headers: {
    Location: proofReturnPath(url.searchParams.get('return_to')),
    'Set-Cookie': `${PROOF_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`,
    'Cache-Control': 'no-store',
  } });
}
