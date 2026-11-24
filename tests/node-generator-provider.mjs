// Test-only transport, loaded into a disposable Node process. No outbound calls.
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const nativeTimeout = AbortSignal.timeout;
AbortSignal.timeout = milliseconds => {
  assert.equal(milliseconds, 110000, 'AWS provider deadline leaves CloudFront response overhead');
  return nativeTimeout(milliseconds);
};

globalThis.fetch = async (input, init) => {
  assert.equal(String(input), 'https://api.openai.com/v1/responses');
  assert.equal(new Headers(init.headers).get('authorization'), 'Bearer synthetic-generator-key');
  const request = JSON.parse(init.body);
  assert.equal(request.model, 'gpt-6-luna');
  assert.equal(request.store, false);
  assert.equal(request.reasoning.effort, 'low');
  assert.equal(request.tools, undefined);
  appendFileSync(process.env.FORREST_TEST_CALLS, JSON.stringify({ model: request.model }) + '\n');
  const filename = process.env.FORREST_TEST_RESPONSES;
  const queue = JSON.parse(readFileSync(filename, 'utf8'));
  const reply = queue.shift();
  writeFileSync(filename, JSON.stringify(queue));
  assert.ok(reply, 'Unexpected provider dispatch');
  if (reply.timeout) throw new DOMException('Synthetic timeout', 'TimeoutError');
  return new Response(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body), {
    status: reply.status, headers: { 'Content-Type': 'application/json' },
  });
};
