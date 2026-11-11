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

- Deploy the Cognito-enabled build and verify real Google sign-in, logout,
  session expiration and account recovery.
- Confirm production support for the Node.js runtime and SQLite driver.
  This proof uses the built-in SQLite API in Node.js 24.
- Validate server memory, request concurrency and generation latency.
- Configure HTTPS, secrets, backups, restore checks and deployment automation.
- Initialize a separate empty beta database and verify new-account ownership.
- Select AWS resources and approve their estimated operating cost.

PRs #14 and #15 are merged. The Node.js compatibility proof is local-only.

## AWS beta sign-in configuration

Build the Node distribution with `pnpm run build:node-proof`. For a source-based
test, start it with `node --env-file=/path/to/beta.env scripts/node-proof.mjs start`.
Store the environment file outside the repository with access limited to the
service account. Use a new SQLite path for this deployment.

| Environment variable | Value |
| --- | --- |
| `FORREST_AWS_BETA` | `1` |
| `FORREST_SQLITE_PATH` | Absolute path for the separate AWS beta database |
| `FORREST_BETA_ORIGIN` | Public HTTPS origin of the beta distribution |
| `FORREST_COGNITO_DOMAIN` | HTTPS origin of the Cognito managed login domain |
| `FORREST_COGNITO_ISSUER` | Exact `issuer` from this pool's OpenID discovery document |
| `FORREST_COGNITO_CLIENT_ID` | Cognito web app client ID |
| `FORREST_COGNITO_CLIENT_SECRET` | Cognito web app client secret |
| `FORREST_BETA_SESSION_SECRET` | Dedicated random value, for example from `openssl rand -hex 32` |
| `FORREST_BETA_ALLOWED_EMAILS` | Comma-separated verified Google email addresses approved for the beta |

Enable Google and the authorization code grant on the Cognito app client. Set
the callback to `/auth/callback` on the public origin and the sign-out URL to the
root of that origin. Map Google's `email` and `email_verified` attributes. Enter
the Google client secret in Cognito when setting up the provider. The app uses
the separate Cognito app client secret for its own token exchange.

For the CloudFront behavior that serves the app, use `CachingDisabled` and
`AllViewerExceptHostHeader` so callback query parameters, session cookies and the
browser's `Origin` header reach Lightsail. Enable the full HTTP method set for
workout writes and sign-out. Route the HTTPS origin to the loopback Node process
once these settings are ready. Keep the static HTTPS page available as a rollback.

Run `node tests/node-beta-integration.mjs` after building to check the flow with
a simulated Cognito provider. For the hosted check, sign in with two approved
Google accounts, verify that each starts with an empty library and can access
only its own records, then sign out and confirm that protected routes require
sign-in. Try an unapproved account and check that it is denied access. The beta
uses the Cognito subject for ownership and the email address for approval.
