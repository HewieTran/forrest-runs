# PR A — Active training-block hero

Hieu approved the standalone Training blocks mockup on 2026-11-25, with week
markers along the road and phase markers wherever saved timing is available.
PR B greeting/search and PR C profile are separate changes.

## Acceptance

- Only the active card becomes a full-width light hero. Keep the stats strip,
  status tab counts, search, URL history and all non-active cards/actions intact.
- The block headline reuses journey() for start/end and week N of M. Days to
  race use calendar dates. Known saved phase transitions get road markers and
  a text phase/week list. Missing dates show an honest fallback; no generic
  phase lengths or description parsing. Repeated named phases can recur.
- Running mileage reuses overviewStats()/runningMileage(), including unknown
  versus explicit zero and excluded Strength/Mobility. Existing block totals
  remain the library summary's values. The date marker does not measure mileage
  or workout completion.
- Original SVG trees, phase posts, taper bench and finish flag are decorative.
  The approved existing runner asset marks current date. Responsive road layouts
  keep phone phase labels in text below the road. No animation is necessary;
  reduced-motion explicitly stays static. Text contrast is at least 4.5:1.
- Continue training opens the existing block overview; View schedule stays there.
  Preserve the settings link, Create, EmptyAccountGuidance and preview behavior.
- Check desktop 1280px and phone 390px for active, no-active, draft-only, empty,
  long names and unknown data. Before/after screenshots and browser navigation
  checks are required for visual sign-off; do not substitute generated images.

## Data boundary and architecture

The server loads library metadata as before, then calls the existing owned
loadTraining(user, active.id) for only the active block. Pure calculations live
in lib/library-hero.ts. The client receives only the derived hero projection,
not the block's private setup or generation snapshots. No new API, schema,
backend provider, authentication behavior, data migration or dependency.
No infrastructure or recurring-cost impact; both existing runtimes are supported.

## Delivery gates

PR A remains draft until independent QA has reviewed the exact head. Record
lint, tsc, tests, builds, synthetic persistence/navigation checks and missing
browser coverage in the PR. If browser tools are unavailable, desktop/phone
screenshots, computed contrast and visual overflow remain unverified.
No staging deployment or merge is included in the instruction to create this PR.
