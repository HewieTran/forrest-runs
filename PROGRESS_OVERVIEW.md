# Progress Overview

Agent 2 owns the overview route, components, styles, and provider-independent
calculations in `lib/progress.ts`. It consumes `WORKOUT_DATA_CONTRACT.md` and
does not change storage or generate plans. Tracker's only feature change is its
native View progress link, preserving the existing unsaved-edit navigation guard.

- `/blocks/:id/progress` authenticates and loads exactly the owned selected block.
  Page segments decode once, as on the tracker route.
- Completion percentages are completed / scheduled workouts dated before the
  Central-time `today` returned by storage. Today, future dates, and explicit rest
  days are excluded. Strength and mobility share the support card.
- Running totals include all saved completed runs in the block. Missing recorded
  distances are excluded and disclosed; zero is a recorded value.
- Weekly mileage uses Monday–Sunday weeks, clipped to the selected calendar year.
  Planned mileage sums known running distance targets, including distance stored
  alongside a primary duration target. Recorded mileage uses completed runs only.
  Partial totals disclose missing values rather than replacing them with zero.
- Calendar comparisons use only the explicitly chosen distance/duration metric.
  On multi-workout dates, incomplete sessions produce a partial day. Otherwise,
  below-target results take precedence, then unavailable comparisons, then extra
  volume, then all targets met. Each session's result is available in day details.
- The calendar covers full years spanning setup dates, workouts, rest days, and
  the race date. Empty dates are unscheduled. Week columns are virtualized to keep
  long multi-year histories responsive. Date navigation provides an alternative
  to selecting small cells.

Development-only previews include `view=progress`, `view=progress-mobile`, and
progress `scenario=legacy|empty|long`. Production returns 404 for `/preview`.
Pure domain tests cover date/measurement semantics; disposable Worker integration
checks owned/foreign/encoded-ID routes and read-only behavior.
