# Goal review before schedule generation

Approved in the Workout Plan Generation feature chat, 2026-11-25.

Validate and save intake, assess the goal, then explicitly confirm any change before generating workouts. Prefer a reasonable goal-directed provisional plan over lowering an ambitious target due to uncertainty alone. Use supplied performances for starting paces and progress suitable quality sessions toward goal pace. Never request a changed benchmark.

A blocked assessment identifies a concrete supplied conflict. Supported alternatives independently add running days, move the race later, or offer a minimally slower goal. Show exact changes and rationale. No option is preselected. Suggestions do not guarantee improvement. Clearly unsupported requests receive a candid, respectful explanation and numeric alternatives only when evidence supports them.

The server accepts only choices from the saved assessment. The confirmed race duration, distance, dates, weekdays and time limits govern generation and validation. Preserve old generations and workouts without recalculating them.

Save incomplete drafts. Reuse assessments across reloads and saves with unchanged canonical intake. Changed intake invalidates its assessment. A failed generation retains its confirmed assessment for deliberate retry. Replayed confirmations preserve current non-planner metadata.

Both stages enforce ownership, optimistic concurrency, account leases, daily attempt limits and the existing shared monthly budget. Each reserves and settles its own usage. Successful assessment can immediately transition to generation. Duplicate requests cannot start a second paid call. Ordinary testing uses synthetic responses.

Migration 0013 adds nullable goal-review JSON and a request-type column with legacy rows defaulted to plan. Backup v10 preserves optional review provenance and accepts versions 1–9. Existing data and deployment settings are preserved.

Desktop and phone show a readable review step, visible rationale, exact confirmation, separate loading/failure states and draft save. Samples explicitly label their assessment as simulated and remain drafts.

Acceptance covers incomplete draft save/reload, cached and stale reviews, all supported choices, unsupported/no-choice results, forged selections, ownership, concurrency, billed failures, target mismatch, retries, backup roundtrip, sample navigation and eligible plan activation. Synthetic tests verify control flow; actual coaching quality needs a separate bounded real-model evaluation.
