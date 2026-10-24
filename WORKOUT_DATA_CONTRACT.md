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
| `plannedPaceSecondsPerMile` | `planned_pace_seconds_per_mile` | Numeric seconds/mile, greater than zero, maximum 86,400 |
| `actualPaceSecondsPerMile` | `actual_pace_seconds_per_mile` | Numeric seconds/mile, greater than zero, maximum 86,400 |

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

Migration `0004_structured_workout_paces.sql` adds the two nullable pace fields.
Pace accepts fractional canonical seconds so converting a whole seconds/km entry
does not lose precision. Duration remains whole seconds. API validation and column
CHECK constraints reject nonnumeric/out-of-range paces. Preserve these hand-written
column checks if a future migration rebuilds workouts; the snapshot does not model
the inline SQL checks. Existing four rest/workout exclusivity triggers also remain.
Each pace field may be supplied/cleared independently. Old PATCH clients omitting
these fields preserve them. Original `targetPace` and `actualPace` text remains
available and is never automatically parsed or removed.

## Structured workout form

Agent 2's form in `components/WorkoutEditor.tsx` uses provider-independent parsing
and linked calculations in `lib/workout-form.ts`. Running Plan has distance,
single pace, and duration. The two most recently entered valid values calculate
the third. Calculations pause on incomplete/invalid values; they never fill actual
results. A calculated value is labeled and remains editable. Original imported
guidance is displayed separately. Unknown fields stay blank/null; actual distance
and duration allow a known zero, whereas targets and pace must be positive.

The form preserves an existing `targetMetric`. For a new target, a distance derived
from pace/duration uses duration as the comparison metric; otherwise it uses distance.
If the saved primary value is cleared, the remaining distance/duration supplies the
criterion. Strength/mobility exposes duration only and does not calculate run miles.
Unit changes are presentation-only and preserve canonical values. Unchanged numeric
fields are not rewritten by unrelated notes/completion edits. Instructions are
optional in the UI; a blank description gets a short type/target label for existing
API compatibility. No input field requires parsing a legacy description.

Offline `lib/distance-conversion.ts` produces review proposals only. It is not
called by application reads, saves, or migrations. Historical conversion requires
review and a later owned/version-checked update; it is not part of this migration.

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

All new account and block exports use `{schemaVersion: 4, exportedAt, blocks,
workouts, restDays}`. A block export has exactly one block and only its records.
Version 4 includes numeric pace fields as well as rest designations and measurements.
The offline normalizer still accepts v1 (`plan`), v2 (`blocks`), and v3 backups.
Older backups gain null numeric paces; v1/v2 gain null measurements and an empty
rest list. Version 4 requires every measurement field and the rest list explicitly.
Backup normalization does not write data or grant ownership.

The migration adds columns and an empty table without updating existing rows,
versions, or source data. It never marks historical empty dates as rest. Migrations
apply before Worker publication. A failed publication may leave the additive
migration applied; retry compatible code rather than dropping fields or records.
Once structured targets/rest records are saved, retain this release's backup and
schedule guards in a code rollback so those records remain protected/exportable.

Plan generation remains separate work. Progress Overview consumes the structured
measurements; target comparisons continue to use distance/duration rather than pace.
