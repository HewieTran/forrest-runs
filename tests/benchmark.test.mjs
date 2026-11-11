import test from 'node:test';
import assert from 'node:assert/strict';
import { simpleSetup, validateSetup, setupIssues, plannerIntake, convertSetupUnits } from '../lib/setup.ts';
import { goalSuggestions } from '../lib/plan-assessment.ts';
import { addDays } from '../lib/domain.ts';
import { preparePlanner, validateGeneration } from '../lib/planner.ts';
import { currentPlannerFixture, plannerFixture } from './planner-fixture.mjs';
import { responseFixture } from './planner-fixture.mjs';
import { requestOpenAIPlan } from '../lib/openai-plan.ts';

const today='2026-10-31';
test('one confirmed benchmark is normalized for every supported result distance',()=>{
  for(const [distance,meters] of [['5k',5000],['10k',10000],['half',21097.5],['full',42195]]) {
    const {setup}=currentPlannerFixture(today);setup.benchmark.distance=distance;
    const saved=validateSetup(setup,today),input=preparePlanner(saved,today);
    assert.deepEqual(setupIssues(saved),[]);assert.equal(input.schemaVersion,2);
    assert.deepEqual(input.baseline.results,[{distanceMeters:meters,durationSeconds:2100,date:'2026-10-24',source:'confirmed-race-or-best-effort-time-trial'}]);
    const converted=convertSetupUnits(saved,'km');assert.deepEqual(converted.benchmark,saved.benchmark);
    assert.deepEqual(plannerIntake(converted).baseline.results,input.baseline.results);
    assert.equal(input.baseline.weeklyDistanceMiles,null);assert.equal(input.goal.paceGuidance,'performance');
  }
});
test('partial benchmarks save as drafts but cannot generate or satisfy completion',()=>{
  const partial=simpleSetup(undefined,'Draft','2026-12-01',today);
  assert.doesNotThrow(()=>validateSetup(partial,today));
  for(const [key,value,field] of [['distance',null,'benchmarkDistance'],['durationSeconds',null,'benchmarkTime'],['date','','benchmarkDate'],['effortConfirmed',false,'benchmarkEffort']]) {
    const {setup}=currentPlannerFixture(today);setup.benchmark[key]=value;
    assert.doesNotThrow(()=>validateSetup(setup,today));
    assert.ok(setupIssues(setup).some(issue=>issue.field===field));
    assert.throws(()=>preparePlanner(setup,today));
  }
});
test('malformed, future, unsupported, zero and unconfirmed-type benchmarks fail server validation',()=>{
  for(const edit of [b=>b.distance='marathon',b=>b.durationSeconds=0,b=>b.durationSeconds='30:00',b=>b.durationSeconds=1.5,b=>b.durationSeconds=86401,b=>b.date='2026-11-01',b=>b.date='2026-02-30',b=>b.effortConfirmed='true']){
    const {setup}=currentPlannerFixture(today);edit(setup.benchmark);assert.throws(()=>validateSetup(setup,today));
  }
});
test('older drafts cannot bypass the benchmark requirement; historical generation remains readable',()=>{
  const {setup,input,output}=plannerFixture(today);
  assert.throws(()=>preparePlanner(setup,today),/benchmark/);
  const view=simpleSetup(setup);assert.equal(view.benchmark.effortConfirmed,false);assert.equal(view.benchmark.distance,null);
  const stamp='2026-10-31T12:00:00.000Z';
  const generation={schemaVersion:1,id:'historical-test',status:'accepted',startedAt:stamp,finishedAt:stamp,acceptedAt:stamp,alteredAt:null,model:'old-model',promptVersion:'old',validatorVersion:'old',input,setupSnapshot:setup,output,error:null,responseId:null,usage:null};
  assert.deepEqual(validateGeneration(generation),generation);
});

test('the model request carries the confirmed benchmark separately from the target',async()=>{
  const {input,output}=currentPlannerFixture(today);let captured;
  await requestOpenAIPlan(input,{apiKey:'synthetic',model:'gpt-6-luna'},async(_url,init)=>{captured=JSON.parse(JSON.parse(init.body).input).intake;return Response.json(responseFixture(output));});
  assert.equal(captured.baseline.results[0].durationSeconds,2100);
  assert.equal(captured.goal.targetDurationSeconds,1800);
  assert.equal(captured.baseline.weeklyDistanceMiles,null);
  assert.equal(captured.runner.vo2,null);
});

test('a first-time half or full marathon runner can receive a suggested target from a 5K only', async () => {
  for (const [kilometers, target, estimate] of [[21.0975, 7200, 7800], [42.195, 14400, 16200]]) {
    const { setup, output } = currentPlannerFixture(today);
    setup.goal.distanceKm = kilometers;
    setup.goal.targetDate = addDays(today, 126);
    setup.goal.targetDurationSeconds = target;
    const input = preparePlanner(setup, today);
    const clarification = {
      ...output, outcome: 'needs_clarification', sessions: [], questions: ['Would you consider a revised target?'],
      assessment: {
        decision: 'adjust_goal', reason: 'The 5K informs pace. Endurance at the goal distance is less certain.',
        actions: ['target_time'], suggestions: { finishTime: { durationSeconds: estimate, reason: 'Synthetic estimate.' }, schedule: null },
      },
    };
    const result = await requestOpenAIPlan(input, { apiKey: 'synthetic', model: 'gpt-6-luna', asOfDate: today }, async (_url, init) => {
      const request = JSON.parse(init.body);
      const { intake } = JSON.parse(request.input);
      assert.equal(intake.goal.distanceMeters, kilometers * 1000);
      assert.deepEqual(intake.baseline.results.map(benchmark => benchmark.distanceMeters), [5000]);
      assert.equal(intake.baseline.weeklyDistanceMiles, null);
      assert.equal(intake.baseline.longestRunMiles, null);
      assert.match(request.instructions, /Do not require a same-distance result/);
      return Response.json(responseFixture(clarification));
    });
    assert.deepEqual(result.output.sessions, []);
    assert.equal(goalSuggestions(result.output.assessment, input, today)[0].durationSeconds, estimate);
    assert.equal(input.goal.targetDurationSeconds, target);
  }
});
