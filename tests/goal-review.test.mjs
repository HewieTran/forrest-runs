import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays } from '../lib/domain.ts';
import { GOAL_REVIEW_VERSION, ReviewSelection, confirmGoalReview, sameReviewInput, validateGoalReview, validateGoalReviewOutput } from '../lib/goal-review.ts';
import { requestGoalReview } from '../lib/openai-goal-review.ts';
import { requestOpenAIPlan } from '../lib/openai-plan.ts';
import { preparePlanner } from '../lib/planner.ts';
import { simulatedPlan } from '../lib/simulated-plan.ts';
import { currentPlannerFixture, responseFixture } from './planner-fixture.mjs';

const today = '2026-11-26';
const now = today + 'T12:00:00.000Z';
const config = { apiKey: 'synthetic-key', model: 'gpt-6-luna', asOfDate: today };

function option(kind, values) {
  return { kind, reason: 'Synthetic independent option.', targetDurationSeconds: null, additionalDays: null, trainingDays: null, ...values };
}
const options = [
  option('training_days', { trainingDays: [1, 3, 5, 6] }),
  option('race_date', { additionalDays: 14 }),
  option('target_time', { targetDurationSeconds: 1920 }),
];
const adjustment = { decision: 'adjust', reason: 'Synthetic constraint conflict.', approach: 'Synthetic assessment approach.', options };
const proceed = { ...adjustment, decision: 'proceed', options: [] };
const unsupported = { ...proceed, decision: 'unsupported' };

function fixture(output = adjustment) {
  const { setup } = currentPlannerFixture(today);
  const input = preparePlanner(setup, today);
  const review = { schemaVersion: 1, id: 'assessment-1', promptVersion: GOAL_REVIEW_VERSION, provider: 'openai',
    model: config.model, status: 'ready', startedAt: now, finishedAt: now, setupSnapshot: setup,
    input, output, responseId: 'synthetic-response', error: null, usage: { inputTokens: 25, outputTokens: 15 } };
  return { review, setup, input };
}
function selection(review, option, trainingDays) {
  return ReviewSelection.parse({ reviewId: review.id, option, ...(trainingDays ? { trainingDays } : {}) });
}

test('goal review enforces one independent, feasible change per choice', () => {
  const { input } = fixture();
  assert.deepEqual(validateGoalReviewOutput(adjustment, input), adjustment);
  assert.deepEqual(validateGoalReviewOutput(unsupported, input), unsupported);
  for (const output of [
    { ...adjustment, options: [] },
    { ...proceed, options },
    { ...adjustment, options: [options[0], options[0]] },
    { ...adjustment, options: [{ ...options[0], trainingDays: [1, 2, 4, 6] }] },
    { ...adjustment, options: [{ ...options[1], additionalDays: 181 }] },
    { ...adjustment, options: [{ ...options[2], targetDurationSeconds: input.goal.targetDurationSeconds }] },
    { ...adjustment, options: [{ ...options[2], additionalDays: 7 }] },
    { ...adjustment, options: [{ ...options[1], trainingDays: [1, 3, 6] }] },
    { ...proceed, sessions: [] },
  ]) assert.throws(() => validateGoalReviewOutput(output, input));
  assert.throws(() => ReviewSelection.parse({ reviewId: 'id', option: 'training_days', trainingDays: [1, 1] }));
  assert.throws(() => ReviewSelection.parse({ reviewId: 'id', option: 'target_time', targetDurationSeconds: 1 }));
});

test('confirming one option preserves all unrelated goal and benchmark fields', () => {
  const { review, setup } = fixture();
  const confirmedTime = confirmGoalReview(review, setup, selection(review, 'target_time'), today);
  assert.deepEqual(confirmedTime, { ...setup, goal: { ...setup.goal, targetDurationSeconds: 1920 } });
  const confirmedDate = confirmGoalReview(review, setup, selection(review, 'race_date'), today);
  assert.deepEqual(confirmedDate, { ...setup, goal: { ...setup.goal, targetDate: addDays(setup.goal.targetDate, 14) } });
  const confirmedDays = confirmGoalReview(review, setup, selection(review, 'training_days', [6, 3, 1, 4]), today);
  assert.deepEqual(confirmedDays, { ...setup, availability: { ...setup.availability, days: [1, 3, 4, 6] } });
  assert.throws(() => confirmGoalReview(review, setup, selection(review, null), today), /supported changes/);
  assert.throws(() => confirmGoalReview(review, setup, selection(review, 'training_days', [1, 4, 5, 6]), today), /selected days/);
  assert.throws(() => confirmGoalReview(review, setup, selection(review, 'target_time', [1, 3, 6]), today), /does not change/);
  const refreshed = fixture(proceed).review;
  assert.deepEqual(confirmGoalReview(refreshed, setup, selection(refreshed, null), today), setup);
  assert.throws(() => confirmGoalReview(refreshed, setup, selection(refreshed, 'race_date'), today), /not offered/);
  const blocked = fixture(unsupported).review;
  assert.throws(() => confirmGoalReview(blocked, setup, selection(blocked, null), today), /supported changes/);
  assert.throws(() => confirmGoalReview(review, setup, { reviewId: 'stale-id', option: 'race_date' }, today), /Review your goal/);
  const revised = { ...setup, benchmark: { ...setup.benchmark, durationSeconds: 2200 } };
  assert.equal(sameReviewInput(revised, review.input), false);
  assert.throws(() => confirmGoalReview(review, revised, selection(review, 'race_date'), today), /setup changed/);
});

test('recorded confirmations replay unchanged and backup validation detects tampering', () => {
  const { review, setup } = fixture();
  const selected = selection(review, 'target_time');
  const revised = confirmGoalReview(review, setup, selected, today);
  const confirmed = { ...review, confirmation: { selection: selected, setup: revised, confirmedAt: now } };
  assert.deepEqual(validateGoalReview(JSON.parse(JSON.stringify(confirmed))), confirmed);
  assert.deepEqual(confirmGoalReview(confirmed, revised, selected, today), revised);
  const renamed = { ...revised, goal: { ...revised.goal, name: 'Saved display name' } };
  assert.deepEqual(confirmGoalReview(confirmed, renamed, selected, today), renamed);
  assert.throws(() => confirmGoalReview(confirmed, revised, selection(review, 'race_date'), today), /another choice/);
  const tampered = structuredClone(confirmed);
  tampered.confirmation.setup.benchmark.durationSeconds++;
  assert.throws(() => validateGoalReview(tampered), /offered change/);
});

test('assessment request uses strict schedule-free schema and preserves paid invalid-response usage', async () => {
  const { input } = fixture();
  let attempts = 0;
  const result = await requestGoalReview(input, config, async (_url, init) => {
    attempts++;
    const request = JSON.parse(init.body);
    assert.equal(request.store, false);
    assert.equal(request.text.format.name, 'running_goal_review_v1');
    assert.equal(request.text.format.strict, true);
    assert.deepEqual(JSON.parse(request.input).intake, input);
    assert.equal(JSON.parse(request.input).schedule, undefined);
    return Response.json({
      id: 'synthetic-response', model: config.model, status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(proceed) }] }],
      usage: { input_tokens: 25, output_tokens: 15 },
    });
  });
  assert.equal(attempts, 1);
  assert.deepEqual(result, {
    output: proceed, responseId: 'synthetic-response', model: config.model,
    usage: { inputTokens: 25, outputTokens: 15 }, promptVersion: GOAL_REVIEW_VERSION,
  });
  await assert.rejects(requestGoalReview(input, config, async () => Response.json({
    status: 'completed', model: config.model,
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ ...proceed, sessions: [] }) }] }],
    usage: { input_tokens: 21, output_tokens: 13 },
  })), { code: 'invalid', validationFailure: 'assessment', usage: { inputTokens: 21, outputTokens: 13 } });
});

test('schedule generation enforces the exact confirmed race target and rejects reassessment', async () => {
  const { review, setup } = fixture();
  const confirmedSetup = confirmGoalReview(review, setup, selection(review, 'target_time'), today);
  const input = preparePlanner(confirmedSetup, today);
  const output = { ...simulatedPlan(input).output, assessment: { decision: 'proceed', reason: 'Synthetic confirmation.', actions: [], suggestions: null } };
  const fetcher = value => async () => Response.json(responseFixture(value));
  const result = await requestOpenAIPlan(input, { ...config, confirmedReview: review.output }, fetcher(output));
  assert.equal(result.output.sessions.at(-1).steps.find(step => step.kind === 'race').durationSeconds, 1920);
  const drift = structuredClone(output);
  drift.sessions.at(-1).steps.find(step => step.kind === 'race').durationSeconds++;
  await assert.rejects(requestOpenAIPlan(input, config, fetcher(drift)), { code: 'invalid', validationFailure: 'goal_target' });
  await assert.rejects(requestOpenAIPlan(input, config, fetcher({
    ...output, outcome: 'needs_clarification', sessions: [], questions: ['Change your time?'],
    assessment: { decision: 'adjust_goal', reason: 'Synthetic reassessment.', actions: ['target_time'], suggestions: null },
  })), { code: 'invalid', validationFailure: 'assessment' });
});
