import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
const kid = 'cognito-fixture-key';
const jwk = { ...await exportJWK(publicKey), kid, alg: 'RS256', use: 'sig' };
const domain = process.env.FORREST_COGNITO_DOMAIN;
const issuer = process.env.FORREST_COGNITO_ISSUER;
const client = process.env.FORREST_COGNITO_CLIENT_ID;
const secret = process.env.FORREST_COGNITO_CLIENT_SECRET;
const callback = `${process.env.FORREST_BETA_ORIGIN}/auth/callback`;
const fetchFromNetwork = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === `${issuer}/.well-known/jwks.json`) return Response.json({ keys: [jwk] });
  if (url !== `${domain}/oauth2/token`) return fetchFromNetwork(input, init);

  const form = new URLSearchParams(init.body);
  const claim = JSON.parse(Buffer.from(form.get('code'), 'base64url'));
  const auth = Buffer.from(`${client}:${secret}`).toString('base64');
  assert.equal(new Headers(init.headers).get('authorization'), `Basic ${auth}`);
  assert.equal(form.get('grant_type'), 'authorization_code');
  assert.equal(form.get('redirect_uri'), callback);
  assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'), claim.challenge);
  const token = await new SignJWT({
    token_use: 'id', nonce: claim.nonce, email: claim.email, name: claim.name,
    email_verified: claim.verified ?? true, identities: [{ providerName: claim.provider ?? 'Google' }],
  }).setProtectedHeader({ alg: 'RS256', kid }).setSubject(claim.sub).setIssuer(issuer)
    .setAudience(client).setExpirationTime(claim.expires ?? '1h').sign(privateKey);
  return Response.json({ id_token: token });
};
