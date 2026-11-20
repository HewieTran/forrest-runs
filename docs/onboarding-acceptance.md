# Landing and explicit block start

Approved by Hieu on 2026-11-20 after desktop/mobile design review.

## Behavior and scope

- Home opens the owned active block. Otherwise ready (Not started) takes priority
  over incomplete Draft; empty/history-only accounts land on All blocks.
- Explicit library filters/search and direct block/setup/schedule links win over
  landing defaults. Tab/search state is reflected in the URL and survives reload.
- Account emptiness uses the successfully loaded, unfiltered owned library.
  Loading/error boundaries never substitute an empty library.
- Empty accounts get a dismissible, nonblocking callout under the existing Create
  training block button. It points to that button. Account-scoped session dismissal
  survives navigation/reload, resets on sign-out, and expires with the browser tab.
  Persistent empty-state copy and a Create action remain after dismissal.
- Drafts get concise setup guidance. History-only accounts get a quiet invitation
  to create another block. Neither gets first-time onboarding.
- Ready cards show a Central-calendar start indicator (future/tomorrow/today/past/
  missing), reusing firstWorkoutDate. Dates alone never change status.
- Ready real blocks expose Start this block on the card and in a prominent inline
  overview panel. A single click calls the existing versioned status API. Starting
  before the first workout is allowed; no dates/results change. Success opens the
  overview; returning Home opens it. No extra setup step or start confirmation.
- Keep for later returns to the Not started list; the existing schedule is already
  saved. Incomplete setup, generation errors and clarifications remain Draft.
- Existing activation/ownership/concurrency rules remain authoritative on the
  server. Another active block is never silently replaced; simulations cannot start.
- Desktop callout is aligned below Create; on mobile Create and its callout stack
  above totals. Controls are keyboard accessible, mobile actions stack, tabs scroll
  without page overflow, and messages/errors wrap readably.

## Verification gates

Domain cases: all account-state combinations; ready classification unchanged;
explicit filters; all date cases including year rollover and Central midnight;
session dismissal/account separation/sign-out reset. HTTP/integration: scoped
activation with future date, version conflicts, one-active rule, foreign ownership,
unchanged records, simulation save/reload/rejection, creation/return and exports.
Browser QA at desktop and phone widths: entry, filters/back/reload, dismissal and
creation/cancel, Start/Keep for later, error recovery and core runner flows.

Dev hands the PR head/build to an independent QA agent; failures return to Dev and
are retested. QA evidence records exact revision/environment/viewport and observed
pass/fail/blocked; missing browser evidence is not counted as a pass.

## Architecture and delivery

UI and provider-independent presentation rules only. Existing storage/status API,
auth adapters and database schema retained. No migration, dependency, paid model
call, or additional recurring service. AWS uses the same rules/components.
Feature is separate from typography PR #32 and architecture PR #29. GitHub PR,
ChatGPT staging port/revision, merge and AWS release status are reported separately.
