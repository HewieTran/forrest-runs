// Explicitly opt-in paid evaluation. All profiles are invented; no account,
// training database, imported history or user benchmark is read or changed.
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { simpleSetup } from '../lib/setup.ts';
import { addDays, centralToday } from '../lib/domain.ts';
import { preparePlanner, PROMPT_VERSION, PLANNER_VERSION } from '../lib/planner.ts';
import { requestOpenAIPlan, PlanProviderError } from '../lib/openai-plan.ts';
import { APPROVED_PLAN_MODEL, PRICING_VERSION, REQUEST_RESERVE_MICRODOLLARS, estimatedCost, usageWithinReservation } from '../lib/planner-policy.ts';
export const EVALUATION_BUDGET = 100000; // $0.10 total, separate from app allowance.
export function evaluationCases(today) {
  const specs = [
    ['matched-5k', 'intermediate', '5k', 1800, -14, 1770, 56, ['proceed']],
    ['unsupported-goal', 'novice', '5k', 2100, -7, 900, 84, ['adjust_goal']],
    ['old-benchmark', 'intermediate', '5k', 1800, -2190, 1770, 56, ['refresh_benchmark', 'clarify']],
    ['half-benchmark', 'intermediate', 'half', 8100, -14, 1770, 56, ['proceed']],
  ];
  return specs.map(([id, experience, distance, seconds, offset, target, days, expectedDecisions]) => {
    const setup = simpleSetup(undefined, 'Synthetic evaluation 5K', addDays(today, days), today);
    setup.step = 3; setup.runner = { ...setup.runner, experience, age: 35, height: 70, weight: 175 };
    setup.goal.targetDurationSeconds = target; setup.availability.days = [1, 3, 6];
    setup.benchmark = { distance, durationSeconds: seconds, date: addDays(today, offset), effortConfirmed: true };
    return { id, expectedDecisions, setup, input: preparePlanner(setup, today) };
  });
}
export async function evaluateCases({ cases, apiKey, today, journal, persist, fetcher = fetch }) {
  for (const example of cases) {
    if (journal.attempts.some(attempt => attempt.id === example.id)) continue; // Never retry a dispatched case.
    const committed = journal.attempts.reduce((sum, attempt) => sum + attempt.countedMicrodollars, 0);
    if (committed + REQUEST_RESERVE_MICRODOLLARS > EVALUATION_BUDGET) break;
    const attempt = { id: example.id, input: example.input, expectedDecisions: example.expectedDecisions,
      startedAt: new Date().toISOString(), status: 'reserved', countedMicrodollars: REQUEST_RESERVE_MICRODOLLARS };
    journal.attempts.push(attempt); persist(journal); // Reserve before any network dispatch.
    const started = Date.now();
    try {
      const transport = async (url, init) => {
        const response = await fetcher(url, init);
        attempt.httpStatus = response.status;
        // Preserve only successful synthetic model text for manual review if
        // schedule validation fails. Never save HTTP error bodies or headers.
        if (response.ok) {
          try {
            const raw = await response.clone().text();
            if (raw.length <= 700000) {
              const data = JSON.parse(raw);
              const text = (Array.isArray(data.output) ? data.output : []).flatMap(item => Array.isArray(item?.content) ? item.content : []).filter(item => item?.type === 'output_text' && typeof item.text === 'string').map(item => item.text).join('');
              if (text) attempt.candidate = JSON.parse(text);
            }
          } catch { /* Invalid provider content remains a safe adapter error. */ }
        }
        return response;
      };
      const result = await requestOpenAIPlan(example.input, { apiKey, model: APPROVED_PLAN_MODEL, asOfDate: today }, transport);
      Object.assign(attempt, { status: 'completed', result, expectationMet: example.expectedDecisions.includes(result.output.assessment?.decision) });
      delete attempt.candidate; // Validated output already retains the same model text.
      if (result.usage) attempt.countedMicrodollars = usageWithinReservation(result.usage) ? estimatedCost(result.usage) : Math.max(REQUEST_RESERVE_MICRODOLLARS, estimatedCost(result.usage));
    } catch (error) {
      if (!(error instanceof PlanProviderError)) { attempt.errorCode = 'local_failure'; }
      else {
        attempt.errorCode = error.code; attempt.usage = error.usage;
        if (error.usage) attempt.countedMicrodollars = usageWithinReservation(error.usage) ? estimatedCost(error.usage) : Math.max(REQUEST_RESERVE_MICRODOLLARS, estimatedCost(error.usage));
      }
      attempt.status = 'failed';
    }
    attempt.latencyMs = Date.now() - started; attempt.finishedAt = new Date().toISOString(); persist(journal);
    if (attempt.status !== 'completed' || attempt.expectationMet === false) break; // Stop for investigation; no retry or model upgrade.
  }
  return journal;
}
async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const today = centralToday(), cases = evaluationCases(today);
  if (process.argv[2] !== '--live') {
    console.log(JSON.stringify({ mode: 'dry-run', model: APPROVED_PLAN_MODEL, synthetic: true, maxBudgetUSD: EVALUATION_BUDGET / 1000000, cases: cases.map(({ id, expectedDecisions }) => ({ id, expectedDecisions })) }));
    return;
  }
  // Reusing this one journal prevents a second charge for a dispatched case,
  // including a process interruption or unknown billing. Never delete to retry.
  const path = resolve(root, 'evals/stage6-results.json');
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = path + '.lock';
  const lock = openSync(lockPath, 'wx', 0o600); // Serialize journal reads and reservations as well as dispatch.
  try {
    const journal = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {
      synthetic: true, model: APPROVED_PLAN_MODEL, promptVersion: PROMPT_VERSION, validatorVersion: PLANNER_VERSION,
      pricingVersion: PRICING_VERSION, budgetMicrodollars: EVALUATION_BUDGET, asOfDate: today, attempts: [],
    };
    if (journal.promptVersion !== PROMPT_VERSION || journal.asOfDate !== today || journal.budgetMicrodollars !== EVALUATION_BUDGET) throw new Error('Existing evaluation has different inputs/version/date. Review it before authorizing another batch.');
    const apiKey = parseEnv(readFileSync(resolve(root, '.env.local'), 'utf8')).OPENAI_API_KEY;
    if (!apiKey) throw new Error('The approved local API key is not configured.');
    const persist = value => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
    await evaluateCases({ cases, apiKey, today, journal, persist });
    console.log(JSON.stringify({ report: 'evals/stage6-results.json', synthetic: true,
      countedUSD: journal.attempts.reduce((sum, attempt) => sum + attempt.countedMicrodollars, 0) / 1000000,
      attempts: journal.attempts.map(({ id, status, errorCode, expectationMet, countedMicrodollars, latencyMs }) => ({ id, status, errorCode, expectationMet, countedMicrodollars, latencyMs })) }));
  } finally { closeSync(lock); unlinkSync(lockPath); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Evaluation stopped. Review the local configuration and existing evaluation journal; no automatic retry was attempted.'); process.exitCode = 1; });
}
