import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import type { AppUser } from '../lib/user';

export const BETA_SESSION_COOKIE = '__Host-forrest-beta';
const LOGIN_COOKIE = '__Host-forrest-beta-login';
const CALLBACK_PATH = '/auth/callback';
const LOGIN_LIFETIME = 10 * 60;
const SESSION_LIFETIME = 60 * 60;
const COOKIE_ATTRIBUTES = 'Path=/; Secure; HttpOnly; SameSite=Lax';

export function isAwsBeta() {
  return process.env.FORREST_AWS_BETA === '1';
}

function config() {
  const origin = process.env.FORREST_BETA_ORIGIN;
  const domain = process.env.FORREST_COGNITO_DOMAIN;
  const issuer = process.env.FORREST_COGNITO_ISSUER;
  const clientId = process.env.FORREST_COGNITO_CLIENT_ID;
  const clientSecret = process.env.FORREST_COGNITO_CLIENT_SECRET;
  const sessionSecret = process.env.FORREST_BETA_SESSION_SECRET;
  const allowedEmails = new Set((process.env.FORREST_BETA_ALLOWED_EMAILS ?? '')
    .split(',').map(email => email.trim().toLowerCase()).filter(Boolean));
  if (!origin || !domain || !issuer || !clientId || !clientSecret ||
      !sessionSecret || sessionSecret.length < 32 || !allowedEmails.size) return null;
  try {
    const publicOrigin = new URL(origin);
    const cognitoDomain = new URL(domain);
    const tokenIssuer = new URL(issuer);
    if (publicOrigin.protocol !== 'https:' || cognitoDomain.protocol !== 'https:' ||
        tokenIssuer.protocol !== 'https:' || tokenIssuer.username || tokenIssuer.password ||
        tokenIssuer.search || tokenIssuer.hash) return null;
    return {
      origin: publicOrigin.origin, domain: cognitoDomain.origin, issuer: tokenIssuer.href.replace(/\/$/, ''),
      clientId, clientSecret, allowedEmails, key: new TextEncoder().encode(sessionSecret),
      callback: new URL(CALLBACK_PATH, publicOrigin).href,
    };
  } catch {
    return null;
  }
}

function returnPath(value: unknown, origin: string) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, origin);
    if (url.origin === origin && !url.pathname.startsWith('/auth/')) return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
  return '/';
}

function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; ${COOKIE_ATTRIBUTES}; Max-Age=${maxAge}`;
}

function loginCookie(request: Request) {
  const prefix = `${LOGIN_COOKIE}=`;
  return request.headers.get('cookie')?.split(/;\s*/).find(part => part.startsWith(prefix))?.slice(prefix.length);
}

function redirect(location: string, ...cookies: string[]) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}

function signInError(message: string, status: number) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Forrest Runs sign-in</title><main><h1>${message}</h1><p><a href="/">Back to Forrest Runs</a></p></main></html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'Set-Cookie': cookie(LOGIN_COOKIE, '', 0),
    },
  });
}

export function betaSignInPath(returnTo: string) {
  return '/auth/sign-in?return_to=' + encodeURIComponent(returnTo);
}

export async function startBetaSignIn(request: Request) {
  const settings = config();
  if (!settings) return signInError('Sign-in is currently unavailable.', 503);
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const returnTo = returnPath(new URL(request.url).searchParams.get('return_to'), settings.origin);
  const transaction = await new SignJWT({ state, nonce, verifier, returnTo }).setProtectedHeader({ alg: 'HS256' })
    .setAudience(`login:${settings.clientId}`).setExpirationTime(`${LOGIN_LIFETIME}s`).sign(settings.key);
  const url = new URL('/oauth2/authorize', settings.domain);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: settings.clientId, redirect_uri: settings.callback,
    scope: 'openid email profile', identity_provider: 'Google', state, nonce,
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  }).toString();
  return redirect(url.href, cookie(LOGIN_COOKIE, transaction, LOGIN_LIFETIME));
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function cognitoKeys(issuer: string) {
  let keys = keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { timeoutDuration: 8000 });
    keySets.set(issuer, keys);
  }
  return keys;
}

export async function finishBetaSignIn(request: Request) {
  const settings = config();
  if (!settings) return signInError('Sign-in is currently unavailable.', 503);
  const parameters = new URL(request.url).searchParams;
  const pending = loginCookie(request);
  const { payload: transaction } = pending ? await jwtVerify(pending, settings.key, {
    audience: `login:${settings.clientId}`, algorithms: ['HS256'], requiredClaims: ['exp'],
  }).catch(() => ({ payload: null })) : { payload: null };
  if (typeof transaction?.state !== 'string' || transaction.state !== parameters.get('state') ||
      typeof transaction.nonce !== 'string' || typeof transaction.verifier !== 'string') {
    return signInError('This sign-in attempt expired. Please try again.', 400);
  }
  const code = parameters.get('code');
  if (!code || parameters.has('error')) return signInError('Google sign-in could not finish. Please try again.', 400);

  try {
    const credentials = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64');
    const response = await fetch(new URL('/oauth2/token', settings.domain), {
      method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${credentials}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: settings.callback,
        code_verifier: transaction.verifier }),
    });
    if (!response.ok) throw new Error('Cognito token exchange failed');
    const { id_token: idToken } = await response.json() as { id_token?: unknown };
    if (typeof idToken !== 'string') throw new Error('Cognito ID token is missing');
    const { payload } = await jwtVerify(idToken, cognitoKeys(settings.issuer), {
      issuer: settings.issuer, audience: settings.clientId, algorithms: ['RS256'], requiredClaims: ['sub', 'exp'],
    });
    if (payload.token_use !== 'id' || payload.nonce !== transaction.nonce || !payload.sub || typeof payload.exp !== 'number' ||
        payload.email_verified !== true || typeof payload.email !== 'string' ||
        !Array.isArray(payload.identities) || !payload.identities.some(identity => identity?.providerName === 'Google')) {
      return signInError('We could not verify this Google account.', 403);
    }
    if (!settings.allowedEmails.has(payload.email.toLowerCase())) {
      return signInError('This Google account is not approved for the Forrest Runs beta.', 403);
    }
    const now = Math.floor(Date.now() / 1000);
    const expires = Math.min(payload.exp, now + SESSION_LIFETIME);
    if (expires <= now) return signInError('This sign-in attempt expired. Please try again.', 400);
    const session = await new SignJWT({ email: payload.email, name: typeof payload.name === 'string' ? payload.name : null })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(payload.sub).setIssuer(settings.issuer)
      .setAudience(`session:${settings.clientId}`).setExpirationTime(expires).sign(settings.key);
    return redirect(new URL(returnPath(transaction.returnTo, settings.origin), settings.origin).href,
      cookie(LOGIN_COOKIE, '', 0), cookie(BETA_SESSION_COOKIE, session, expires - now));
  } catch {
    return signInError('Google sign-in could not finish. Please try again.', 502);
  }
}

export async function getBetaUser(value: string | undefined): Promise<AppUser | null> {
  const settings = config();
  if (!settings || !value) return null;
  try {
    const { payload } = await jwtVerify(value, settings.key, {
      issuer: settings.issuer, audience: `session:${settings.clientId}`, algorithms: ['HS256'], requiredClaims: ['sub', 'exp'],
    });
    if (!payload.sub || typeof payload.email !== 'string' || !settings.allowedEmails.has(payload.email.toLowerCase())) return null;
    const fullName = typeof payload.name === 'string' ? payload.name : null;
    return { userId: `cognito:${payload.sub}`, email: payload.email, fullName, displayName: fullName || payload.email };
  } catch {
    return null;
  }
}

export async function finishBetaSignOut(request: Request) {
  const settings = config();
  if (!settings || request.headers.get('origin') !== settings.origin) return new Response('Forbidden.', { status: 403 });
  const url = new URL('/logout', settings.domain);
  url.search = new URLSearchParams({ client_id: settings.clientId, logout_uri: `${settings.origin}/` }).toString();
  return redirect(url.href, cookie(BETA_SESSION_COOKIE, '', 0), cookie(LOGIN_COOKIE, '', 0));
}
