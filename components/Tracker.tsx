'use client';
import { acceptedPlan, simulatedBlock, changesPrescription } from '../lib/planner';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Flag,
  Footprints,
  Info,
  Pencil,
  Plus,
  Settings2,
  Trophy,
  X,
} from 'lucide-react';
import {
  addDays,
  EMPTY_WORKOUT_MEASUREMENTS,
  dateDiff,
  distanceMilestones,
  formatDate,
  isRun,
  mileageWeeks,
  PHASES,
  phaseMilestones,
  summarize,
  weekStart,
  type AppData,
  type Workout,
  type WorkoutInput,
} from '../lib/domain';
import AppHeader from './AppHeader';
import WorkoutEditor from './WorkoutEditor';
import TodayWorkout, { formatWorkoutTitle } from './TodayWorkout';
import { formatPace, formatDuration } from '../lib/workout-form';
import BlockActions from './BlockActions';
import type { Plan } from '../lib/domain';
import { applyCompletion, paceFromRecordedResults } from '../lib/workout-completion';
import { raceDistanceLabel } from '../lib/race-distance';
import { setupTargetTime } from '../lib/setup';
import { blockReady } from '../lib/blocks';
import { workoutSummary, workoutStructure } from '../lib/workout-structure';

const formatNumber = (value: number) =>
  value.toLocaleString('en-US', { maximumFractionDigits: 2 });
type Filter = 'all' | 'runs' | 'support' | 'missing';
function WorkoutIcon({ type }: { type: string }) {
  const Icon =
    type === 'Strength'
      ? Dumbbell
      : type === 'Mobility'
        ? Activity
        : type === 'Race'
          ? Flag
          : Footprints;
  return <Icon size={17} />;
}

export default function Tracker({
  initial,
  preview = false,
  activeBlock = null,
}: {
  initial: AppData;
  preview?: boolean;
  activeBlock?: Pick<Plan, 'id' | 'raceName'> | null;
}) {
  const [data, setData] = useState(initial);
  const [currentActive, setCurrentActive] = useState(activeBlock);
  const [selectedWeek, setSelectedWeek] = useState(() => { const dates = initial.workouts.map(workout => workout.date).sort(); return weekStart(dates.length && (initial.today < dates[0] || initial.today > dates[dates.length - 1]) ? dates[0] : initial.today); });
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(
    () =>
      initial.workouts.find(
        (workout) => workout.date === initial.today && !workout.done,
      )?.id ?? null,
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [actualFocus, setActualFocus] = useState<{ id: string } | null>(null);
  const showToday = data.plan.status === 'active';
  const progressHref = preview ? '/preview?view=progress' : `/blocks/${encodeURIComponent(data.plan.id)}/progress`;
  // Derive the dashboard from the same saved records shown in the workout list.
  const progress = summarize(data.workouts, data.today);
  const weekEnd = addDays(selectedWeek, 6);
  const weeklyWorkouts = data.workouts
    .filter(
      (workout) => workout.date >= selectedWeek && workout.date <= weekEnd,
    )
    .sort(
      (firstWorkout, secondWorkout) =>
        firstWorkout.date.localeCompare(secondWorkout.date) ||
        (firstWorkout.sourceRow ?? 9999) - (secondWorkout.sourceRow ?? 9999),
    );
  const visibleWorkouts = weeklyWorkouts.filter(
    (workout) =>
      filter === 'all' ||
      (filter === 'runs' && isRun(workout)) ||
      (filter === 'support' && !isRun(workout)) ||
      (filter === 'missing' &&
        workout.done &&
        isRun(workout) &&
        workout.actualDistance === null),
  );
  const phaseProgress = phaseMilestones(data.workouts, data.today);
  const selectedPhase = phaseProgress.find(
    (phaseEntry) =>
      phaseEntry.start &&
      phaseEntry.end &&
      phaseEntry.start <= weekEnd &&
      phaseEntry.end >= selectedWeek,
  )?.phase;
  // Keep the existing memoization: week options change only with data or today.
  const trainingWeeks = useMemo(() => {
    const firstWeek = weekStart(
      [data.today, ...data.workouts.map((workout) => workout.date)].sort()[0],
    );
    const lastWeek = weekStart(
      [data.today, ...data.workouts.map((workout) => workout.date)]
        .sort()
        .at(-1)!,
    );
    const weekOptions = [];
    for (
      let weekCursor = firstWeek;
      weekCursor <= lastWeek;
      weekCursor = addDays(weekCursor, 7)
    )
      weekOptions.push(weekCursor);
    return weekOptions;
  }, [data.workouts, data.today]);
  const distanceProgress = distanceMilestones(data.workouts);
  const weeklyMileage = mileageWeeks(data.workouts, selectedWeek);
  const maxWeeklyMiles = Math.max(
    ...weeklyMileage.map((weekMileage) => weekMileage.miles),
    1,
  );
  const daysToRace = dateDiff(data.plan.raceDate, data.today);
  const newWorkout: Workout = {
    ...EMPTY_WORKOUT_MEASUREMENTS,
    id: 'new',
    planId: data.plan.id,
    date:
      selectedWeek <= data.today && weekEnd >= data.today
        ? data.today
        : selectedWeek,
    phase: selectedPhase ?? 'Not applicable',
    type: 'Easy Run',
    plannedWorkout: '',
    targetPace: '',
    done: false,
    actualDistance: null,
    actualPace: '',
    effort: null,
    pain: '',
    notes: '',
    sourceRow: null,
    originalSource: null,
    version: 1,
    updatedAt: '',
  };
  useEffect(() => {
    if (!toast) return;
    const toastTimeoutId = window.setTimeout(() => setToast(''), 6500);
    return () => window.clearTimeout(toastTimeoutId);
  }, [toast]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);
  useEffect(() => {
    if (!actualFocus || actualFocus.id !== expandedWorkoutId) return;
    const section = document.getElementById(`workout-actual-${actualFocus.id}`);
    if (!section) return;
    section.focus({ preventScroll: true });
    section.scrollIntoView({ block: 'start' });
  }, [actualFocus, expandedWorkoutId]);
  // Navigation and editor changes share the same unsaved-change guard.
  function confirmDiscardChanges() {
    return (
      !hasUnsavedChanges ||
      window.confirm('Discard your unsaved workout changes?')
    );
  }
  function navigateToWeek(next: string) {
    if (saving || !confirmDiscardChanges()) return;
    setActualFocus(null);
    setSelectedWeek(weekStart(next));
    setExpandedWorkoutId(null);
    setHasUnsavedChanges(false);
    setError('');
  }
  function openTodayWorkout(id: string) {
    const todayWeek = weekStart(data.today);
    const alreadyOpen = expandedWorkoutId === id && selectedWeek === todayWeek && filter === 'all';
    if (saving || (!alreadyOpen && !confirmDiscardChanges())) return;
    if (!alreadyOpen) {
      setSelectedWeek(todayWeek);
      setFilter('all');
      setExpandedWorkoutId(id);
      setHasUnsavedChanges(false);
      setError('');
    }
    setActualFocus({ id });
  }
  function toggleWorkoutEditor(id: string) {
    if (saving || !confirmDiscardChanges()) return;
    setActualFocus(null);
    setExpandedWorkoutId(expandedWorkoutId === id ? null : id);
    setHasUnsavedChanges(false);
    setError('');
  }
  function selectFilter(next: Filter) {
    if (saving || !confirmDiscardChanges()) return;
    setActualFocus(null);
    setFilter(next);
    setExpandedWorkoutId(null);
    setHasUnsavedChanges(false);
    setError('');
  }
  function showFirstMissingDistance() {
    if (saving || !confirmDiscardChanges()) return;
    setActualFocus(null);
    const firstWorkoutNeedingDistance = data.workouts
      .filter(
        (workout) =>
          workout.done && isRun(workout) && workout.actualDistance === null,
      )
      .sort((firstWorkout, secondWorkout) =>
        firstWorkout.date.localeCompare(secondWorkout.date),
      )[0];
    if (firstWorkoutNeedingDistance) {
      setSelectedWeek(weekStart(firstWorkoutNeedingDistance.date));
      setFilter('missing');
      setExpandedWorkoutId(firstWorkoutNeedingDistance.id);
      setHasUnsavedChanges(false);
      setError('');
      window.scrollTo({ top: 150, behavior: 'smooth' });
    }
  }
  // Preview edits are local. Live edits update the screen only after a successful API response.
  async function saveWorkout(id: string, input: WorkoutInput) {
    const existing = data.workouts.find(workout => workout.id === id);
    const confirmPlanChange = acceptedPlan(data.plan) && (id === 'new' || !!existing && changesPrescription(existing, input));
    if (confirmPlanChange && !window.confirm('Changing prescribed workouts will mark this generated block as altered. The original plan will be kept. Save these changes?')) return;
    setSaving(true);
    setError('');
    try {
      let savedWorkout: Workout;
      if (preview) {
        const previewInput = id === 'new' ? input : applyCompletion(existing!, input, input.manualResultFields);
        savedWorkout = {
          ...(id === 'new'
            ? newWorkout
            : data.workouts.find((workout) => workout.id === id)!),
          ...previewInput,
          id: id === 'new' ? `preview-workout-${Date.now()}-${Math.random().toString(16).slice(2)}` : id,
          version: input.version + 1,
          updatedAt: new Date().toISOString(),
        };
      } else {
        const response = await fetch(
          id === 'new'
            ? `/api/workouts?blockId=${encodeURIComponent(data.plan.id)}`
            : `/api/workouts/${encodeURIComponent(id)}?blockId=${encodeURIComponent(data.plan.id)}`,
          {
            method: id === 'new' ? 'POST' : 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...input, confirmPlanChange }),
          },
        );
        const result = (await response.json()) as {
          workout: Workout;
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error || 'The workout could not be saved.');
        savedWorkout = result.workout;
      }
      const latestPlan = !preview && confirmPlanChange ? await fetch(`/api/blocks/${encodeURIComponent(data.plan.id)}/setup`).then(response => response.ok ? response.json() as Promise<{ block: Plan }> : null).catch(() => null) : null;
      setData((current) => ({
        ...current,
        plan: latestPlan?.block ?? current.plan,
        workouts:
          id === 'new'
            ? [...current.workouts, savedWorkout]
            : current.workouts.map((workout) =>
                workout.id === id ? savedWorkout : workout,
              ),
      }));
      setSelectedWeek(weekStart(savedWorkout.date));
      setFilter('all');
      setExpandedWorkoutId(null);
      setHasUnsavedChanges(false);
      setActualFocus(null);
      const completedRun = savedWorkout.done && !existing?.done && isRun(savedWorkout);
      const celebrateInHero = completedRun && showToday && savedWorkout.date === data.today;
      if (celebrateInHero) {
        setSavedRunId(savedWorkout.id);
        if (actualFocus?.id === id) {
          const title = document.getElementById('today-workout-title');
          title?.focus({ preventScroll: true });
          title?.scrollIntoView({ block: 'center' });
        }
      }
      else if (savedRunId === savedWorkout.id && (!savedWorkout.done || !isRun(savedWorkout) || savedWorkout.date !== data.today)) {
        setSavedRunId(null);
      }
      setToast(preview
        ? 'Preview updated. Changes are not saved.'
        : completedRun
          ? 'Good miles today. Workout saved.'
          : 'Workout saved. Your progress is up to date.',
      );
    } catch (caughtError) {
      setToast('');
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not connect. Your edits are still here. Try saving again.',
      );
    } finally {
      setSaving(false);
    }
  }
  const latestSavedAt = data.workouts
    .map((workout) => workout.updatedAt)
    .concat(data.plan.updatedAt)
    .sort()
    .at(-1);
  function renderWorkoutCard(workout: Workout) {
    const savedPace = workout.actualPaceSecondsPerMile;
    const copiedPace = workout.resultOrigins?.actualPaceSecondsPerMile;
    const calculatedPace = isRun(workout) && !workout.actualPace.trim() &&
      (savedPace === null || savedPace === copiedPace) ? paceFromRecordedResults(workout) : null;
    const summaryPace = calculatedPace ?? savedPace;
    const showsCopiedResults = Object.keys(workout.resultOrigins ?? {}).some(
      key => key !== 'actualPaceSecondsPerMile' || calculatedPace === null,
    );
    const recordedParts = [
      workout.actualDistance === null ? '' : `${formatNumber(workout.actualDistance)} mi recorded`,
      summaryPace === null ? workout.actualPace : `${formatPace(summaryPace, 'mi')} /mi`,
      workout.actualDurationSeconds === null ? '' : formatDuration(workout.actualDurationSeconds),
    ].filter(Boolean);
    const isExpanded = expandedWorkoutId === workout.id;
    const isOverdue = !workout.done && workout.date < data.today;
    const status = workout.done
      ? 'Completed'
      : workout.date === data.today
        ? 'Today'
        : isOverdue
          ? 'Not logged'
          : 'Planned';
    return (
      <article
        className={`workout-card ${isExpanded ? 'expanded' : ''}`}
        key={workout.id}
      >
        <div className="workout-row"><button
          className="workout-summary"
          aria-expanded={isExpanded}
          onClick={() => toggleWorkoutEditor(workout.id)}
          disabled={saving}
          aria-label={`${isExpanded ? 'Close' : 'Edit'} ${formatWorkoutTitle(workout.type)} on ${formatDate(workout.date)}`}
        >
          <div className={`date-tile ${workout.done ? 'done' : ''}`}>
            <span>
              {formatDate(workout.date, { weekday: 'short' }).toUpperCase()}
            </span>
            <strong>
              {new Date(workout.date + 'T12:00:00Z').getUTCDate()}
            </strong>
          </div>
          <div className="workout-description">
            <div className="workout-title">
              <h3>{formatWorkoutTitle(workout.type)}</h3>
              <WorkoutIcon type={workout.type} />
            </div>
            <p>{workoutSummary(workout)}</p>
            {workout.done &&
              (workout.actualDistance !== null || workout.actualPace || workout.actualPaceSecondsPerMile !== null || workout.actualDurationSeconds !== null) && (
                <span className="actual-summary">
                  {recordedParts.join(' · ')}
                </span>
              )}
            {showsCopiedResults && (
              <span className="copied-result-label">Includes results filled from plan</span>
            )}
          </div>
          <span className="target-preview">{workoutStructure(workout) ? 'Step paces' : workout.plannedPaceSecondsPerMile !== null ? `${formatPace(workout.plannedPaceSecondsPerMile, 'mi')} /mi` : workout.targetPace}</span>
          <span
            className={`status ${workout.done ? 'complete' : isOverdue ? 'unlogged' : workout.date === data.today ? 'today' : ''}`}
          >
            {workout.done && <Check size={13} />} {status}
          </span>
          <Pencil className="edit-icon" size={17} />
        </button><label className="quick-workout-check"><span className="sr-only">Complete {formatWorkoutTitle(workout.type)} on {formatDate(workout.date)}</span><input type="checkbox" checked={workout.done} disabled={saving} onChange={event => { if (confirmDiscardChanges()) void saveWorkout(workout.id, { ...workout, done: event.target.checked }); }} /></label></div>
        {isExpanded && (
          <WorkoutEditor
            key={`${workout.id}:${workout.version}`}
            workout={workout}
            saving={saving}
            error={error}
            onSave={(input) => saveWorkout(workout.id, input)}
            onCancel={() => {
              if (confirmDiscardChanges()) {
                setExpandedWorkoutId(null);
                setActualFocus(null);
                setHasUnsavedChanges(false);
                setError('');
              }
            }}
            onDirty={setHasUnsavedChanges}
          />
        )}
      </article>
    );
  }
  return (
    <div className="app-shell">
      <AppHeader displayName={data.displayName} preview={preview} />
      <main className="main-content">
        {showToday && <TodayWorkout data={data} savedRunId={savedRunId} saving={saving} progressHref={progressHref}
          onOpenWorkout={openTodayWorkout} onProgress={event => { if (!confirmDiscardChanges()) event.preventDefault(); }} />}
        <a className="block-breadcrumb" href={preview ? '/preview?view=blocks' : '/blocks'}><ChevronLeft size={15} /> All training blocks</a>
        <section className="page-heading block-detail-heading">
          <div>
            <div className="block-title-row">
              {showToday ? <h2 className="block-race-title">{data.plan.raceName}</h2> : <h1>{data.plan.raceName}</h1>}
              <div className="block-header-controls" role="group" aria-label="Block management">
                <BlockActions plan={data.plan} activeBlock={currentActive} preview={preview} disabled={saving || hasUnsavedChanges} ready={blockReady({ ...data.plan, workoutCount: data.workouts.length })} onChanged={block => {
                  setData(current => ({ ...current, plan: block }));
                  if (block.status === 'active') setCurrentActive({ id: block.id, raceName: block.raceName });
                  else if (currentActive?.id === block.id) setCurrentActive(null);
                  setToast('Block status updated. Your workout results are unchanged.');
                }} />
                <a className="icon-button block-settings-link" aria-label="Training block settings" onClick={event => { if (!confirmDiscardChanges()) event.preventDefault(); }} href={preview ? '/preview?view=settings' : `/blocks/${encodeURIComponent(data.plan.id)}/settings`}><Settings2 size={19} /></a>
              </div>
            </div>
            <div className="block-header-details">
              <span>Target date: {formatDate(data.plan.raceDate, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              <span><span className="dot" aria-hidden="true">·</span> {simulatedBlock(data.plan) ? 'SIMULATION · Example schedule' : acceptedPlan(data.plan) ? data.plan.generation?.alteredAt ? 'OpenAI plan · Altered' : 'OpenAI training plan' : data.plan.sourceName ? 'Imported training log' : data.plan.setup ? 'Guided setup' : 'Manual training block'}</span>
              <span><span className="dot" aria-hidden="true">·</span> {data.workouts.length} {data.workouts.length === 1 ? 'workout' : 'workouts'}</span>
            </div>
          </div>
          <div className="countdown">
            <Flag size={20} />
            <div>
              <strong>
                {daysToRace > 0
                  ? daysToRace
                  : daysToRace === 0
                    ? 'Race day'
                    : Math.abs(daysToRace)}
              </strong>
              <span>
                {daysToRace > 0
                  ? 'days to race'
                  : daysToRace === 0
                    ? 'You made it here'
                    : 'days since race'}
              </span>
            </div>
          </div>
        </section>
        {preview && (
          <div className="preview-notice">
            <Info size={16} /> Internal preview with example workouts. Changes
            here are not saved.
          </div>
        )}
        {simulatedBlock(data.plan) && <p className="block-callout" role="status"><strong>Simulation mode.</strong> This example schedule demonstrates the app flow. It is not a personalized running plan and cannot be activated.</p>}
        {data.plan.setup && <section className="block-callout setup-snapshot-notice"><Flag size={21} /><div><strong>Your starting setup is saved with this block.</strong><p>{raceDistanceLabel(data.plan.setup.goal.distanceKm)} · Target {setupTargetTime(data.plan.setup) || 'time not set'} · {data.plan.setup.availability.days.length} available running days</p>{acceptedPlan(data.plan) ? <p>{data.plan.generation?.alteredAt ? 'Altered since acceptance. Your original generated plan is preserved.' : 'Your generated plan is saved. Workout logging does not change the original prescription.'} <a href={`/blocks/${encodeURIComponent(data.plan.id)}/plan`}>View original plan →</a></p> : <p>Generate a schedule before starting this block.</p>}<a className="button" href={preview ? '/preview?view=setup' : `/blocks/${encodeURIComponent(data.plan.id)}/setup`}>{data.plan.status === 'draft' && !acceptedPlan(data.plan) ? 'Continue guided setup' : 'View starting setup'}</a></div></section>}
        {data.workouts.length === 0 && !data.plan.setup && <div className="block-callout block-empty-guide"><Flag size={20} /><div><strong>Your training starts with one workout.</strong><p>Add your own schedule below.{data.plan.status === 'draft' ? ' This block is a draft until you activate it.' : ''}</p>{data.plan.status === 'draft' && <a className="text-link" href={preview ? '/preview?view=setup' : `/blocks/${encodeURIComponent(data.plan.id)}/setup`}>Or start guided setup for this empty draft →</a>}</div></div>}
        <div className="content-grid">
          <section
            className="training-section"
            aria-label="Weekly workout tracker"
          >
            <div className="week-toolbar">
              <div className="week-controls">
                <div className="arrow-group">
                  <button
                    className="icon-button"
                    aria-label="Previous week"
                    onClick={() => navigateToWeek(addDays(selectedWeek, -7))}
                    disabled={saving}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Next week"
                    onClick={() => navigateToWeek(addDays(selectedWeek, 7))}
                    disabled={saving}
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
                <div>
                  <label className="week-select-label">
                    <span className="sr-only">Select training week</span>
                    <select
                      className="week-select"
                      value={selectedWeek}
                      onChange={(event) => navigateToWeek(event.target.value)}
                    >
                      {[...new Set([...trainingWeeks, selectedWeek])]
                        .sort()
                        .map((workout) => (
                          <option value={workout} key={workout}>
                            {formatDate(workout, {
                              month: 'long',
                              day: 'numeric',
                            })}
                            {' – '}
                            {formatDate(addDays(workout, 6), {
                              month: 'short',
                              day: 'numeric',
                            })}
                            , {workout.slice(0, 4)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <span className="week-phase">
                    {selectedPhase ?? 'Training week'}
                  </span>
                </div>
              </div>
              <div className="button-group">
                <button
                  className="button"
                  onClick={() => navigateToWeek(data.today)}
                  disabled={saving}
                >
                  Today
                </button>
                <button
                  className="button add-button"
                  aria-label="Add workout"
                  onClick={() => {
                    if (confirmDiscardChanges()) {
                      setExpandedWorkoutId('new');
                      setHasUnsavedChanges(false);
                      setError('');
                      setFilter('all');
                    }
                  }}
                  disabled={saving || (!!data.plan.setup && !acceptedPlan(data.plan))}
                >
                  <Plus size={16} aria-hidden="true" />
                  <span>Add workout</span>
                </button>
              </div>
            </div>
            <div className="filter-toolbar">
              <div
                className="filter-tabs"
                role="group"
                aria-label="Filter workouts"
              >
                {(
                  [
                    ['all', 'All workouts'],
                    ['runs', 'Runs'],
                    ['support', 'Strength & mobility'],
                  ] as [Filter, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={`filter-tab ${filter === value ? 'active' : ''}`}
                    aria-pressed={filter === value}
                    onClick={() => selectFilter(value)}
                  >
                    {label}
                  </button>
                ))}
                {filter === 'missing' && (
                  <button
                    className="filter-tab active"
                    onClick={() => selectFilter('all')}
                  >
                    Missing distance <X size={12} />
                  </button>
                )}
              </div>
              <span className="weekly-count">
                <strong>
                  {weeklyWorkouts.filter((workout) => workout.done).length}
                </strong>
                {' / '}
                {weeklyWorkouts.length} completed
              </span>
            </div>
            <div className="workout-list">
              {visibleWorkouts.map(renderWorkoutCard)}
              {expandedWorkoutId === 'new' && (
                <article className="workout-card expanded new-workout">
                  <div className="new-workout-heading">
                    <Plus size={18} />
                    <h3>Add a workout</h3>
                  </div>
                  <WorkoutEditor
                    key={`new:${selectedWeek}`}
                    workout={newWorkout}
                    saving={saving}
                    error={error}
                    onSave={(input) => saveWorkout('new', input)}
                    onCancel={() => {
                      if (confirmDiscardChanges()) {
                        setExpandedWorkoutId(null);
                        setHasUnsavedChanges(false);
                        setError('');
                      }
                    }}
                    onDirty={setHasUnsavedChanges}
                  />
                </article>
              )}
              {!visibleWorkouts.length && expandedWorkoutId !== 'new' && (
                <div className="empty-week">
                  <Flag size={29} />
                  <h3>
                    {filter === 'missing'
                      ? 'No missing distances this week'
                      : weeklyWorkouts.length
                        ? 'No matching workouts'
                        : 'A little breathing room'}
                  </h3>
                  <p>
                    {filter === 'missing'
                      ? 'Choose another week or show all workouts.'
                      : weeklyWorkouts.length
                        ? 'Try another filter to see the rest of your week.'
                        : 'No workouts are scheduled here. Choose another week or add one.'}
                  </p>
                  <button
                    className="button"
                    onClick={() =>
                      filter !== 'all'
                        ? selectFilter('all')
                        : navigateToWeek(data.today)
                    }
                  >
                    {filter !== 'all'
                      ? 'Show all workouts'
                      : 'Back to this week'}
                  </button>
                </div>
              )}
            </div>
            <div className="tracker-help">
              <Info size={14} />
              <span>
                Select a workout to log results, change its date, or edit the
                plan.
              </span>
            </div>
          </section>
          <aside className="dashboard" aria-label="Overall training progress">
            <div className="dashboard-title">
              <h2>Your progress</h2>
              <a className="button primary progress-expanded-link" href={progressHref}>View progress <ArrowUpRight size={13} aria-hidden="true" /></a>
            </div>
            <section className="panel progress-panel">
              <div className="panel-title">
                <h3>Workouts completed</h3>
                <Activity size={17} />
              </div>
              <div className="progress-headline">
                <strong>
                  {progress.percent}
                  <span>%</span>
                </strong>
                <span>
                  {progress.completed} of {progress.total} workouts
                </span>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-label="Plan completed"
                aria-valuenow={progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${progress.percent}%` }} />
              </div>
              <p className="small-muted">Includes future workouts</p>
              <div className="stat-grid">
                <div>
                  <strong>{progress.runs}</strong>
                  <span>Runs completed</span>
                </div>
                <div>
                  <strong>{progress.support}</strong>
                  <span>Strength & mobility</span>
                </div>
                <div>
                  <strong>
                    {formatNumber(progress.miles)} <small>mi</small>
                  </strong>
                  <span>Recorded mileage</span>
                </div>
                <div>
                  <strong>
                    {progress.longest === null
                      ? '—'
                      : formatNumber(progress.longest)}{' '}
                    <small>mi</small>
                  </strong>
                  <span>Longest recorded run</span>
                </div>
              </div>
              <div className="through-date">
                <span>Through yesterday</span>
                <strong>
                  {progress.dueCompleted} / {progress.due} completed
                </strong>
              </div>
            </section>
            {progress.missingDistance > 0 && (
              <button
                className="missing-alert"
                onClick={showFirstMissingDistance}
              >
                <Info size={16} />
                <span>
                  {progress.missingDistance}
                  {' completed '}
                  {progress.missingDistance === 1 ? 'run needs' : 'runs need'}
                  {' distance'}
                </span>
                <ArrowUpRight size={16} />
              </button>
            )}
            <section className="panel milestones-panel">
              <div className="panel-title">
                <h3>Milestones</h3>
                <Trophy size={17} />
              </div>
              <p className="section-eyebrow">Distance</p>
              <div className="distance-milestones">
                {distanceProgress.map((milestone) => (
                  <div
                    className={`distance-milestone ${milestone.workout ? 'achieved' : ''}`}
                    key={milestone.distance}
                    title={
                      milestone.workout
                        ? `First recorded on ${formatDate(milestone.workout.date, { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : `Complete a recorded run of at least ${milestone.distance} miles`
                    }
                  >
                    <span>
                      {milestone.workout ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <span className="milestone-circle" />
                      )}
                    </span>
                    <strong>{milestone.distance}</strong>
                    <small>miles</small>
                  </div>
                ))}
              </div>
              <p className="milestone-caption">
                Based on completed runs with a recorded distance.
              </p>
              <div className="phase-heading">
                <p className="section-eyebrow">Training phases</p>
                <span>Completed / planned</span>
              </div>
              <div className="phase-list">
                {phaseProgress
                  .filter((phaseEntry) => phaseEntry.total)
                  .map((phaseEntry) => (
                    <div
                      className={`phase-item ${phaseEntry.state}`}
                      key={phaseEntry.phase}
                    >
                      <span className="phase-dot">
                        {phaseEntry.state === 'complete' && <Check size={10} />}
                      </span>
                      <span>
                        {phaseEntry.phase}
                        <small>
                          {phaseEntry.state === 'complete'
                            ? 'Complete'
                            : phaseEntry.state === 'past'
                              ? 'Past dates'
                              : phaseEntry.state === 'current'
                                ? 'Current phase'
                                : 'Upcoming'}
                        </small>
                      </span>
                      <strong>
                        {phaseEntry.done}
                        <span> / {phaseEntry.total}</span>
                      </strong>
                    </div>
                  ))}
              </div>
            </section>
            <section className="panel mileage-panel">
              <div className="panel-title">
                <h3>Weekly mileage</h3>
                <Footprints size={17} />
              </div>
              <p className="small-muted">
                Recorded miles · six weeks ending {formatDate(weekEnd)}
              </p>
              <div
                className="mileage-chart"
                role="img"
                aria-label={weeklyMileage
                  .map(
                    (weekMileage) =>
                      `Week of ${weekMileage.start}: ${weekMileage.miles} recorded miles${weekMileage.missing ? `, ${weekMileage.missing} runs missing distance` : ''}`,
                  )
                  .join('; ')}
              >
                {weeklyMileage.map((weekMileage, weekIndex) => (
                  <div className="chart-column" key={weekMileage.start}>
                    <strong>
                      {weekMileage.miles === 0 && weekMileage.missing
                        ? '—'
                        : formatNumber(weekMileage.miles)}
                      {weekMileage.missing ? '*' : ''}
                    </strong>
                    <div className="bar-space">
                      <span
                        className={weekIndex === 5 ? 'current-bar' : ''}
                        style={{
                          height: `${Math.max((weekMileage.miles / maxWeeklyMiles) * 100, weekMileage.miles ? 5 : 0)}%`,
                        }}
                      />
                    </div>
                    <small>
                      {formatDate(weekMileage.start, {
                        month: 'numeric',
                        day: 'numeric',
                      })}
                    </small>
                  </div>
                ))}
              </div>
              <p className="milestone-caption">
                {weeklyMileage.some((weekMileage) => weekMileage.missing)
                  ? '* Some completed runs have no distance recorded.'
                  : 'Running workouts only. Weeks start on Monday.'}
              </p>
            </section>
            {data.plan.paceGuide.length > 0 && (
              <section className="panel pace-panel">
                <div className="panel-title">
                  <h3>Quick pace guide</h3>
                  <Flag size={16} />
                </div>
                {data.plan.paceGuide.map((paceEntry) => (
                  <div className="pace-row" key={paceEntry.type}>
                    <div>
                      <strong>{paceEntry.type}</strong>
                      <span>{paceEntry.target}</span>
                    </div>
                    <p>{paceEntry.rule}</p>
                  </div>
                ))}
              </section>
            )}
          </aside>
        </div>
        {error && !expandedWorkoutId && <p className="form-error" role="alert">{error}</p>}
        <footer className="app-footer">
          <div>
            <span className="footer-dot" />{' '}
            {data.plan.sourceName
              ? 'Plan imported from your workbook'
              : 'Personal training plan'}
            <span className="footer-divider">·</span>Dates use Central time
          </div>
          <span>
            {latestSavedAt
              ? `Last saved ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(latestSavedAt))}`
              : ''}
          </span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button
            onClick={() => setToast('')}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}

    </div>
  );
}
