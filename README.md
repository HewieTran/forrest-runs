# Forrest Runs

A private, browser-based running training log. Phase 1 imports the Dashboard and Workout Tracker sheets, supports editing and rescheduling workouts, records actual results, and calculates progress and milestones.

## Stack

React and TypeScript; responsive CSS; Vinext and Cloudflare Workers; D1 with Drizzle migrations; Sites-managed ChatGPT sign-in. A signed-in user can own multiple training blocks, with at most one active block. Every data operation checks account ownership and the selected block.

## Development

Use Node.js 22.13 or later. Install dependencies with the Sites plugin's install-dependencies helper, which selects the project's package manager and lockfile. Start development through the supported Sites preview workflow, or `npm run dev` in a portable local environment. Build through the Sites build helper. Run `node node_modules/typescript/bin/tsc --noEmit` and `node --experimental-strip-types --test tests/domain.test.mjs tests/migration.test.mjs tests/backups.test.mjs` before publishing.

The Sites skill contains the complete managed preview, Git synchronization, packaging, and publication workflow. `.openai/hosting.json` retains the canonical Site identity and its DB binding. Never replace its project ID when continuing development.

After building, `node --experimental-strip-types tests/worker-integration.mjs` runs the deployed Worker code inside Miniflare without a preview server. It applies all migrations to a disposable D1 database and tests imports, authentication, account and block isolation, saving, rescheduling, version conflicts, active-block switches, concurrent first loads, export, isolated restore rehearsals, and production-only route boundaries. The test requires the ignored `.sites-runtime/training-import.env.json` generated from the workbook; no personal test fixture is checked into Git. `tests/api-local.mjs` is the shared request suite, not a stand-alone test against a hosted app. Never send its synthetic authentication headers to a hosted Site.

## Database changes

Edit `db/schema.ts`, run `npm run db:generate`, and commit new SQL migrations and metadata. Apply migrations to the local preview database separately; Sites applies pending migrations during publication. Applied migrations must not be rewritten. A code rollback does not undo database changes: prefer additive migrations and export data before any change that could alter existing records.

Stage 2's `0001_training_blocks.sql` removes the unique owner index, adds `status` with an `active` default for existing records, and adds an owner/listing index plus a unique partial index for one active block per owner. It does not rebuild tables, rewrite IDs, move workouts, or change recorded results. The existing workout foreign key and block/date index remain. All inserts after this stage must explicitly choose a validated status: `draft`, `active`, `completed`, or `archived`; the database enforces active uniqueness and TypeScript types constrain status values. There is no public status-write API in Stage 2.

Sites applies migrations before uploading Worker code. The pre-Stage-2 app remains compatible during that window because each existing account still has its original active block. Once multiple blocks exist, Stage 2 is the minimum safe code rollback target: the older app assumes one plan per account. Revert a faulty later feature onto this storage contract; do not restore the unique-owner index or delete extra blocks to make old code fit. If the deployment fails after migration, keep the migration and retry a compatible build.

## Training block storage contract

The physical tables remain `training_plans` and `workouts`; a block is a plan, and `workouts.plan_id` remains its foreign key. Legacy plan and workout IDs, imported source values, versions, notes, timestamps, and unknown-versus-zero distances are preserved.

- `GET /api/blocks` returns only the current account's block metadata, ordered by creation time then ID. It omits internal owner IDs and workout rows.
- `GET /api/training?blockId=ID` loads exactly that owned block. Unknown or foreign blocks return the same 404 and never trigger an import.
- Without `blockId`, reads select the active block; if none exists, the oldest block by creation time then ID. Only an account with no blocks receives the initial import or empty starter block.
- `PATCH /api/training`, `POST /api/workouts`, and `PATCH /api/workouts/:id` accept `?blockId=ID`. The current UI pins every save to the block being viewed. Workout membership is enforced server-side, and existing version checks still reject stale edits. Supplied owner IDs, plan IDs, versions on creation, and import metadata cannot redirect a workout or forge source values.
- For backward compatibility, writes without `blockId` work while the account has exactly one block. With multiple blocks they return 409 and require a reload/selection, protecting older tabs from saving into a newly active block. Malformed or repeated block IDs return 400. All responses use private, non-cacheable data headers.

Block creation, activation, completion, archival, and the library/selection UI are Stage 3 work. They are intentionally not exposed as write endpoints in this stage. No database service change or dependency upgrade is required for this schema change.

## Portability boundaries (Stage 2.1)

`lib/user.ts` defines the app's user contract. `lib/auth.ts` adapts the existing Sites sign-in helpers to that contract, passing the provider's stable user ID through unchanged. Storage and API code use the app contract. A future AWS sign-in provider must map new identities to existing owner IDs; email is not an ownership key. The configured email check for the private initial spreadsheet import is a separate eligibility check.

`lib/store.ts` owns training reads and writes, including race settings. API routes authenticate, validate requests, and translate results into HTTP responses. Training storage's Cloudflare environment access and the atomic first-load import live in `db/index.ts` and `db/initial-training.ts`. The SQL, batch boundaries, IDs, and number of database operations remain the same after this extraction.

This is preparation for a future move, not an AWS implementation. The D1 Drizzle driver, SQLite schema/migrations, batch semantics, Worker entrypoint, and hosting configuration still require review for the chosen AWS architecture. No database migration or dependency change is needed for Stage 2.1.

## Initial spreadsheet import

`tools/import-workbook.py INPUT.xlsx .sites-runtime/training-import.json` reads only Dashboard and Workout Tracker. The generated files are private runtime inputs and are ignored by Git. It preserves source row values alongside normalized fields. Unknown distance stays null; a recorded zero remains zero.

Set the generated gzip/base64 chunks as secret runtime variables `TRAINING_SEED_1`, `TRAINING_SEED_2`, etc., plus `TRAINING_SEED_OWNER` for the owner's verified sign-in email. The authenticated owner's first load imports the data in an atomic D1 batch. Subsequent loads read the database and never overwrite it from the seed. Other signed-in users get a separate empty plan, without access to the seed. Do not put spreadsheet files, seed data, secrets, or personal workout records into Git.

## Backup and recovery

Use **Export backup** in the header (`GET /api/export`) to download all owned blocks and their workouts, including original import values, record versions, statuses, and timestamps. The account-wide format is `{schemaVersion: 2, exportedAt, blocks, workouts}`; workout `planId` values reference block IDs. Export uses two queries in one database batch rather than one query per block. Keep this file private.

`GET /api/export?blockId=ID` retains the single-plan `{schemaVersion: 1, exportedAt, plan, workouts}` format for existing tooling. `normalizeTrainingBackup` in `lib/backups.ts` accepts old v1 files (missing status becomes active) and v2 files. It validates references, duplicate IDs, statuses, record versions, and workout values while retaining IDs, original source data, and null/zero distinctions. It strips untrusted owner fields and performs no writes.

Restoring remains a maintenance operation, not a public import endpoint. Validate the file and record counts, independently verify the receiving account, assign ownership without rewriting record IDs or workout references, and rehearse in an isolated migrated database. The integration suite inserts both backup formats into disposable D1 and compares every recovered field, including foreign-key integrity. Resolve any existing ID or active-status conflicts before a real restore. Never restore over live records without a fresh export and explicit approval.

Commit each coherent change and push it to the hosted Git repository. Each deployment is tied to an exact pushed commit and saved Site version. Recover code by reverting the faulty change and redeploying a known working build; retain compatible database migrations. Keep the GitHub code mirror synchronized with the same source changes, without private fixtures or records. Do not force-push over unrelated user work.

## Scope and calculations

Overall completion includes future workouts. Through-yesterday completion uses dates before the current Central-time date. Recorded mileage includes completed running workouts with a numeric distance, excludes strength/mobility, and flags missing distances. Distance milestones use completed runs; elapsed phase dates never imply all workouts in a phase were completed. Weekly charts start on Monday and follow actual workout dates after rescheduling. Imported pace/activity text is preserved rather than guessed or converted.

`/preview` is a development-only, synthetic-data screen for visual QA. It returns 404 in production and does not connect to personal records. The live app never falls back to example data after a database error.

## Deferred

Block library/lifecycle screens, public sharing, wearable/Strava integrations, automatic coaching, and a native mobile app remain future phases. Multiple-block storage and scoped APIs are in place from Stage 2; responsive browser layouts and user ownership are in place from phase 1.
