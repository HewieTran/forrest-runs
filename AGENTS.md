# Forrest Runs development coordination

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
