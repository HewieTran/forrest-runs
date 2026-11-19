# Workout Schedule: design review and acceptance criteria

Status: design approved by Hieu; implementation in PR #27. Rest-day conversion deferred.
Base: main after PR #26, bebd5202e7f8dc123406949822a635f0c9520a4f.
Review date: November 18, 2026 (America/Chicago).

## Scope

Add a monthly Workout Schedule within an owned training block. Activate View
schedule in the approved Overview and provide a clear return link. Preserve the
Create Training Block flow and the Overview's consolidated progress information.
Reuse the existing editor, validation, workout APIs, rest-day restrictions,
optimistic concurrency, and mileage/metric calculations. No new schema, paid
service, or hosting integration is expected.

The interactive desktop/phone review uses invented workouts. Its editor is
condensed to demonstrate popup placement and multiple-workout selection, not a
replacement specification for WorkoutEditor. Implementation retains the complete
approved editor: structured steps, linked measurements, original legacy values,
period artwork choices, optional results and completion behavior. Preview saves
are in memory only and reset on reload; real implementation acceptance requires
server persistence.

## Review decisions

- Calendar weeks run Monday–Sunday, matching existing progress calculations.
- The training-date convention remains the existing Central-time convention;
  the existing time-of-day artwork defaults still use the runner's device period.
- Enter on the Overview's featured workout date, if supplied; otherwise today
  when inside the block span, or the nearest block boundary. Today always jumps
  to the actual current training date. Date picker changes month and selection
  without opening the editor. Previous/next changes the visible month, not the
  selected date or any record.
- Navigation covers every month and year. Keep existing supported date limits;
  do not introduce a new write restriction at block boundaries. Show month/year
  explicitly and use date strings, never week-number-only keys.
- Desktop: full workout titles plus known planned mileage/duration in day cells.
  Multiple workouts stack; overflow count and the selected-day list expose all.
- Phone: compact workout names and mileage/duration in a seven-column calendar;
  the selected-day list shows full names and actions. No horizontal page scrolling.
  Tapping any date immediately opens its popup, even on phones.
- One workout opens Edit workout directly. Multiple workouts open one popup with
  a workout selector, the first scheduled workout's existing editor, and Add
  another. Changing the selected workout or adding another checks dirty state.
- Blank dates open Add workout with the date prefilled and completion unchecked.
- **Approved rest behavior:** explicit rest dates open a read-only
  Rest day popup with Add disabled. They are never treated as empty dates, never
  silently removed, and cannot be marked completed. Adding/removing rest-day
  designations is outside this PR; existing records remain intact.
- Adding from a nonempty date uses Add workout/Add another with that date
  prefilled. No new workout type, date conversion, or automatic completion.

## Acceptance criteria

1. Overview → View schedule opens the same owned block. Back preserves useful
   Overview context. Direct calendar links authenticate and enforce ownership.
2. Previous/next, Today and Go to date work through December/January, leap days,
   sparse blocks and all block dates. Navigation never mutates records.
3. Every date has an accessible date label. Today, selected, completed, scheduled,
   explicit rest and empty are visually distinct; state is not color-only.
   Completed sessions retain planned mileage; actual results are available in
   details. Unknown values remain unspecified. Strength/Mobility use known
   planned duration, not invented running distance or parsed description values.
4. All workouts on a date are reachable, including overflow. Opening a blank
   date starts Add; an occupied date opens Edit/Log with its instructions and
   correct version. Add another stays available unless blocked by explicit rest
   or existing incomplete-draft restrictions.
5. Reuse the complete WorkoutEditor and shared save workflow. Preserve generated
   prescription-change confirmation, copied/manual result provenance, optional
   period, units, structured steps and explicit completion checkbox behavior.
6. Invalid entries stay visible with inline errors. Saving prevents duplicate
   actions and unsafe closing. Server/network/409 conflicts retain entered
   values and explain retry/reload choices; no automatic replay or overwrite of
   stale data. Initial load failures show a recoverable error; empty months still
   display all dates. Loading is announced without leaving stale actions enabled.
7. Dirty state is guarded on Cancel, close, Escape, backdrop, workout switching,
   Add another and navigation away. Browser unload gets its supported warning;
   in-app route changes require an explicit discard choice. Focus enters the
   dialog at its heading and returns to a stable date/action trigger. Keyboard
   users can reach calendar dates and controls. Phone popup fills the screen;
   desktop popup is centered, internally scrollable, with a visible close action.
8. Saving updates the selected date/month if moved, removes the former date's
   entry, and shows confirmation. Reload fetches the saved record. Returning to
   Overview refreshes Today’s Workout, current-week mileage and block metrics
   from the same existing rules. Future planned edits do not imply completion.
9. APIs keep server-side user/block ownership, version checks and atomic rest-day
   conflicts. Cross-account access remains denied. No destructive conversion,
   inferred rest day, backfill, or production-data test writes.
10. Desktop and phone pass the independent QA flow below on the exact PR head.

## Implementation map after design approval

- `app/blocks/[id]/schedule/page.tsx`: same auth, decoded route ID, owned
  loadTraining and missing-block behavior as Overview; selected date query.
- Pure schedule helpers in `lib/`: calendar month/date enumeration and display
  summaries. Reuse calendarIndex/blockRange and existing domain measurement rules.
  Dates and calculations stay separate from React and hosting adapters.
- New schedule presentation component/CSS; keep read-only ProgressCalendar
  behavior independent instead of repurposing its yearly heatmap.
- Reuse WorkoutDialog and WorkoutEditor. Extract only the shared editor/save
  controller needed by Overview and Schedule; do not duplicate fetch or domain
  completion logic. Use block-scoped POST/PATCH APIs without storage changes.
- `TodayWorkout`/Tracker: activate View schedule and refresh data after returning
  from an edit. Avoid broad refactoring or new auth/database abstractions.
- Site and GitHub have separate runtime adapters. Review drift before any staged
  port; a GitHub merge alone does not update the Site or AWS beta.

## Independent QA handoff after implementation

Give QA the PR, exact head SHA, matching disposable build URL, synthetic account,
acceptance criteria and runner goals, without a click-by-click script. Required:
start at Home, open Overview and schedule; find a future date; open a planned
workout, read instructions, change prescription/results, save without unintended
completion, reload, verify the calendar and Overview metrics. Then log completion,
reload and verify recorded mileage/metrics; move a workout and check both dates.

Also cover a blank date, multiple workouts, explicit rest, unknown distance,
Strength/Mobility duration, December–January navigation, dirty-close/switch/back,
validation, failed save and stale version, mobile layout/keyboard/focus, and
cross-account denial. Run the repository core manual-block/logging/progress and
simulated-generation flows. Use no personal records. Dev fixes failures and hands
QA the new exact SHA; repeat until explicit sign-off matches the PR head.
Record desktop/phone, environment and expected/actual results in one PR comment.

## Delivery gates

Design review → implementation → Dev checks → independent QA → fixes/retest →
QA sign-off → user-authorized merge → revision-verified staging smoke test.
AWS deployment is separate. At design-review stage, QA/merge/deploy are pending.

## Design-prototype checks (not feature QA)

JavaScript parsing passed. Browser inspection checked the desktop calendar and a
410px phone layout with no horizontal content overflow. The prototype opened
single/multiple-workout, blank-date Add and explicit-rest popups; guarded a dirty
close; saved a local preview edit; and navigated November → December → January.
This does not verify API persistence or app metrics. Independent feature QA has
not started and remains required after implementation.
