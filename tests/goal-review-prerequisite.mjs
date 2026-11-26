import { GOAL_REVIEW_VERSION } from '../lib/goal-review.ts';
import { plannerIntake } from '../lib/setup.ts';

export function reviewSelection(blockId) {
  return { reviewId: 'fixture-review-' + blockId, option: null };
}

// Suites that isolate the second stage supply a completed synthetic first stage.
// The goal-review integration tests exercise real assessment requests and usage.
export async function seedReviewedFixture(db, block, provider = 'openai') {
  const input = plannerIntake(block.setup);
  const timestamp = new Date(Date.now() - 300000).toISOString();
  const review = {
    schemaVersion: 1, id: reviewSelection(block.id).reviewId, promptVersion: GOAL_REVIEW_VERSION,
    provider, model: provider === 'simulation' ? 'simulated-goal-review-v1' : 'gpt-6-luna',
    status: 'ready', startedAt: timestamp, finishedAt: timestamp,
    setupSnapshot: block.setup, input, output: { decision: 'proceed', reason: 'Synthetic reviewed goal.',
      approach: 'Generate a fixture schedule for the confirmed target.', options: [] },
    error: null, responseId: null, usage: null,
  };
  await db.prepare('UPDATE training_plans SET goal_review=? WHERE id=?').bind(JSON.stringify(review), block.id).run();
}

export function withReviewedFixture(db, dispatch, provider = 'openai') {
  return async (input, options = {}) => {
    const route = new URL(input).pathname;
    if (options.method !== 'POST') return dispatch(input, options);
    if (route === '/api/blocks') {
      const response = await dispatch(input, options);
      if (response.status === 201 && JSON.parse(options.body).complete === true) {
        const { block } = await response.clone().json();
        await seedReviewedFixture(db, block, provider);
      }
      return response;
    }
    const generation = route.match(/^\/api\/blocks\/([^/]+)\/generation$/);
    if (!generation) return dispatch(input, options);
    const body = JSON.parse(options.body);
    body.goalReview ??= reviewSelection(decodeURIComponent(generation[1]));
    return dispatch(input, { ...options, body: JSON.stringify(body) });
  };
}
