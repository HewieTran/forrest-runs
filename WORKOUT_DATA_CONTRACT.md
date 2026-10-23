# Shared workout data — Agent 2 foundation

Assigned by Hieu on 2026-10-23. This is the shared contract for workout forms,
the plan generator, and Progress Overview. See `AGENTS.md` for coordination.

## Measurements

`workouts` keeps its existing IDs, block foreign key, descriptions, actual
distance, completion flag, source values, timestamps, and optimistic version.
Migration `0003_workout_measurements_and_rest_days.sql` adds nullable fields:

| API / TypeScript field | Database column | Canonical value |
| --- | --- | --- |
| `plannedDistance` | `planned_distance` | Miles, greater than zero, maximum 1,000 |
| `plannedDurationSeconds` | `planned_duration_seconds` | Whole seconds, greater than zero, maximum 604,800 |
| `actualDurationSeconds` | `actual_duration_seconds` | Whole seconds, zero allowed, maximum 604,800 |
| `targetMetric` | `target_metric` | `distance`, `duration`, or null |

- `actualDistance` already stores miles. Convert kilometers at form/generator
  boundaries; never store a displayed kilometer value as canonical miles.
- Send all three planned fields together. A selected metric requires its numeric
  target. Both planned values may be present, but `targetMetric` explicitly picks
  the one used for calendar comparison. Pace/effort is not part of this decision.
- Send all three planned fields as null to clear the structured target. Null
  means unknown, not zero. An actual duration of zero is a known result.
- Existing POST/PATCH routes accept the added fields. Old clients can omit them;
  PATCH preserves omitted fields. Creation fills omissions with null. The
  `actualDurationSeconds` field may be supplied/cleared independently.
- `plannedWorkout` and `targetPace` remain descriptive text. Do not parse them to
  create numeric targets. Imported history remains unknown until explicitly set.
- Editing completion/results does not imply that the target was met. A later
  progress reader compares the chosen metric only when the workout is completed
  and both the planned value and corresponding actual result are known.

## Explicit rest days

Rest is stored in `training_rest_days`, separately from workouts. Records expose
`id`, `planId`, `date`, `version`, and `updatedAt`. IDs are server-generated;
the foreign key uses the existing owned training block. A unique `(plan_id,
date)` index prevents duplicate designations and supports calendar-range reads.

- A date can hold multiple workouts or one rest designation, never both.
- An empty date is **unscheduled**, not automatically rest or a missed workout.
- `GET /api/training?blockId=ID` returns `restDays` alongside workouts. Reads are
  scoped to the authenticated account and selected block, including across years.
- `POST /api/blocks/:id/rest-days` takes `{date: "YYYY-MM-DD"}`. It creates a rest
  designation only when the date has no workout/rest record and the block is
  writable. Supplied IDs, owners, versions, and parent references are ignored.
- `DELETE /api/blocks/:id/rest-days/:restId` takes `{version}`. A stale version or
  unavailable record returns 409. IDs change after deletion/recreation, protecting
  a newer designation from an older tab. Rest rows are otherwise immutable.
- Foreign/unknown blocks use the same 404. Unauthenticated writes return 401.
  Invalid input returns 400; schedule races/conflicts return 409.
- Guided setup and first schedule writes are mutually exclusive. Generation and
  activation remain deferred; the engine must eventually save its complete
  workout/rest schedule through a single reviewed storage operation.
- Rest records never contribute to workout completion totals or mileage.

Atomic storage conditions protect writes. Four hand-authored migration triggers
also prohibit workout/rest overlap for direct SQL and older deployed Workers.
Preserve/recreate these triggers if a future migration rebuilds either table.
Validation and types stay provider-independent; SQL stays in the storage adapter
and migrations. No calendar aggregates or provider-specific state are persisted.

## Backups and release boundaries

All new account and block exports use `{schemaVersion: 3, exportedAt, blocks,
workouts, restDays}`. A block export has exactly one block and only its records.
This version explicitly signals that restoring older formats would lose rest
designations. The offline normalizer still accepts v1 (`plan`) and v2 (`blocks`)
backups, filling new fields with null and rest records with an empty list.
Backup normalization does not write data or grant ownership.

The migration adds columns and an empty table without updating existing rows,
versions, or source data. It never marks historical empty dates as rest. Migrations
apply before Worker publication. A failed publication may leave the additive
migration applied; retry compatible code rather than dropping fields or records.
Once structured targets/rest records are saved, retain this release's backup and
schedule guards in a code rollback so those records remain protected/exportable.

This foundation does not add workout form controls, generate plans, or implement
Progress Overview. Existing forms retain their behavior. The small Tracker and
preview changes only initialize the newly required nullable fields in fixtures.
