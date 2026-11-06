import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVED_PLAN_MODEL, estimatedCost, readTokenUsage, usageWithinReservation, REQUEST_RESERVE_MICRODOLLARS, MAX_INPUT_TOKEN_BOUND, MAX_OUTPUT_TOKENS } from '../lib/planner-policy.ts';
import { requestOpenAIPlan, PlanProviderError } from '../lib/openai-plan.ts';
import { plannerFixture, responseFixture } from './planner-fixture.mjs';

test('integer accounting conservatively rounds and the request reserve covers bounded token usage', () => {
  assert.equal(estimatedCost({ inputTokens: 2000, outputTokens: 8000 }), 4200);
  assert.equal(estimatedCost({ inputTokens: 1, outputTokens: 0 }), 1);
  assert.ok(estimatedCost({ inputTokens: MAX_INPUT_TOKEN_BOUND, outputTokens: MAX_OUTPUT_TOKENS }) < REQUEST_RESERVE_MICRODOLLARS);
  for (const bad of [null, {}, {input_tokens:-1,output_tokens:0}, {input_tokens:1.5,output_tokens:0}, {input_tokens:0,output_tokens:'2'}]) assert.equal(readTokenUsage(bad), null);
  assert.equal(usageWithinReservation({inputTokens:MAX_INPUT_TOKEN_BOUND+1,outputTokens:0}),false);
});

test('disallowed models fail before any request, even with a valid-looking configuration', async () => {
  const {input}=plannerFixture();let calls=0;
  for(const model of ['gpt-6.1-sol','gpt-6-astra','gpt-6-luna-custom']) {
    await assert.rejects(requestOpenAIPlan(input,{apiKey:'synthetic',model},async()=>{calls++;}),{code:'model_restricted'});
  }
  assert.equal(calls,0);
});

test('errors distinguish billing, authentication, model access and throttling without exposing provider text',async()=>{
  const {input}=plannerFixture();
  for(const [status,upstream,expected] of [[401,'invalid_api_key','authentication'],[403,'permission_denied','model_access'],[404,'model_not_found','model_access'],[429,'insufficient_quota','billing'],[429,'project_spend_limit_exceeded','billing'],[429,'rate_limit_exceeded','rate_limit'],[400,'invalid_request_error','request'],[503,'server_error','provider']]) {
    await assert.rejects(requestOpenAIPlan(input,{apiKey:'synthetic',model:APPROVED_PLAN_MODEL},async()=>Response.json({error:{code:upstream,message:'private upstream details'}},{status})),e=>e instanceof PlanProviderError&&e.code===expected&&!e.message.includes('private upstream')&&(status===503?e.usage===null:e.usage.inputTokens===0));
  }
});

test('paid usage is retained for incomplete, refusal and invalid structured responses',async()=>{
  const {input,output}=plannerFixture();
  for(const response of [ {...responseFixture(output),status:'incomplete'}, {...responseFixture(output),output:[{content:[{type:'refusal'}]}]}, responseFixture({...output,sessions:[]}) ]) {
    await assert.rejects(requestOpenAIPlan(input,{apiKey:'synthetic',model:APPROVED_PLAN_MODEL},async()=>Response.json(response)),e=>e.usage?.inputTokens===1000&&e.usage?.outputTokens===2000);
  }
  await assert.rejects(requestOpenAIPlan(input,{apiKey:'synthetic',model:APPROVED_PLAN_MODEL},async()=>Response.json(null)),{code:'invalid'});
});

test('oversized requests are rejected before the provider and report zero usage',async()=>{
  const {input}=plannerFixture();input.availability.otherCommitments='x'.repeat(70000);let calls=0;
  await assert.rejects(requestOpenAIPlan(input,{apiKey:'synthetic',model:APPROVED_PLAN_MODEL},async()=>{calls++;}),e=>e.code==='input_limit'&&e.usage.inputTokens===0);
  assert.equal(calls,0);
});

test('new live 5K output rejects unrelated marathon phases without changing historical readers',async()=>{
  const {input,output}=plannerFixture();const changed=structuredClone(output);changed.sessions[0].phase='Marathon Build';
  await assert.rejects(requestOpenAIPlan(input,{apiKey:'synthetic',model:APPROVED_PLAN_MODEL},async()=>Response.json(responseFixture(changed))),e=>e.code==='invalid'&&e.usage.outputTokens===2000);
});
