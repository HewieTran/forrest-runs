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
