# Forrest Runs

A private, browser-based running training log. Phase 1 imports the Dashboard and Workout Tracker sheets, supports editing and rescheduling workouts, records actual results, and calculates progress and milestones.

## Stack

React and TypeScript; responsive CSS; Vinext and Cloudflare Workers; D1 with Drizzle migrations; Sites-managed ChatGPT sign-in. The app currently has one training plan per signed-in user. Every data operation scopes records to that user's plan.

## Development

Use Node.js 22.13 or later. Install dependencies with the Sites plugin's install-dependencies helper, which selects the project's package manager and lockfile. Start development through the supported Sites preview workflow, or `npm run dev` in a portable local environment. Build through the Sites build helper. Run `node node_modules/typescript/bin/tsc --noEmit` and `node --experimental-strip-types --test tests/domain.test.mjs` before publishing.

The Sites skill contains the complete managed preview, Git synchronization, packaging, and publication workflow. `.openai/hosting.json` retains the canonical Site identity and its DB binding. Never replace its project ID when continuing development.

After building, `node --experimental-strip-types tests/worker-integration.mjs` runs the deployed Worker code inside Miniflare without a preview server. It applies migrations to a disposable D1 database and tests imports, authentication, account isolation, input validation, saving, reloading, rescheduling, stale-edit rejection, export, and production-only route boundaries. The test requires the ignored `.sites-runtime/training-import.env.json` generated from the workbook; no personal test fixture is checked into Git. `tests/api-local.mjs` is the shared request suite, not a stand-alone test against a hosted app.

## Database changes

Edit `db/schema.ts`, run `npm run db:generate`, and commit new SQL migrations and metadata. Apply migrations to the local preview database separately; Sites applies pending migrations during publication. Applied migrations must not be rewritten. A code rollback does not undo database changes: prefer additive migrations and export data before any change that could alter existing records.

## Initial spreadsheet import

`tools/import-workbook.py INPUT.xlsx .sites-runtime/training-import.json` reads only Dashboard and Workout Tracker. The generated files are private runtime inputs and are ignored by Git. It preserves source row values alongside normalized fields. Unknown distance stays null; a recorded zero remains zero.

Set the generated gzip/base64 chunks as secret runtime variables `TRAINING_SEED_1`, `TRAINING_SEED_2`, etc., plus `TRAINING_SEED_OWNER` for the owner's verified sign-in email. The authenticated owner's first load imports the data in an atomic D1 batch. Subsequent loads read the database and never overwrite it from the seed. Other signed-in users get a separate empty plan, without access to the seed. Do not put spreadsheet files, seed data, secrets, or personal workout records into Git.

## Backup and recovery

Use **Export backup** in the header to download a versioned JSON file containing the entire saved plan, workouts, original import values, and timestamps. Keep this file private. Phase 1 provides export; restoring a backup is a maintenance operation, not a self-service import screen. Before restoring, verify `schemaVersion: 1`, check record counts, remap the plan to the authenticated user, and validate the recovered records in an isolated database. Never restore over live records without a fresh export and explicit approval.

Commit each coherent change and push it to the hosted Git repository. Each deployment is tied to an exact pushed commit and saved Site version. Recover code by reverting the faulty change and redeploying a known working build; retain compatible database migrations. When a private GitHub mirror is configured, keep it synchronized with the same source changes. Do not force-push over unrelated user work.

## Scope and calculations

Overall completion includes future workouts. Through-yesterday completion uses dates before the current Central-time date. Recorded mileage includes completed running workouts with a numeric distance, excludes strength/mobility, and flags missing distances. Distance milestones use completed runs; elapsed phase dates never imply all workouts in a phase were completed. Weekly charts start on Monday and follow actual workout dates after rescheduling. Imported pace/activity text is preserved rather than guessed or converted.

`/preview` is a development-only, synthetic-data screen for visual QA. It returns 404 in production and does not connect to personal records. The live app never falls back to example data after a database error.

## Deferred

Public sharing, additional race plans per user, wearable/Strava integrations, automatic coaching, and a native mobile app remain future phases. Responsive browser layouts and user ownership are in place from phase 1.
