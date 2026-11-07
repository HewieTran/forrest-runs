import { createHmac, timingSafeEqual } from 'node:crypto';

export const PROOF_COOKIE = 'forrest-node-proof';

export function proofReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, 'http://localhost');
    return url.origin === 'http://localhost' && url.pathname !== '/node-proof-login' ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
}

export function signProofUser(user, secret) {
  if (!secret || secret.length < 32) throw new Error('A local proof session secret is required.');
  const payload = Buffer.from(JSON.stringify({ user, expires: Date.now() + 3600000 })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + signature;
}

export function readProofUser(cookie, secret) {
  if (!secret || secret.length < 32 || !cookie) return null;
  const parts = cookie.split('.');
  if (parts.length !== 2) return null;
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  const signature = Buffer.from(parts[1], 'base64url');
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
  try {
    const { user, expires } = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (!Number.isFinite(expires) || expires <= Date.now() ||
      typeof user?.userId !== 'string' || !user.userId ||
      typeof user.email !== 'string' || typeof user.displayName !== 'string' ||
      (user.fullName !== null && typeof user.fullName !== 'string')) return null;
    return user;
  } catch {
    return null;
  }
}
