# Training Block intake v2

This release implements the revised five-step intake. It does not call OpenAI,
generate or activate a schedule, or modify existing workouts/rest days.

## Inputs and completion

- Goal: 5K first; finish comfortably or target time. A target time is required
  only for a time goal. The new form prefills today's start date. A blank block
  name is given a deterministic suggestion; a race date is still needed to save
  a persisted draft because the block's existing race date is non-null.
- Runner: experience, age, height, weight and VO2 are optional. When VO2 is
  enabled, its value, source and date must be completed before finishing setup.
- Starting fitness: average weekly distance and longest run in the past four
  weeks, current running days/week, and an explicit response about training
  interruptions/limitations. Changed training requires brief notes. Unsure is
  preserved as unsure, not interpreted as cleared for training.
- Pace guidance is independent of target finish time. Performance-based paces
  require a dated race/time trial; effort-based guidance requires no benchmark.
  The existing three benchmark distances are presented through Add result rather
  than three mandatory sections. Additional distance types remain future work.
- Availability: selected days mean the requested weekly sessions, not a pool of
  all potentially available days. Default full-session duration is required;
  day overrides, preferred longer-session day, and other exercise are optional.
- Saved completion means the input contract is complete, never that a goal is
  feasible or that training is appropriate. Generation must handle unknowns,
  limitations, benchmark age, conflicts and unsupported runner situations.

## Storage and compatibility

The existing training_plans.setup JSON column stores either schemaVersion 1 or
2. No SQL migration or bulk conversion is needed. validateSetup preserves v1
snapshots, including during export/restore. setupForEditing creates an in-memory
v2 view, preserving old values and leaving newly introduced answers null/empty.
Only an explicit save writes that upgraded snapshot. A v1 write cannot replace
an existing v2 snapshot, even if a caller supplies its current record version.

Current backup envelope v4 remains; the nested setup version identifies its
shape. Both setup versions are accepted by this release. A code rollback must
retain the v2 reader/validator so newly saved intake does not become unreadable.

Owner checks, draft-only saves, optimistic versions, and atomic exclusion of
setup versus existing workout/rest schedules remain in the storage layer.
Schedule generation/acceptance will later need a separate operation and
lifecycle state; do not clear setup merely to bypass the current activation gate.

## Units and engine boundary

Setup preserves displayed mi/km, lb/kg and inches/cm with explicit unit choice.
Default/override session limits are integer seconds. Result and target time
strings are validated by the same parser as workout durations; m:ss is normalized
to h:mm:ss before parsing. plannerIntake produces numeric duration seconds,
distance meters for race/results, and miles for weekly/long-run distance to match
WORKOUT_DATA_CONTRACT.md. Optional body values convert to cm/kg. Null is unknown,
not zero. This boundary is independent of OpenAI and the hosting provider.

## Recorded-history suggestions

recentSetupBaseline reads only the authenticated account's completed runs across
its own blocks in the previous 28 days (excluding today). It withholds a
suggestion for a week with no recorded runs or a run missing actual distance.
Summary uses recorded actual distance only and distinct running days, rounded
to the nearest average days/week. Four represented weeks do not establish log
completeness; the UI explicitly asks the user to confirm coverage before applying
all three suggested values. This read never modifies source history.

## Next stage

Generation provenance, model/prompt versions, structured interval steps,
feasibility checks and acceptance are not implemented here. Preserve a reviewed
input/output snapshot and use the shared workout measurement contract when
implementing them. No user baseline is sent to an AI provider by this release.

## Simulation follow-on

The simulation release adds a separate generation/review page after intake save.
Generation provenance and accepted snapshots use the additive nullable
training_plans.generation column (migration 0005), with v5 exports preserving it.
See PLANNER_TESTING.md for simulation scope, explicit provider configuration,
acceptance, activation restrictions, and rollback compatibility. The original
intake remains saved and the production simulation never sends it to OpenAI.

## Simplified Phase 1 intake v3

`PHASE_1_REQUIREMENTS.md` supersedes earlier UI scope. New editable intake uses
schemaVersion 3: Goal, Runner, Training days, Review. Required runner experience,
age, height, weight, units; 5K, start/race dates, numeric targetDurationSeconds,
selected weekdays. Optional name. goal.mode=time, paceGuidance=estimated;
legacy targetTime is blank. Historical/deferred answers remain preserved but are
excluded from canonical planner inputs. v1/v2 snapshots remain readable unchanged;
explicit editing upgrades to v3 and version guards reject downgrades. Generation
requires an adult and a 2–26 week future/current training window. The UI submits
saveImmediately=true; validated output is committed with the existing atomic
acceptance transaction, without a second review step. Accepted retry is idempotent.
The old review/accept endpoints remain for compatibility and recovery only.

## Confirmed benchmark intake v4 (2026-10-31)

Hieu approved one required benchmark inside Runner before Stage 4. New editing
uses setup schemaVersion 4 with `benchmark = {distance, durationSeconds, date,
effortConfirmed}`. Distance is null/5k/10k/half, duration is positive whole seconds
or null, date is blank or a valid past/current date, confirmation is boolean and
defaults false. Partial valid answers can be saved; generation requires all four.
No SQL migration, new table, bulk conversion, additional tab or review step.

Canonical planner input version 2 carries exactly this confirmed result in
baseline.results (meters/seconds/date/source). Race or best-effort time trial is
confirmed collectively; no uncollected race-versus-trial classification is
invented. Other deferred workload and availability fields remain unknown and
excluded. Numeric running targets are required; 10K/half benchmarks do not expand
the generated race beyond 5K. Simulation retains example labels and uses generic
demo paces, not benchmark-calibrated coaching.

Older setup versions remain readable without conversion or altered generation
snapshots. Editing a draft upgrades explicitly with an empty, unconfirmed
benchmark; past results are not silently selected. Older clients must reopen the
Runner setup before a new generation. Exports retain envelope v6 and include the
nested v4 setup. Freshness and feasibility handling are deferred to Stage 4.
