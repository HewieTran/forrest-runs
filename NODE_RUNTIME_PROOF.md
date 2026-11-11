# Node.js and SQLite compatibility proof

This branch adds a local Node.js runtime alongside the Sites runtime. It uses
the existing UI, training rules, tables and SQL migrations. No AWS resources
are provisioned.

## Run locally

Use Node.js 24 and install the repository's locked dependencies.

```sh
npm run build:node-proof
npm run start:node-proof
```

Open `http://127.0.0.1:4180`, follow **Open local proof accounts**, and choose
Runner A or Runner B. Each runner starts with an empty library.

- The server binds to loopback. These synthetic accounts are for local tests.
- The SQLite file defaults to `.sites-runtime/node-proof/training.sqlite`.
- `FORREST_SQLITE_PATH` can select a separate absolute database path.
- `FORREST_PROOF_PORT` changes the local port.
- An ephemeral signing secret is created at startup. Restarting the server
  preserves data and requires signing in again.
- Plan generation always uses the simulation provider. The Node adapter does
  not expose an OpenAI credential or spreadsheet import to the app.

## Verify

```sh
npm run test:node-proof
```

The test starts a production Next.js server with a temporary SQLite file and
synthetic sessions. It checks creating/starting blocks, workout completion and
manual results, rest days, ownership, stale edits, simulated generation,
idempotent saving, backup exports, encoded legacy IDs, atomic rollback and
persistence across a server restart.

The SQLite tests also check migration from an older schema, preserved unknown
and zero measurements, rerunning migrations, changed migration detection and
signed session rejection.

The native and Sites builds, both TypeScript configurations, 95 unit/migration
tests, the native HTTP flow and the existing Worker integration/replay suites
passed. A synthetic owner import also passed through the Sites adapter.
The cloud browser could not reach the local server, so visual browser
verification remains pending.

## Runtime boundaries

The Sites build resolves `@forrest/platform` to `runtime/sites.ts`. The native
Next.js proof build resolves it to `runtime/node.ts` through its own TypeScript
configuration. The adapters supply the database, identity, runtime variables,
sign-in paths and labels.

The standalone database uses Drizzle's existing SQLite callback driver and
Node's built-in `node:sqlite`. SQL batches execute synchronously inside one
transaction. All migrations run in one transaction and are checked against
their recorded hashes. User data and schema migrations stay in the repository's
existing representations.

## Remaining before an external AWS beta

The approved beta scope is Google sign-in through Cognito, using Hieu's existing
AWS account. AWS operating costs must stay under $5 per month, separate from
the $5 monthly OpenAI budget. The beta name is **ForrestRun-Beta**, with
`forrestrun-beta` as the proposed URL label. The full hostname is pending.

The AWS beta starts with an empty database and new accounts. Existing ChatGPT
accounts and training records are outside the migration scope.

Hosting selection is pending the cost estimate. The smallest Lightsail bundle
with public IPv4 is $5 per month before backups and other services, so it exceeds
the approved AWS ceiling once those costs are included. The $3.50 IPv6-only
option has 512 MB RAM and requires separate compatibility and access checks.
See [AWS Lightsail bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html).

- Replace synthetic sessions with Cognito and verify real authentication,
  logout, session expiration and account recovery.
- Confirm production support for the Node.js runtime and SQLite driver.
  This proof uses the built-in SQLite API in Node.js 24.
- Validate server memory, request concurrency and generation latency.
- Configure HTTPS, secrets, backups, restore checks and deployment automation.
- Initialize a separate empty beta database and verify new-account ownership.
- Select AWS resources and approve their estimated operating cost.

PRs #14 and #15 are merged. The Node.js compatibility proof is local-only.
