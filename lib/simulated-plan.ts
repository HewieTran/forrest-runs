import { dateDiff } from './domain.ts';
import { scheduleDays, validatePlanOutput, PLANNER_VERSION, type PlannerIntake, type PlanOutput } from './planner.ts';

export const SIMULATION_MODEL = 'simulated-5k-v1';
// Deliberately simple examples for exercising review/acceptance. No fitness or
// performance assessment is performed, and there is no provider/network access.
export function simulatedPlan(input: PlannerIntake) {
  if (input.goal.paceGuidance === 'estimated' || input.schemaVersion === 2) return numericSimulation(input);
  const days = scheduleDays(input);
  const race = days.at(-1)!;
  const output: PlanOutput = {
    outcome: race.limitSeconds < 1800 ? 'needs_clarification' : 'plan',
    summary: 'SIMULATION: This example schedule demonstrates block creation, review and saving. It is not a personalized training recommendation.',
    goalAssessment: 'Your finish-time goal, fitness, experience and other exercise have not been assessed. The example race duration is fixed at 30 minutes and is not a prediction or a target.',
    assumptions: ['Example sessions use up to 30 minutes within your saved time limits.', 'Only the dates, selected weekdays and time limits shape this demonstration.', 'The saved simulation stays a draft and cannot become your active training block.'],
    questions: race.limitSeconds < 1800 ? ['The demonstration uses a 30-minute race segment. Increase the session limit to at least 30 minutes to test this example, or keep your real constraint and wait for live planning.'] : [],
    sessions: [],
  };
  if (output.outcome === 'plan') output.sessions = days.filter(day => day.kind !== 'rest').map(day => ({
    date: day.date, type: day.kind === 'race' ? 'Race' : 'Easy Run',
    phase: dateDiff(input.goal.raceDate, day.date) < 7 ? 'Race Week' : 'Base Build',
    title: day.kind === 'race' ? 'SIMULATION · Example 5K race' : 'SIMULATION · Example easy session',
    notes: 'Demonstration data only. This session has not been evaluated for your training needs.',
    steps: [{ kind: day.kind === 'race' ? 'race' : 'run', label: day.kind === 'race' ? 'Example 5K segment' : 'Example conversational running',
      durationSeconds: Math.min(1800, day.limitSeconds), distanceMiles: day.kind === 'race' ? 5000 / 1609.344 : null,
      paceSecondsPerMile: null, effort: day.kind === 'race' ? 'race' : 'easy' }],
  }));
  return { output: validatePlanOutput(output, input), model: SIMULATION_MODEL, responseId: null, usage: null,
    promptVersion: 'simulation-v1', validatorVersion: PLANNER_VERSION };
}

// Free fixtures for the simplified intake. Numeric prescriptions exercise the
// actual UI contract; they are examples, not a calibrated training methodology.
function numericSimulation(input: PlannerIntake) {
  const days = scheduleDays(input);
  const raceSeconds = input.goal.targetDurationSeconds!;
  const easyPace = input.runner.experience === 'novice' ? 840 : input.runner.experience === 'advanced' ? 600 : 720;
  const output: PlanOutput = {
    outcome: 'plan',
    summary: 'SIMULATION: A numeric example plan for testing the complete app flow. This is not a personalized training recommendation.',
    goalAssessment: 'The race segment copies your requested finish time. Current fitness and goal feasibility have not been assessed.',
    assumptions: ['Example easy paces are selected from experience level only.', 'Benchmarks and runner measurements are saved but do not calibrate this simulation.', 'Simulation schedules remain drafts and cannot be started.'],
    questions: [],
    sessions: days.filter(day => day.kind !== 'rest').map(day => {
      const race = day.kind === 'race';
      const durationSeconds = race ? raceSeconds : input.runner.experience === 'novice' ? 1200 : 1800;
      const distanceMiles = race ? 5000 / 1609.344 : durationSeconds / easyPace;
      return { date: day.date, type: race ? 'Race' : 'Easy Run', phase: dateDiff(input.goal.raceDate, day.date) < 7 ? 'Race Week' : 'Base Build',
        title: race ? 'SIMULATION · 5K race' : 'SIMULATION · Easy run', notes: 'Estimated example pace. Edit the prescription if needed; this schedule is for testing.',
        steps: [{ kind: race ? 'race' : 'run', label: race ? '5K race segment' : 'Easy run', durationSeconds, distanceMiles,
          paceSecondsPerMile: race ? durationSeconds / distanceMiles : easyPace, effort: race ? 'race' : 'easy' }] };
    }),
  };
  return { output: validatePlanOutput(output, input), model: SIMULATION_MODEL, responseId: null, usage: null,
    promptVersion: 'simulation-numeric-v2', validatorVersion: PLANNER_VERSION };
}
