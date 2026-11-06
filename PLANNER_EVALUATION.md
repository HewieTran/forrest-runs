# Stage 6 evaluation — 2026-10-31 (America/Chicago)

Status: initial live-model evaluation passed. The hosted app is owner-private
and now configured for Luna live mode; a complete successful hosted trial remains
incomplete. See the configuration update and remaining gates below.

## Live API observations

Four requests used the existing dedicated Forrest Runs local key and exact model
`gpt-6-luna`, with `store: false`, low reasoning, no tools, no automatic retries
and no model upgrade. All runner profiles were invented for evaluation. No user
account, real training record or personal benchmark was read or changed.

Prompt: `5k-coach-v5-assessment`. Validator: `5k-v4-assessment`.
The full synthetic intake, validated output, response metadata, token counts and
request timing are recorded in `evals/stage6-results.json`.

| Synthetic case | Observed outcome | Sessions | Latency | Input / output tokens | Estimated USD |
| --- | --- | ---: | ---: | ---: | ---: |
| Intermediate, recent 30:00 5K → 29:30 in 8 weeks, 3 days/week | proceed | 25 | 54.064s | 2,928 / 6,438 | 0.003512 |
| Novice, recent 35:00 5K → 15:00 in 12 weeks | adjust_goal | 0 | 6.205s | 3,459 / 489 | 0.000591 |
| Intermediate, approximately six-year-old 30:00 5K → 29:30 | refresh_benchmark | 0 | 4.138s | 2,930 / 319 | 0.000453 |
| Intermediate, recent 2:15 half-marathon → 29:30 5K in 8 weeks | proceed | 25 | 33.051s | 2,930 / 4,017 | 0.002302 |
| **Total** | **4 expected decisions** | **50** | | **12,247 / 11,263** | **0.006858** |

Estimates use the app's conservative standard rates, with every input token
counted at the uncached rate; per-request rounding is upward. These are not a
provider invoice. Official Luna rates checked against
https://developers.openai.com/api/docs/models/gpt-6-luna on 2026-10-31.
The evaluation limit was $0.10 total. This local evaluation is separate from the
hosted operational usage ledger and consumes part of the existing $1 buffer
between the $4 app allowance and Hieu's $5 Platform limit.

## Manual review of these outputs

- Both schedules matched the exact manifest and had one 5K race on its required
  date, with positive numeric distance/pace/duration and valid arithmetic.
- Easy pace differed from benchmark race pace: 650 seconds/mile for the 30-minute
  5K case, 720 seconds/mile for the half-marathon case. The goal was not used as
  an easy pace or asserted as an achieved result.
- Each full week had one controlled quality session, explicit warmup/cooldown,
  easy running and a longer easy run. Quality days had intervening rest days.
- The 5K case's first full week totaled 100 minutes, peaking at 124 minutes before
  reducing toward race week. The half-marathon case totaled 102 minutes in its
  first full week, peaking at 130 minutes, then reducing before the race.
- Both acknowledged unknown current workload, tentative paces and uncertain goal
  achievement. The half-marathon conversion was explicitly an estimate, not an
  achieved 5K. Race segments estimated 30:00 and 30:15 rather than promising 29:30.
- The unsupported goal response offered target-time/race-date edits, without
  suggesting that reported experience be changed. The stale benchmark response
  requested a newer result without claiming the goal was permanently impossible.

These observations support a limited staging trial, not broad validation of
coaching quality or suitability for an individual. Four one-shot cases cannot
measure reliability. Unknown recent workload remains a material limitation of the
agreed intake. No new workload fields or universal benchmark expiry were added.
A 10K benchmark, advanced runners, longer windows and other weekday patterns have
software fixture coverage but were not paid-model evaluations in this batch.

## Software and UI checks

- 76 unit tests passed, including evaluation reservation, stop conditions,
  uncertain charges, forbidden error-body persistence and no repeated dispatch.
- TypeScript and the production build passed.
- Planner and portable storage Worker suites passed against disposable D1 with
  outbound networking denied.
- `tests/live-plan-replay.mjs` replayed all four captured real outputs through the
  built production Worker with intercepted HTTP and synthetic owners. Both plans
  automatically saved, reloaded, resisted duplicate saves, and exported valid v6
  backups. Both blocked outputs retained the intake with zero workouts/rests.
- Desktop benchmark correction focused the right field and showed an inline
  error for an invalid benchmark time. The 390-pixel mobile setup preview showed
  the adjustment actions, focused the target-time field, and retained the other
  answers when the target was edited and Review reopened.
- Browser preview persistence is simulated. Save/reload and backup evidence comes
  from the Worker integration suites, not a hosted live browser transaction.
  A physical phone and the hosted paid end-to-end flow were not tested.

## Reproduce without spending

Run `npm run eval:planner` for the dry-run case list; it makes no API call and does
not read the key. Run all unit tests and TypeScript, then the Sites production
build helper. Run `npm run test:planner:integration`,
`node --experimental-strip-types tests/portable-worker.mjs`, and
`npm run test:planner:replay` after building. All three Worker suites intercept or
disable external networking. Replay rebases session dates for later test days;
it does not constitute another live-model evaluation.

Paid evaluation is only the explicit `--live` invocation of
`scripts/evaluate-planner.mjs`. Its journal is reserved before dispatch and locked
against concurrent runs. Dispatched IDs are never retried automatically; unknown
charges retain their reservation. Never delete the journal to force another paid
run. A different date/prompt requires review and a separately bounded batch.

## Hosted configuration update

Hieu entered the hosted key directly in ChatGPT Sites settings. The supported
manual path is Sites → Forrest Runs → More actions → Settings → hosted environment
variables/secrets, documented at https://learn.chatgpt.com/docs/sites/managing-a-site.
There is no need to expose a key through conversation or tool output.

The full replacement key was saved as a secret in environment revision 5.
`OPENAI_PLAN_MODEL=gpt-6-luna` and `TRAINING_PLANNER_MODE=openai` were redeployed;
seed entries, audience and existing training records were preserved. The earlier
401 credential rejection was followed by a hosted invalid-output failure. That
failure means the response did not pass validation; it does not establish that
the requested goal was too ambitious. The old implementation did not retain the
specific failed check, so it cannot be diagnosed retrospectively from its generic
message. Do not label it as a particular arithmetic/date/fitness failure without
evidence.

Validator `5k-v5-diagnostics` retains a safe failure category and reported usage,
separates generation errors from input errors, and clarifies old generic messages
on display. It does not alter the accepted schedule rules or auto-retry requests.
Its software tests and four recorded-output replays require no paid requests.
The initial live model results above still describe validator `5k-v4-assessment`.

## Remaining release gates

1. Complete generation using the runner's confirmed saved intake and achieved
   benchmark. Do not substitute earlier hypothetical examples or remembered
   health data. A technical validation failure does not justify changing a goal.
2. Verify the hosted signed-in Generate → automatic save → reopen → explicit
   Start training flow on desktop and mobile. Never mark local replay as a
   completed hosted live trial. If validation fails again, use the retained safe
   reason to investigate; do not disable the guard or retry automatically.

No database instance, migration, new runtime dependency, audience change or AWS
service was introduced. The evaluation runner and domain rules remain portable;
D1/auth/hosting integrations retain the existing migration boundary.

## Option 1 live calculation check — 2026-10-31

A separately bounded, one-request evaluation used the approved local development
key, Luna only, prompt `5k-coach-v6-calculated`, validator `5k-v6-calculated`, and
calculation version `duration-pace-v1`. The profile was invented: intermediate,
35 years, 70 inches, 175 lb, a confirmed recent 30:00 5K, 29:30 target, a 120-day
window, and Tuesday/Thursday/Saturday running days with a Sunday race exception.
It was not Hieu's personal intake and did not write to the hosted database.

The request completed in 55.629 seconds with 4,338 input and 6,656 output tokens.
Estimated cost was $0.003762 under a $0.025 cap. One request was dispatched, with
no automatic retry or model upgrade. The complete synthetic result is recorded
in `evals/calculated-plan-results.json`; never reset it to repeat a paid test.

The model returned `proceed` and 53 sessions. The app derived all non-race
distances from duration/pace, fixed the race at exactly 5K and derived its pace
from the estimated race duration. All canonical measurements, schedule dates,
coverage, positive targets, session limits and assessment checks passed. The
response acknowledged unknown current workload and uncertainty about the goal.
This is one live observation of the new contract, not broad coaching validation.

86 unit tests, TypeScript, the production build, planner/storage Worker suites,
and five captured-output replays cover the release. The new live case also passes
production Worker automatic saving, reload, idempotency and v6 backup checks in a
disposable database. The original four captures are explicitly adapted to the
new pair-only wire format during replay; their source JSON is unchanged.
Historical plan snapshots are never recalculated. Hosted key/model configuration
is preserved; the runner's successful hosted personal trial remains pending.
