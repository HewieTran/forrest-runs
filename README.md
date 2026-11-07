# Forrest Runs

A private, browser-based running training log. Phase 1 imports the Dashboard and Workout Tracker sheets, supports editing and rescheduling workouts, records actual results, and calculates progress and milestones.

Generated workouts now show concise headers, visible step rows, readable durations
and paces, and calculated totals. Edit steps updates the prescription separately
from its immutable original snapshot. Existing unmodified generated records use
their retained source steps without regeneration; text-only history keeps visible
instructions and the linked measurement form. See WORKOUT_DATA_CONTRACT.md for
migration 0009, optional backup v6 structure and race-target behavior. The mobile
layout is captured in [docs/workout-steps-mobile.jpg](docs/workout-steps-mobile.jpg).

The 2026-11-04 release passed 92 unit tests, TypeScript, the production build,
planner and portable Worker integration suites, and five network-isolated captured
response replays. Disposable storage tests cover step edits, save/reload, ownership,
confirmation, concurrency, immutable snapshots and backup restoration. Browser QA
checked desktop/mobile display, invalid edits, calculated totals and kilometer
formatting with synthetic data. No paid model calls were made for this release;
this does not establish a successful hosted personal generation or coaching quality.

## Stack

React and TypeScript; responsive CSS; Vinext and Cloudflare Workers; D1 with Drizzle migrations; Sites-managed ChatGPT sign-in. A signed-in user can own multiple training blocks, with at most one active block. Every data operation checks account ownership and the selected block.

## Development

Use Node.js 22.13 or later. Install dependencies with the Sites plugin's install-dependencies helper, which selects the project's package manager and lockfile. Start development through the supported Sites preview workflow, or `npm run dev` in a portable local environment. Build through the Sites build helper. Run `node node_modules/typescript/bin/tsc --noEmit` and `node --experimental-strip-types --test tests/domain.test.mjs tests/migration.test.mjs tests/backups.test.mjs tests/block-policy.test.mjs tests/setup.test.mjs tests/workout-measurements.test.mjs` before publishing.

The Sites skill contains the complete managed preview, Git synchronization, packaging, and publication workflow. `.openai/hosting.json` retains the canonical Site identity and its DB binding. Never replace its project ID when continuing development.

After building, `node --experimental-strip-types tests/worker-integration.mjs` runs the deployed Worker code inside Miniflare without a preview server. It applies all migrations to a disposable D1 database and tests imports, authentication, account and block isolation, saving, rescheduling, version conflicts, active-block switches, concurrent first loads, export, isolated restore rehearsals, and production-only route boundaries. The test requires the ignored `.sites-runtime/training-import.env.json` generated from the workbook; no personal test fixture is checked into Git. `tests/api-local.mjs` is the shared request suite, not a stand-alone test against a hosted app. Never send its synthetic authentication headers to a hosted Site.

## Database changes

Edit `db/schema.ts`, run `npm run db:generate`, and commit new SQL migrations and metadata. Apply migrations to the local preview database separately; Sites applies pending migrations during publication. Applied migrations must not be rewritten. A code rollback does not undo database changes: prefer additive migrations and export data before any change that could alter existing records.

Stage 2's `0001_training_blocks.sql` removes the unique owner index, adds `status` with an `active` default for existing records, and adds an owner/listing index plus a unique partial index for one active block per owner. It does not rebuild tables, rewrite IDs, move workouts, or change recorded results. The existing workout foreign key and block/date index remain. All inserts after this stage must explicitly choose a validated status: `draft`, `active`, `completed`, or `archived`; the database enforces active uniqueness and TypeScript types constrain status values. There is no public status-write API in Stage 2.

Sites applies migrations before uploading Worker code. The pre-Stage-2 app remains compatible during that window because each existing account still has its original active block. Once multiple blocks exist, Stage 2 is the minimum safe code rollback target: the older app assumes one plan per account. Revert a faulty later feature onto this storage contract; do not restore the unique-owner index or delete extra blocks to make old code fit. If the deployment fails after migration, keep the migration and retry a compatible build.

## Training block storage contract

The physical tables remain `training_plans` and `workouts`; a block is a plan, and `workouts.plan_id` remains its foreign key. Legacy plan and workout IDs, imported source values, versions, notes, timestamps, and unknown-versus-zero distances are preserved.

- `GET /api/blocks` returns only the current account's block metadata and summary counts, ordered newest first then ID. It omits internal owner IDs and workout rows. Summaries use one grouped join with the existing owner and workout/block indexes; the UI sorts the active block first.
- `GET /api/training?blockId=ID` loads exactly that owned block. Unknown or foreign blocks return the same 404 and never trigger an import.
- Without `blockId`, reads select the active block or fall back to the oldest block by creation time and ID. New accounts start with an empty library. Only the configured owner can receive the initial spreadsheet import.
- `PATCH /api/training`, `POST /api/workouts`, and `PATCH /api/workouts/:id` accept `?blockId=ID`. The current UI pins every save to the block being viewed. Workout membership is enforced server-side, and existing version checks still reject stale edits. Supplied owner IDs, plan IDs, versions on creation, and import metadata cannot redirect a workout or forge source values.
- For backward compatibility, writes without `blockId` work while the account has exactly one block. With multiple blocks they return 409 and require a reload/selection, protecting older tabs from saving into a newly active block. Malformed or repeated block IDs return 400. All responses use private, non-cacheable data headers.

## Training block library and lifecycle (Stage 3)

`/` and `/blocks` show the block library. Search and status filters work on the loaded metadata; cards show workout completion, recorded running miles, the first scheduled workout date, and the target date. `/blocks/:id` opens the existing tracker for that block with its log, progress, milestones, settings, and status controls. Unavailable and foreign block URLs return the same 404. Full-page navigation retains the tracker's unsaved-edit warning.

`POST /api/blocks` accepts `{raceName, raceDate}` and always creates a manual draft with a server-generated ID and no workouts. It ignores supplied ownership, status, source metadata, and versions. The existing first-load import runs before the first draft is created, preserving legacy owner data even if creation is an account's first request. Manual drafts are for users to enter their own schedules; runner assessment and generated schedules belong to later stages.

`PATCH /api/blocks/:id` accepts `{status, version}` and permits these explicit transitions:

| Current status | Available next statuses |
| --- | --- |
| Draft | Active, archived |
| Active | Completed, archived |
| Completed | Archived |
| Archived | Draft |

Activation requires that the account has no active block. The UI explains which block must first be completed or archived; the API enforces this with a single conditional update in addition to the unique active-owner index. Competing activations cannot replace the current block or both succeed. Status and race-setting updates share the same plan version, so stale actions return 409. No automatic status changes depend on elapsed dates or workout progress.

Lifecycle actions only change block status, version, and updated time. They never modify workout rows, mark workouts done, or assert goal achievement. Archived blocks remain accessible through the library and exports, and can be moved back to drafts. Historical workout edits remain available for corrections. There is no delete endpoint. The confirmation dialogs explain each action; status changes are disabled while a workout has unsaved edits.

Stage 3 requires no new migration or dependency. Training operations continue through `lib/store.ts` using the independent app user contract. The status graph and input validation live in provider-independent `lib/blocks.ts`. Integration tests cover concurrent activations, stale settings/status versions, ownership, first-request creation, exact summary calculations, archived exports, page routing, and unchanged workout records across lifecycle transitions. `/preview?view=blocks` provides synthetic browser QA data only and remains unavailable in production.

## Guided block setup (Stage 4)

**Create training block** opens `/blocks/new` with five steps: goal, runner, starting fitness, availability, and review. **Manual block** retains Stage 3's name/date draft for users entering their own schedules. Existing empty manual drafts can also start guided setup; blocks with workouts keep their existing logs.

Guided setup now uses [intake v2](INTAKE_CONTRACT.md): 5K first, finish comfortably or a time goal, editable start date, and race date. Body measurements, experience, VO₂ max, and long-run preference are optional. Current four-week mileage, current running days/week, longest recent run, an interruption/limitation response, selected training days, and a full-session time limit are required to finish setup. Numeric pace guidance additionally requires a dated performance result; effort guidance does not. Day-specific time overrides and other exercise commitments are optional. Selected days are requested sessions, not merely availability.

Save draft requires a race date and suggests a block name when blank; other answers can remain incomplete. Invalid supplied values are rejected in both client and server validation. `/blocks/:id/setup` resumes saved inputs. v1 snapshots remain readable and exportable unchanged; an explicit edit/save upgrades to v2 with new answers left unknown. Existing workouts/rest days and activation guards are retained. Setup completion does not assess feasibility, call OpenAI, or generate workouts. Recorded-history suggestions use only the signed-in account's completed runs and require the user to review/apply the summary.
`POST /api/blocks` additionally accepts `{setup, complete?}`; creation stores the metadata and snapshot together. `GET /api/blocks/:id/setup` returns the owned block; `PUT` accepts `{setup, version, complete?}` and atomically updates its metadata, snapshot, and version. `complete: true` enforces required inputs. Only empty drafts can change setup. Conditional updates and inserts ensure that a simultaneous first workout and setup attachment cannot both succeed. Stale versions return 409, and foreign IDs share the unknown-ID response. Page boundaries decode an encoded block ID once; API route parameters are already decoded. The library returns only `hasSetup`, without downloading runner measurements for each card.

Migration `0002_guided_block_setup.sql` adds one nullable JSON text field, `training_plans.setup`. Its nested `schemaVersion` is 1. Existing blocks retain `NULL`; no IDs, workouts, results, or measurements are rewritten or fabricated. New backups include this optional snapshot, and the existing v1/v2 readers still accept older files without it. Tests rehearse exact snapshot recovery in isolated D1. Keep backups private because snapshots contain runner information.

Once guided drafts exist, retain Stage 4's activation and workout-write guards in any code rollback: older code would treat those drafts as manual blocks. The additive migration can remain applied if publication fails. Validation and unit conversion live in provider-independent `lib/setup.ts`; database operations remain in `lib/store.ts`, preserving the existing AWS migration boundary. There is no new dependency or external paid service.

Tests cover partial saves, required benchmarks, optional VO₂, units, invalid values, ownership, conflicting writes, attachment/workout races, archived snapshots, export/restore, and encoded nested page links. `/preview?view=setup` uses synthetic values for browser QA and remains unavailable in production.

## Portability boundaries (Stage 2.1)

`lib/user.ts` defines the app's user contract. `lib/auth.ts` adapts the existing Sites sign-in helpers to that contract, passing the provider's stable user ID through unchanged. Storage and API code use the app contract. A future AWS sign-in provider must map new identities to existing owner IDs; email is not an ownership key. The configured email check for the private initial spreadsheet import is a separate eligibility check.

`lib/store.ts` owns training reads and writes, including race settings. API routes authenticate, validate requests, and translate results into HTTP responses. Training storage's Cloudflare environment access and the atomic first-load import live in `db/index.ts` and `db/initial-training.ts`. The SQL, batch boundaries, IDs, and number of database operations remain the same after this extraction.

This is preparation for a future move, not an AWS implementation. The D1 Drizzle driver, SQLite schema/migrations, batch semantics, Worker entrypoint, and hosting configuration still require review for the chosen AWS architecture. No database migration or dependency change is needed for Stage 2.1.

## Initial spreadsheet import

`tools/import-workbook.py INPUT.xlsx .sites-runtime/training-import.json` reads only Dashboard and Workout Tracker. The generated files are private runtime inputs and are ignored by Git. It preserves source row values alongside normalized fields. Unknown distance stays null; a recorded zero remains zero.

Set the generated gzip/base64 chunks as secret runtime variables `TRAINING_SEED_1`, `TRAINING_SEED_2`, etc., plus `TRAINING_SEED_OWNER` for the owner's verified sign-in email. The authenticated owner's first load imports the data in an atomic D1 batch. Subsequent loads read the database and never overwrite it from the seed. Other signed-in users get a separate empty plan, without access to the seed. Do not put spreadsheet files, seed data, secrets, or personal workout records into Git.

## Backup and recovery

Use **Export backup** in the header (`GET /api/export`) to download all owned blocks, workouts, and explicit rest days, including original import values, record versions, statuses, and timestamps. New exports use `{schemaVersion: 3, exportedAt, blocks, workouts, restDays}`. Both workout and rest-day `planId` values reference block IDs. Export uses three indexed queries in one database batch rather than one query per block. Keep this file private.

`GET /api/export?blockId=ID` exports the same v3 envelope with exactly one owned block. `normalizeTrainingBackup` in `lib/backups.ts` accepts old v1 files (`plan`; missing status becomes active), v2 files (`blocks`), and v3 files. Older backups gain null measurement fields and an empty rest-day list, without guessing historical values. The normalizer validates references, duplicate IDs/dates, workout/rest overlap, statuses, versions, and measurements. It preserves original source data and null/zero distinctions, strips untrusted owner fields, and performs no writes.

Restoring remains a maintenance operation, not a public import endpoint. Validate the file and record counts, independently verify the receiving account, assign ownership without rewriting record IDs or workout references, and rehearse in an isolated migrated database. The integration suite rehearses legacy normalization and v3 restoration in disposable D1 and compares every recovered field, including foreign-key integrity. Resolve any existing ID or active-status conflicts before a real restore. Never restore over live records without a fresh export and explicit approval.

Commit each coherent change and push it to the hosted Git repository. Each deployment is tied to an exact pushed commit and saved Site version. Recover code by reverting the faulty change and redeploying a known working build; retain compatible database migrations. Keep the GitHub code mirror synchronized with the same source changes, without private fixtures or records. Do not force-push over unrelated user work.

## Scope and calculations

Agent 2 owns the shared numeric-target and explicit-rest foundation assigned on 2026-10-23. See [WORKOUT_DATA_CONTRACT.md](WORKOUT_DATA_CONTRACT.md) for canonical units, API fields, legacy-save behavior, rest-day concurrency rules, backup versions, and release boundaries; [AGENTS.md](AGENTS.md) records shared-file coordination. Migration `0003_workout_measurements_and_rest_days.sql` is additive and never derives historical targets or rest days. Workout forms, plan generation, and Progress Overview consume this contract in separate feature work.

Overall completion includes future workouts. Through-yesterday completion uses dates before the current Central-time date. Recorded mileage includes completed running workouts with a numeric distance, excludes strength/mobility, and flags missing distances. Distance milestones use completed runs; elapsed phase dates never imply all workouts in a phase were completed. Weekly charts start on Monday and follow actual workout dates after rescheduling. Imported pace/activity text is preserved rather than guessed or converted.

`/preview` is a development-only, synthetic-data screen for visual QA. It returns 404 in production and does not connect to personal records. The live app never falls back to example data after a database error.

## Deferred

Goal feasibility assessment (Stage 5), automatic training generation (Stage 6), generated-plan review and activation (Stage 7), public sharing, wearable/Strava integrations, and a native mobile app remain future stages. Guided runner/goal inputs and saved snapshots are available from Stage 4. The block library, manual drafts, block-scoped tracker, and lifecycle controls are available from Stage 3. Multiple-block storage and scoped APIs are in place from Stage 2; responsive browser layouts and user ownership are in place from phase 1.

## Free planner development tests

`npm run test:planner` exercises the planner contract and provider adapter with
synthetic inputs and injected responses. After building the current app source,
`npm run test:planner:integration` exercises the production Worker and storage in
Miniflare, with external networking disabled and disposable databases. Neither
command needs an OpenAI account/key, imported workbook, or live database. See
[PLANNER_TESTING.md](PLANNER_TESTING.md) for scope and limitations. These tests
verify application behavior; real model quality remains unverified.

## Phase 1 release baseline

See [PHASE_1_REQUIREMENTS.md](PHASE_1_REQUIREMENTS.md) for Hieu's current product
requirements. New intake is 5K-only with experience, age, body measurements, goal
time, training weekdays and one confirmed dated performance benchmark. Validated generation saves directly; numeric results
copy on completion and preserve manual edits when unchecked. Block settings own
Archive/Delete. Existing imported blocks and older snapshots remain supported.

Run `node --experimental-strip-types --test tests/*.test.mjs`, TypeScript and the
production build. Then `node --experimental-strip-types tests/portable-worker.mjs`
checks storage/API flows without the private workbook. The planner Worker suite
adds mocked provider requests and verifies both legacy and new numeric flows,
including explicit start/completion. Outbound networking is denied in these tests.
The original workbook reconciliation suite still requires its private ignored seed.

AWS migration impact: add nullable result_origins JSON/text, retain intake v4 and
backup v6, and move these fields with the existing result records. Completion and
planner rules remain provider-independent; D1/auth/provider adapters retain their
existing boundary. This release does not add new hosting services.

## Generator Stage 4: benchmark and goal assessment

The current generator stages are documented in PHASE_1_REQUIREMENTS.md and
PLANNER_TESTING.md; earlier stage numbers above describe historical releases.
New live output must provide a consistent structured assessment before automatic
saving. Unsupported goals and unrepresentative benchmarks return questions plus
buttons for relevant existing fields; no workouts are created. Calendar benchmark
ages inform judgment without a universal expiry. Requests preserve the runner’s
inputs and never recommend changing reported experience to qualify. There is no
new migration or database instance. Simulation remains uncalibrated; broad
planning-quality validation remains limited; hosted configuration is recorded below.

## Generator Stage 6: initial live evaluation

Four synthetic profiles were evaluated using the dedicated key and Luna only;
estimated total API cost was $0.006858. See PLANNER_EVALUATION.md for exact results,
quality observations and limitations. Recorded outputs pass an offline production
Worker save/reload/backup regression. `npm run eval:planner` is a free dry run;
`npm run test:planner:replay` is an offline replay after building. The locked paid
runner requires explicit `--live`, preserves dispatched cases and has a $0.10 cap.
Hosted key/model configuration is deployed in live mode. A complete successful
hosted trial remains open; no DB migration is needed. Invalid generated responses
now report safe validation reasons separately from input/goal issues.

## Calculated plan measurements

New live generation uses a pair-only model response. The app computes distance
from duration/pace for normal steps and race pace from estimated duration/exact
5K distance. Full precision is retained before display rounding, and canonical
workout fields/UI stay unchanged. lib/planner-math.ts is independent of hosting,
identity and storage. New snapshots record calculationVersion; historical plans
are never recalculated. Goal suitability and schedule validation remain separate.
See WORKOUT_DATA_CONTRACT.md and PLANNER_TESTING.md. No new DB or dependency is
required. A single-case live evaluation has its own $0.025 cap and no auto retry.
