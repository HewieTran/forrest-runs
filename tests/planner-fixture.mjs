import { emptySetup, simpleSetup, plannerIntake } from '../lib/setup.ts';
import { addDays } from '../lib/domain.ts';
import { preparePlanner, scheduleDays } from '../lib/planner.ts';
import { simulatedPlan } from '../lib/simulated-plan.ts';
export function plannerFixture(today = '2026-10-24') {
  const setup = emptySetup('Example 5K', addDays(today, 28), today);
  setup.step = 4; setup.units = 'mi';
  setup.baseline.weeklyDistance = 12; setup.baseline.longestRun = 5; setup.baseline.runsPerWeek = 3; setup.baseline.trainingChanges = 'none';
  setup.availability = { ...setup.availability, days: [1, 3, 6], maxSessionDurationSeconds: 3600 };
  const input = plannerIntake(setup); // Legacy contract fixture, also used for backup validation.
  const output = { outcome: 'plan', summary: 'An example draft for exercising application constraints.', goalAssessment: 'This fixture does not evaluate fitness or predict a finish time.', assumptions: ['Recorded baseline is representative.'], questions: [],
    sessions: scheduleDays(input).filter(day => day.kind !== 'rest').map(day => ({ date: day.date, type: day.kind === 'race' ? 'Race' : 'Easy Run', phase: day.kind === 'race' ? 'Race Week' : 'Base Build', title: day.kind === 'race' ? '5K race' : 'Easy run', notes: 'Run at a conversational effort.',
      steps: [{ kind: day.kind === 'race' ? 'race' : 'run', label: day.kind === 'race' ? '5K race effort' : 'Easy throughout', durationSeconds: 1800, distanceMiles: day.kind === 'race' ? 5000 / 1609.344 : null, paceSecondsPerMile: null, effort: day.kind === 'race' ? 'race' : 'easy' }] })) };
  return { setup, input, output };
}
export function currentPlannerFixture(today = '2026-10-24') {
  const setup = simpleSetup(undefined, 'Example 5K', addDays(today, 28), today);
  setup.step = 3; setup.goal.targetDurationSeconds = 1800;
  setup.runner = { ...setup.runner, experience: 'intermediate', age: 35, height: 70, weight: 175 };
  setup.availability.days = [1, 3, 6];
  setup.benchmark = { distance: '5k', durationSeconds: 2100, date: addDays(today, -7), effortConfirmed: true };
  const input = preparePlanner(setup, today);
  return { setup, input, output: { ...simulatedPlan(input).output, assessment: { decision: 'proceed', reason: 'Synthetic assessment for testing application flow; not a fitness judgment.', actions: [] } } };
}
// Encode the new provider pair contract; canonical saved fixtures keep all three.
export function providerOutput(output) {
  return { ...output, sessions: output.sessions.map(session => ({ ...session, steps: session.steps.map(({ distanceMiles, ...step }) => step.kind === 'race' ? { ...step, paceSecondsPerMile: null } : step) })) };
}
export function responseFixture(output) {
  return { id: 'resp_test', model: 'gpt-6-luna', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(providerOutput(output)) }] }], usage: { input_tokens: 1000, output_tokens: 2000 } };
}
