# Offline planner tests

These automated tests require no OpenAI account, API key, paid request, sample
input from a user, or additional test UI. They are development checks rather than
a substitute for reviewing real model output or training methodology.

## Multiple race distances

Prompt `race-coach-v7-calculated` receives the exact selected race distance.
The app calculates and verifies race distance and pace for 5K, 10K, half marathon
and full marathon using the same wire contract. Intake fields, supported
training window and request budget limits stay the same. Longer-race prompts
distinguish benchmark speed from endurance readiness. Offline tests verify
request, storage and calculation behavior; real model quality for the new
distances still needs review before enabling them on the live planner.

## Calculated measurements — option 1 (historical 5K release)

Prompt `5k-coach-v6-calculated` requests a pair-only wire contract: ordinary
running steps supply duration/pace; the race supplies duration/null pace, with
its 5K distance fixed by the app. The model cannot supply a distance field or a
numeric race pace in this format. `lib/planner-math.ts` computes the missing
measurement without rounding before validation. New snapshots record
`duration-pace-v1`; acceptance and offline backup validation verify this
provenance. Historical three-number snapshots remain unchanged.

All dates, complete-schedule, session-limit, positive-target, race, warmup/cooldown,
text-length and goal-assessment checks remain. No arithmetic tolerance was
increased, and no paid repair/retry or model upgrade was added. The error UI drops
the confusing ambition sentence; technical errors remain separate from structured
goal-adjustment questions. Numeric consistency does not establish training quality.

`tests/planner-math.test.mjs` verifies authoritative pairs, exact 5K distance,
fractional precision, rejection of a third model number, unchanged constraints,
snapshot provenance and historical compatibility. Fixtures now encode the pair
contract. Replay of the old Stage 6 captures explicitly adapts their input fields
to that contract; it is not a new real-model evaluation. A separately bounded
single-case live check is recorded in `evals/calculated-plan-results.json`.

## Generated-output validation diagnostics

`invalid` is a technical generated-response failure, not a goal-feasibility
verdict. New failures retain a whitelisted `generation.validationFailure` code
and reported token usage in existing generation JSON. Messages identify the
failed check where known, preserve the inputs and explain that the same inputs
can be retried manually with another potentially charged request. No provider
body, prompt, credential or invalid schedule is stored. Older generic failures
render with clarified wording without rewriting history; their exact check
cannot be recovered. Setup displays generation errors separately from field
errors. Goal-adjustment questions still use the structured clarification flow.
No validation guard, arithmetic tolerance, retry policy or model was relaxed.

Tests cover safe typed diagnostics, missing dates, arithmetic, assessment and
malformed output, preservation across reload/backups, zero workout/rest writes,
charged-invalid usage, and legacy display. Preview scenarios `validation-error`
and `legacy-validation-error` cover desktop and 390-pixel setup layouts without
API calls. No paid request was made to diagnose or test this update.

## Stage 6 evaluation status

See `PLANNER_EVALUATION.md` and `evals/stage6-results.json` for the first four
real Luna requests using synthetic profiles. All returned expected decisions;
estimated total cost was $0.006858. No personal benchmark was used. Both schedules
and both clarifications also passed offline production Worker replay, saving,
reload and backup checks. Hosted key/model configuration has since been deployed in live mode (environment
revision 5); a complete successful hosted plan trial remains open.

`npm run eval:planner` is dry-run only. Paid evaluation requires explicit `--live`
on `scripts/evaluate-planner.mjs`; it retains a locked reservation journal, never
retries a dispatched case and caps this batch at $0.10. Do not reset the journal
to spend again. `npm run test:planner:replay` uses recorded responses and no
external network after a production build.

## Stage 4 goal assessment (2026-10-31)

Current live responses require a structured assessment before automatic saving.
`proceed` permits a schedule; `adjust_goal`, `refresh_benchmark` and `clarify`
require specific questions and zero sessions. Only existing-field actions are
allowed: target finish time, race date, benchmark and training days. The app never
changes an input automatically or suggests changing reported experience to pass.
A later race date is an option to review, not a promise of an achievable goal.

The request includes trusted calendar context: assessment date, benchmark age at
assessment and training start, and training-window days. This context and the
assessment remain in the generation snapshot and v6 backups. No fixed universal
benchmark expiry, physiological impossibility formula or new database is added.
Historical outputs without assessment remain readable; new live outputs missing
assessment, conflicting with outcome, or containing unsupported actions fail
validation before workout/rest creation. Usage is still settled for charged
clarifications or invalid results.

`tests/plan-assessment.test.mjs` covers date context, contradictory decisions,
missing assessment, allowed edit actions, unchanged inputs and snapshot validation.
The planner Worker suite tests clarification with `saveImmediately: true`, empty
workout/rest storage, input preservation, field links and blocked acceptance.
Development-only setup previews support `scenario=goal-adjustment` and
`scenario=benchmark-refresh`; both are explicitly synthetic, never call OpenAI
and are unavailable in production. Browser QA verifies correct field focus and
that editing clears the old assessment while retaining the other answers.

These are control-flow checks, not evidence that the model will consistently
judge feasibility correctly. Before enabling live mode, evaluate actual responses
for a conservative matched goal, a novice 35-minute 5K benchmark seeking 15 minutes
in 12 weeks, an old/unrepresentative benchmark, and 10K/half-marathon benchmark
uncertainty. Record decision, explanation, paces/progression and actual usage.
No paid model evaluation was performed in Stage 4; Stage 6 results are recorded separately above.

## Stage 3 live-request controls (2026-10-31)

The current product contract is `PHASE_1_REQUIREMENTS.md`: the benchmark v4
intake generates, validates and automatically saves a training block. Starting training
remains explicit. The historical review/accept routes below remain compatible.

- Only exact model `gpt-6-luna` is accepted by the runtime, request adapter and
  storage boundary. No retries, upgrades or provider fallback are implemented.
- Global application allowance is $4/month UTC, leaving $1 below Hieu's $5
  Platform hard limit. This is an application estimate, not the provider invoice
  or a guarantee of exact billing. Platform limits also cover other project use.
- Reserve $0.025 atomically before dispatch; the configured 60,000 input-token
  bound and 30,000 maximum output tokens cost at most $0.021 at the recorded
  standard rates ($0.10/$0.50 per million input/output tokens). Request bytes
  plus an overhead allowance conservatively gate input size. No paid tools are
  enabled. Pricing version is recorded; revise the policy if provider rates change.
- At most 10 attempts per account/day UTC; existing cooldown and concurrent
  generation guards apply. All accounts share the one application budget.
- Migration 0008 adds `training_ai_usage` to the existing database. It stores
  operational IDs, times, model, pricing version, token counts, estimated charges
  and outcome codes only. It contains no fitness inputs, prompts or secrets.
- Usage is captured before output validation. Refusals, incomplete responses and
  invalid schedules can still be charged. Confirmed request rejections record
  zero; timeout, malformed response, missing usage or interrupted settlement
  retain a full reservation. Outstanding uncertainty carries into future months
  until reconciled by the operator against Platform usage; there is no automatic
  refund or reset of an uncertain attempt. Cross-month settlements count in both
  potentially billed months conservatively.
- Attempts survive block deletion, intake edits and retries. Training backup v6
  remains unchanged: restoring training data never restores or refunds the live
  operational ledger. Back up the database itself for operational disaster
  recovery. No new database instance or historical data conversion is required.
- Authentication, model access, provider billing/spend limits, rate limiting,
  timeout, incomplete output, invalid output and app limits have safe distinct
  messages. Provider error bodies are never returned or persisted.
- `tests/planner-budget-integration.mjs` verifies global budget concurrency,
  denied-request immutability, deletion/edit persistence, prior-month uncertainty,
  paid-invalid-output accounting, automatic-save retries, daily limits and atomic
  rollback when accounting storage fails. Fake transports deny external traffic.

Hosted runtime was switched to live mode after the initial synthetic evaluation
and manual secret entry. Its first successful hosted plan trial remains pending.
A local API key does not configure the Worker. Required live settings: `TRAINING_PLANNER_MODE=openai`,
`OPENAI_PLAN_MODEL=gpt-6-luna`, and secret `OPENAI_API_KEY`. Never commit an env file
or put a credential into a training backup or hosting manifest.

### Live planning evaluation before enabling the generator

Use Hieu's explicitly confirmed current intake and achieved benchmark for the personal live trial; do not
reuse old chat fitness numbers. Record actual tokens, estimated cost, latency,
prompt version and whether every schedule passes validation. Manually review:

1. Correct 5K, race/start dates, selected weekdays, partial weeks and numeric units.
2. Coherent easy/quality/long sessions, recovery and taper across the full block.
3. Numeric paces informed by the supplied confirmed result, with its date and
   distance acknowledged; no invented current workload or guarantee of the goal.
4. Candid goal assessment and useful assumptions/effort cues, particularly for
   ambitious targets and short windows. Clarifications must reference inputs the
   current form can actually change; do not reintroduce deferred questionnaire fields.
5. Automatic saving, reopen, result logging and explicit Start training operate
   correctly without another generation request. Failure preserves the intake.

Software checks cannot establish coaching quality; the initial synthetic live batch is a limited observation, not broad validation. Use an offline synthetic case
matrix (novice/intermediate/advanced, short/long windows, three/five/seven selected
days, conservative/ambitious goals) for fixture coverage; paid comparisons or live
runs remain bounded and explicit. No live evaluation has been performed by these
tests and no broader race support is implied.

## Run

With the existing project dependencies installed:

```sh
npm run test:planner
```

This tests the numeric intake/schedule contract and the OpenAI request/response
adapter using an injected fake transport. Every adapter test supplies that
transport; it never calls the default network transport. Failed requests must
call the one configured model exactly once. No automatic retry or fallback model
is implemented.

For the full API/storage flow, build the current source first using the project's
normal build workflow, then run:

```sh
npm run test:planner:integration
```

The runner loads the compiled production Worker into Miniflare. It creates
in-memory, disposable D1 databases and applies migrations there. Provider
responses are intercepted; unmatched external network requests are disabled.
Only a deliberately invalid synthetic credential and a test model identifier are
bound to the configured Worker. A second Worker omits both configuration values
to verify that missing configuration leaves the saved intake unchanged.
No local env files, hosted settings, imported workbook, or live database are read.

## Sample inputs and responses

`tests/planner-fixture.mjs` creates a synthetic existing-runner intake: a 5K four
weeks away, 12 miles/week, a recent longest run of 5 miles, three running days,
and a 60-minute session limit. Optional body measurements are unknown. These
values are test data and do not represent the account owner's fitness.

The response factory builds a deliberately simple schedule in the same structure
expected from OpenAI. Tests edit it to create missing/duplicate dates, invalid
numeric types, session-limit violations, inconsistent paces, clarification,
refusal and incomplete-response cases. This factory is imported only by test
files; it is never an alternative production plan generator.

## Coverage and limits

- Required intake and first-release scope checks; no fabricated baseline.
- Exact dates, selected weekdays, race-day exception, time limits and arithmetic.
- Race measurements exclude warm-up/cooldown, which still count toward limits.
- No numeric training pace in effort mode; unknown measurements remain null.
- Provider errors, refusal, incomplete output, malformed output, and timeout.
- Exactly one configured model per call; no fallback or automatic retry.
- Authentication, ownership, stale versions and competing generation requests.
- Saved draft reload without regeneration; no schedule before acceptance.
- Atomic acceptance, repeat acceptance without duplicate records, explicit rest.
- Result logging versus confirmed changes to a generated prescription.
- Accepted snapshot preservation, activation, v5 export and isolated restore.

The harness verifies application behavior. It does not measure model quality,
medical/training appropriateness, actual API latency/cost, account access, or
browser interactions. Live model evaluation remains a separate, explicitly
configured step. This test work does not configure or deploy the paid service.

## Deployed simulation mode

`TRAINING_PLANNER_MODE=simulation` enables the labeled, deterministic example
provider in `lib/simulated-plan.ts`. It uses the normal authenticated generation,
review, acceptance and backup operations, without calling OpenAI or reading API
credentials. It is deliberately separate from the test fixture factory above.
The example uses selected dates/days and up to 30 minutes per session, and does
not assess fitness or target-time feasibility. Its race segment is fixed at
30 minutes; shorter race-day time limits yield clarification instead of a plan.

Simulation provenance (`generation.provider = simulation`) survives reload,
acceptance and backup/restore. Individual saved workout instructions also carry
SIMULATION labels. Simulated blocks stay drafts and cannot be activated; manual
and previously accepted real plans keep their existing behavior.

Missing/unknown mode is disabled. Live requests require an explicit
`TRAINING_PLANNER_MODE=openai` plus both `OPENAI_API_KEY` and `OPENAI_PLAN_MODEL`.
Client-supplied mode/model fields are ignored. Changing mode is an operator action;
a failed request never switches provider or upgrades the model automatically.

The optional provider field is additive within backup v5; older generation
snapshots without it remain readable. The 0005 migration adds a nullable plan
JSON column and alteration triggers without rewriting historical rows. Retain
this generation-aware reader, backup support and guards in any code rollback.
