# Forrest Runs development coordination

## GitHub pull requests

- Start each implementation change on a focused branch from the current GitHub
  `main`. Submit it through a pull request and leave merge to Hieu unless he
  explicitly authorizes it.
- Check the deployed source revision against GitHub before making release
  changes. Raise any drift and reconcile it in a separate pull request so
  unrelated changes stay out of feature reviews.
- Open the pull request before deploying a change to staging when practical.
  Record the verification and deployed revision in the pull request. Report
  review, merge, staging, and production status separately.

## Shared workout-data contract

Hieu assigned Agent 2 the workout-data foundation on 2026-10-23, before Progress
Overview implementation. The branch is `agent2/workout-data-contract`.

- Agent 2 owns this change to workout measurements, explicit rest days, schema,
  migrations, storage, validation, APIs, exports, backup normalization, and tests.
- Training-block and plan-generator work must consume the contract in
  `WORKOUT_DATA_CONTRACT.md`. Coordinate edits to shared files through the agent
  integrating the release; do not independently introduce replacement fields.
- Keep independent feature work in separate branches and working copies. A chat
  name does not establish a lock or reveal another chat's uncommitted work.
- Integrate, verify, and publish one release at a time. Check the latest shared
  main branch immediately before integration; preserve other agents' changes.
- The Progress Overview page and plan-generation behavior are separate work.

Agent 2 also owns the structured workout form release on
`agent2/structured-workout-form`: `WorkoutEditor.tsx`, numeric pace storage,
linked measurements/validation, and backup v4. Consume these fields through the
shared contract. Historical conversion is review-only until separately approved;
never add a description-parsing backfill to a schema migration or live read.

## Architecture and verification

- Preserve account/block ownership and optimistic concurrency checks. Database
  operations belong in `lib/store.ts`; request handlers handle authentication,
  input validation, and HTTP responses.
- Keep calculations and validation independent of hosting providers for a future
  AWS migration. Do not add direct database access to UI components.
- Append migrations; never rewrite applied SQL, snapshots, or journal entries.
- Unknown measurements remain null. Do not infer targets by parsing descriptions
  or infer rest from the absence of a workout.
- Run the relevant domain/backup/migration tests, TypeScript, a production build,
  and the disposable Worker integration suite for shared storage/API changes.

## Phase 1 integration on 2026-10-27

Hieu authorized the simplified intake, UI and completion behavior as one integrated
release. `PHASE_1_REQUIREMENTS.md` is the current product baseline and supersedes
older intake/review requirements. The integrating agent owns this release's shared
form/schema changes; do not introduce competing fields or parallel releases.
Preserve all legacy snapshots and existing records. Backups now export v6.

On 2026-10-31 Hieu approved restoring one confirmed performance benchmark in
Runner before Stage 4. The updated PHASE_1_REQUIREMENTS.md and intake v4 contract
define new generation; other deferred inputs and the automatic-save flow stay as-is.

Generator Stage 4 adds structured goal assessment and calendar benchmark age
context in existing generation JSON. New live plans must pass the assessment
contract before automatic save; clarifications contain no schedule. Do not infer
physiological impossibility from a fixed threshold, change input goals silently,
or restore deferred fields. See PLANNER_TESTING.md for the distinction between
synthetic control-flow tests and the outstanding real-model quality evaluation.

Stage 6 recorded four real Luna responses for invented runner profiles in
`evals/stage6-results.json`; PLANNER_EVALUATION.md contains results and open release
gates. Never rerun paid cases or delete their reservation journal implicitly.
The evaluation CLI defaults to dry-run; the recorded-output Worker replay is
network-isolated. Hosted configuration is deployed in live mode; a complete successful personal
trial remains pending.

Hieu approved app-calculated measurements (option 1) after hosted arithmetic
failures. Consume the pair-only provider contract in lib/planner-math.ts and
WORKOUT_DATA_CONTRACT.md: the app derives distance for running steps and pace for
an exact 5K race. Never silently repair/recalculate old three-number snapshots or
relax schedule/goal checks. New snapshots carry calculationVersion provenance.

On 2026-11-04 Hieu approved visible structured workout steps in Plan, concise
headers, readable units and step-driven totals. The integrating agent owns this
focused form/storage release. Consume optional planStructure and the read-only
source fallback in lib/workout-structure.ts; preserve original generation/source
snapshots, race-only progress targets, legacy linked forms and migration 0009's
prescription-change trigger. See WORKOUT_DATA_CONTRACT.md before shared edits.
