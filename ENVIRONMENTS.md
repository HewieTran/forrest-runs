# Environment separation

## Current state

- The private hosted Forrest Runs site and its database contain the owner's real
  training history alongside explicitly created simulation blocks.
- `TRAINING_PLANNER_MODE=simulation` selects an example provider. It does not
  create an isolated environment or database.
- Automated tests already run the Worker in Miniflare with disposable databases,
  synthetic identities, intercepted provider responses and no real API key.
- Permanent deletion is an account-scoped application action. It removes the
  selected block, its intake/generation snapshot, workouts/results and rest days
  atomically. It does not delete other blocks or previously downloaded backups.
  An account initialization marker remains so a deleted import is not recreated.

## Proposed next step (not provisioned)

| Environment | Purpose | Data and API configuration |
| --- | --- | --- |
| Local development | Daily implementation and automated checks | Disposable database; synthetic data; simulation/mocked provider |
| Private staging | User testing before a release | Separate Site and database; synthetic/test blocks; simulation by default |
| Private production | Real training history | Current Site/database; approved releases and explicit provider configuration |

Use the same versioned source and append-only migrations in staging and
production. Deploy and verify in staging first, then promote the tested commit.
Never point staging at production storage or copy personal training history/API
credentials into it by default. User identity is Site-scoped: a staging login
must not be treated as the same storage owner ID as a production login.

Separate URLs and a visible environment label should make the destination clear.
Runtime secrets, model settings, backups and deployment records must be kept
separate for each environment. Additional hosted resources and any live API
spending should be agreed before provisioning. A future AWS deployment should
preserve the same separation between databases, credentials and deployments.

## Deletion and rollback compatibility

Migration 0006 creates `training_account_state` without rewriting existing blocks
or workouts. New first-load imports write their initialization marker atomically;
existing accounts gain a marker during deletion. Keep this table and its reader
in a rollback, or an empty account could re-import a deliberately deleted plan.

Deletion uses an owned block/version plus a digest of all workout/rest IDs and
versions. The final reservation repeats those checks in SQL. A unique temporary
JSON token guards the atomic deletion batch; it is rolled back on failure and
is never returned as saved plan metadata. Existing alteration triggers may bump
versions while children are deleted without breaking the reservation.

New empty account exports remain valid v5 backups. Operational initialization
state is not training history and is not part of that envelope. Any future
production restore/import operation must mark the destination account initialized,
including when restoring an intentionally empty backup. Offline test restore
helpers do not grant ownership or provide a production restore endpoint.
