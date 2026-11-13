# Forrest Runs Phase 1

Product owner: Hieu. Agreed UI and behavior baseline, 2026-10-27.

## Scope and flow

- Keep the existing app and training history. New generated plans support 5K, 10K, half marathon and full marathon.
- Goal → Runner → Training days → Intake summary → Generate plan → Open saved block.
- No Starting Fitness step, pace-guidance selector, manual-create button or second schedule approval.
- Generate validates and saves the schedule. Failures preserve the intake; retry reuses a validated result when possible.
- New live running steps use AI-selected duration and pace, with distance
  calculated by the app. The race uses the exact selected distance, with pace calculated from the
  AI-estimated race duration. No independently generated third measurement,
  silent historical recalculation or automatic repair request.
- Numeric distance, pace and duration for generated running workouts. Paces are estimates; a goal time is not a measured fitness result.
- Free simulations support development. They remain labeled examples and cannot start training. Live generation uses the configured approved model; no automatic model upgrade or provider fallback.

## Intake fields

| Required | Optional | Deferred |
| --- | --- | --- |
| Experience: novice, intermediate or advanced; age; height; weight; units | Block name, suggested if blank | Mileage, longest run, frequency, VO2, interruptions, long-run preference, session limits, other activities |
| Supported race distance; target finish time; start date; race date; selected weekdays | | |
| One benchmark: 5K, 10K, half marathon or full marathon; achieved finish time; date achieved; confirmation it was a race or best-effort time trial | | |

Benchmark addition approved 2026-10-31. Keep the four tabs; place one benchmark
section in Runner and show it in Review. Incomplete benchmark drafts can be saved;
all four answers are required before new generation. Finish time is numeric
seconds, dates must be valid and on/before today, and effort confirmation starts
unchecked. Benchmarks inform pace estimates separately from the desired goal.
Stage 4 records benchmark age at generation and at training start. Freshness is a
contextual judgment, with no universal expiry threshold. The model must explain
when an old or unrepresentative result needs refreshing.

## Stage 4 goal assessment

- New live responses require a structured decision: proceed, adjust_goal,
  refresh_benchmark or clarify. This is a conservative planning judgment, not a
  guarantee of a finish time or a medical/physiological impossibility test.
- Unsupported goals return specific questions and no sessions. Offer edits to
  target time, race date, benchmark or training days as relevant. Never suggest
  changing reported experience to qualify, silently change an input, or guarantee
  that a later date makes a goal achievable. The draft remains saved.
- Show the supported training window on Goal. When dates fall outside it, allow
  saving the draft and direct the runner to the dates before generation.
- A shorter race or time trial can support a tentative planning target when the
  available schedule and experience support a gradual build. Review labels both
  distances and only compares elapsed times directly at the same distance.
- On Review, an unsupported goal can show a more conservative estimated finish
  time for the existing schedule and/or a specific schedule for the existing
  target. For extra calendar days, prefer an earlier start that is still today
  or later and within the planner window. Otherwise offer a later race date as
  an option for flexible dates. Apply pre-fills the changed fields and offers
  Undo until the draft is edited or saved. Only Generate requests another plan.
- The four-tab input summary and automatic save flow remain. Edit links open the
  relevant existing field. Repeating a blocked request requires editing inputs in
  the UI; API rate/budget limits also remain enforced server-side.
- Technical output-validation failures are generation errors, not evidence that
  a goal is too ambitious. Preserve the inputs, report a safe failed-check category
  when known, and allow a manual retry without requiring input changes.
- New live responses without a valid, consistent assessment fail closed before
  workout/rest creation. Unknown workload remains unknown; no deferred fields are
  restored. Historical snapshots remain readable.
- Calendar facts and assessment decisions are portable domain code. No new DB
  instance, schema migration, or hosting dependency is required. The existing
  generation JSON snapshot and backups retain the decision and date context.
- Simulation remains clearly labeled, uncalibrated and unstartable; it does not
  perform goal feasibility assessment. Synthetic provider tests verify control
  flow only. Real-model planning quality requires separate live evaluation.

Existing deferred answers and older snapshots remain readable and exportable. The generator excludes other deferred answers. Current generation limits: adults, 2–26 weeks, start today or later. The goal selects the race distance independently of the benchmark. A shorter benchmark does not establish endurance readiness for a half or full marathon; the planner can ask for clarification if the evidence cannot support a conservative plan.

## Tracking and status

- Draft for incomplete setup; Not started after generation; explicit Start training → In progress. One block in progress per account. Complete explicitly; Archive in settings.
- Each workout has a quick completion checkbox. Checking copies missing actuals from known numeric targets and preserves recorded values, including zero. For a run with recorded distance and duration, the summary calculates a blank or plan-copied pace from those results.
- Unchecking clears untouched copied results. Manually entered or edited results, including edits that equal the plan, survive. Results remain editable.
- Phase may be Not applicable. Effort, pain and notes are optional. Strength and mobility accept optional manual distance, pace, and duration. Completion can copy duration from the plan.
- Gear links open block settings. Archive/Delete live there. Race date is read-only in the tracker; View progress is prominent.
- Keep workout add/edit/reschedule, explicit rest days, progress, mileage, calendar, milestones and backup export.

## Data and architecture

An account owns blocks; workouts and explicit rest records belong to a block. Account identity comes from sign-in. Tables: training_plans, workouts, training_rest_days, training_account_state.

Store distance in miles, duration in seconds, pace in seconds per mile, and target finish time in seconds. Unknown stays null; recorded zero stays known. Keep planned values separate from actuals, with copied-result provenance. Backup v6 includes provenance; v1–v5 remain readable.

Follow Hieu's requirements and UI. Collaborate on changes before expanding scope. Keep ownership and concurrency enforced on the server. Keep domain rules independent of UI, identity, database and hosting for AWS migration; address material migration impacts before implementation. Use additive migrations and preserve history.

## Future phases

Other race distances; richer fitness/performance inputs; adaptive plans; wearable/Strava imports; native mobile app; AWS deployment and separate environments. Each needs a separate scope decision.
