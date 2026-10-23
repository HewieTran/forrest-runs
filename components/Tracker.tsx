'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Activity,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Dumbbell,
  Flag,
  Footprints,
  Info,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Plus,
  Settings2,
  Trophy,
  X,
} from 'lucide-react';
import {
  addDays,
  dateDiff,
  distanceMilestones,
  formatDate,
  isRun,
  mileageWeeks,
  PHASES,
  phaseMilestones,
  summarize,
  TYPES,
  weekStart,
  type AppData,
  type Workout,
  type WorkoutInput,
} from '../lib/domain';
const formatNumber = (value: number) =>
  value.toLocaleString('en-US', { maximumFractionDigits: 2 });
const formatWorkoutTitle = (workoutType: string) =>
  workoutType === 'Race' ? 'Race day' : workoutType.replace(' Run', ' run');
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

function WorkoutEditor({
  workout,
  saving,
  error,
  onSave,
  onCancel,
  onDirty,
}: {
  workout: Workout;
  saving: boolean;
  error: string;
  onSave: (value: WorkoutInput) => void;
  onCancel: () => void;
  onDirty: (hasUnsavedChanges: boolean) => void;
}) {
  // Keep form edits local until the server confirms the save.
  const [draft, setDraft] = useState({
    ...workout,
    actualDistance:
      workout.actualDistance === null ? '' : String(workout.actualDistance),
    effort: workout.effort === null ? '' : String(workout.effort),
  });
  function update(key: string, value: unknown) {
    setDraft((previousDraft) => ({ ...previousDraft, [key]: value }));
    onDirty(true);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      date: draft.date,
      phase: draft.phase,
      type: draft.type,
      plannedWorkout: draft.plannedWorkout,
      targetPace: draft.targetPace,
      done: draft.done,
      actualDistance:
        draft.actualDistance.trim() === ''
          ? null
          : Number(draft.actualDistance),
      actualPace: draft.actualPace,
      effort: draft.effort.trim() === '' ? null : Number(draft.effort),
      pain: draft.pain,
      notes: draft.notes,
      version: workout.version,
    });
  }
  const painOptions = ['', 'None', 'Mild', 'Moderate', 'Severe'];
  if (!painOptions.includes(draft.pain)) painOptions.push(draft.pain);
  return (
    <form className="workout-form" onSubmit={submit}>
      <fieldset disabled={saving}>
        <legend className="section-eyebrow">Plan</legend>
        <div className="form-grid plan-grid">
          <label>
            Date
            <input
              type="date"
              min="1900-01-01"
              max="2200-12-31"
              value={draft.date}
              onInput={(event) => update('date', event.currentTarget.value)}
              onChange={(event) => update('date', event.target.value)}
              required
            />
          </label>
          <label>
            Workout type
            <select
              value={draft.type}
              onChange={(event) => update('type', event.target.value)}
            >
              {TYPES.map((workoutType) => (
                <option key={workoutType}>{workoutType}</option>
              ))}
            </select>
          </label>
          <label>
            Training phase
            <select
              value={draft.phase}
              onChange={(event) => update('phase', event.target.value)}
            >
              {PHASES.map((phaseEntry) => (
                <option key={phaseEntry}>{phaseEntry}</option>
              ))}
            </select>
          </label>
          <label className="span-two">
            Planned workout
            <input
              value={draft.plannedWorkout}
              maxLength={1000}
              required
              onChange={(event) => update('plannedWorkout', event.target.value)}
            />
          </label>
          <label>
            Target pace / effort
            <input
              value={draft.targetPace}
              maxLength={1000}
              onChange={(event) => update('targetPace', event.target.value)}
            />
          </label>
        </div>
      </fieldset>
      <fieldset disabled={saving}>
        <legend className="section-eyebrow">Actual</legend>
        <div className="form-grid actual-grid">
          <label>
            Distance (mi)
            <input
              type="number"
              min="0"
              max="1000"
              step="any"
              inputMode="decimal"
              placeholder="e.g. 5.0"
              value={draft.actualDistance}
              onChange={(event) => update('actualDistance', event.target.value)}
            />
          </label>
          <label>
            Pace / activity
            <input
              value={draft.actualPace}
              placeholder={isRun(workout) ? 'mm:ss /mi' : 'e.g. climbing'}
              maxLength={1000}
              onChange={(event) => update('actualPace', event.target.value)}
            />
          </label>
          <label>
            Effort (1–10)
            <input
              type="number"
              min="1"
              max="10"
              step="1"
              placeholder="Optional"
              value={draft.effort}
              onChange={(event) => update('effort', event.target.value)}
            />
          </label>
          <label>
            Pain
            <select
              value={draft.pain}
              onChange={(event) => update('pain', event.target.value)}
            >
              {painOptions.map((value) => (
                <option key={value} value={value}>
                  {value || 'Not recorded'}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="notes-label">
          Notes
          <textarea
            rows={2}
            value={draft.notes}
            maxLength={10000}
            placeholder="How did it feel?"
            onChange={(event) => update('notes', event.target.value)}
          />
        </label>
      </fieldset>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="editor-footer">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={draft.done}
            disabled={saving}
            onChange={(event) => update('done', event.target.checked)}
          />
          Workout completed
        </label>
        <div className="button-group">
          <button
            type="button"
            className="button quiet"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button className="button primary" disabled={saving} type="submit">
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}{' '}
            {saving ? 'Saving…' : 'Save workout'}
          </button>
        </div>
      </div>
      <p className="field-hint">
        Leave unknown results blank. Completed workouts can have missing
        distances.
      </p>
    </form>
  );
}

function RaceSettings({
  data,
  onClose,
  onSaved,
  preview,
}: {
  data: AppData;
  onClose: () => void;
  onSaved: (data: AppData) => void;
  preview: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [raceName, setRaceName] = useState(data.plan.raceName);
  const [raceDate, setRaceDate] = useState(data.plan.raceDate);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    dialogRef.current?.showModal();
    const dialog = dialogRef.current;
    return () => {
      dialog?.close();
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (preview) {
        onSaved({
          ...data,
          plan: { ...data.plan, raceName: raceName, raceDate: raceDate },
        });
        onClose();
        return;
      }
      const response = await fetch('/api/training', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raceName: raceName,
          raceDate: raceDate,
          version: data.plan.version,
        }),
      });
      const result = (await response.json()) as AppData & { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'Settings could not be saved.');
      onSaved(result);
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      onCancel={(event) => {
        if (saving) event.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <p className="section-eyebrow">Your finish line</p>
          <h2>Race settings</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close race settings"
          disabled={saving}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <form onSubmit={submit}>
        <label>
          Race name
          <input
            value={raceName}
            onChange={(event) => setRaceName(event.target.value)}
            maxLength={120}
            required
            disabled={saving}
          />
        </label>
        <label>
          Race date
          <input
            type="date"
            min="1900-01-01"
            max="2200-12-31"
            value={raceDate}
            onInput={(event) => setRaceDate(event.currentTarget.value)}
            onChange={(event) => setRaceDate(event.target.value)}
            required
            disabled={saving}
          />
        </label>
        <p className="field-hint">
          Changing the race date updates the countdown. Workout dates stay as
          scheduled.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </dialog>
  );
}

export default function Tracker({
  initial,
  preview = false,
}: {
  initial: AppData;
  preview?: boolean;
}) {
  const [data, setData] = useState(initial);
  const [selectedWeek, setSelectedWeek] = useState(weekStart(initial.today));
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
  const [showRaceSettings, setShowRaceSettings] = useState(false);
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
    id: 'new',
    planId: data.plan.id,
    date:
      selectedWeek <= data.today && weekEnd >= data.today
        ? data.today
        : selectedWeek,
    phase: selectedPhase ?? 'Base Build',
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
  // Navigation and editor changes share the same unsaved-change guard.
  function confirmDiscardChanges() {
    return (
      !hasUnsavedChanges ||
      window.confirm('Discard your unsaved workout changes?')
    );
  }
  function navigateToWeek(next: string) {
    if (saving || !confirmDiscardChanges()) return;
    setSelectedWeek(weekStart(next));
    setExpandedWorkoutId(null);
    setHasUnsavedChanges(false);
    setError('');
  }
  function toggleWorkoutEditor(id: string) {
    if (saving || !confirmDiscardChanges()) return;
    setExpandedWorkoutId(expandedWorkoutId === id ? null : id);
    setHasUnsavedChanges(false);
    setError('');
  }
  function selectFilter(next: Filter) {
    if (saving || !confirmDiscardChanges()) return;
    setFilter(next);
    setExpandedWorkoutId(null);
    setHasUnsavedChanges(false);
    setError('');
  }
  function showFirstMissingDistance() {
    if (saving || !confirmDiscardChanges()) return;
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
    setSaving(true);
    setError('');
    try {
      let savedWorkout: Workout;
      if (preview) {
        savedWorkout = {
          ...(id === 'new'
            ? newWorkout
            : data.workouts.find((workout) => workout.id === id)!),
          ...input,
          id: id === 'new' ? crypto.randomUUID() : id,
          version: input.version + 1,
          updatedAt: new Date().toISOString(),
        };
      } else {
        const response = await fetch(
          id === 'new'
            ? '/api/workouts'
            : `/api/workouts/${encodeURIComponent(id)}`,
          {
            method: id === 'new' ? 'POST' : 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
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
      setData((current) => ({
        ...current,
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
      setToast(
        preview
          ? 'Preview updated. Changes are not saved.'
          : 'Workout saved. Your progress is up to date.',
      );
    } catch (caughtError) {
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
        <button
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
            <p>{workout.plannedWorkout}</p>
            {workout.done &&
              (workout.actualDistance !== null || workout.actualPace) && (
                <span className="actual-summary">
                  {workout.actualDistance !== null
                    ? `${formatNumber(workout.actualDistance)} mi recorded`
                    : ''}
                  {workout.actualDistance !== null && workout.actualPace
                    ? ' · '
                    : ''}
                  {workout.actualPace}
                </span>
              )}
          </div>
          <span className="target-preview">{workout.targetPace}</span>
          <span
            className={`status ${workout.done ? 'complete' : isOverdue ? 'unlogged' : workout.date === data.today ? 'today' : ''}`}
          >
            {workout.done && <Check size={13} />} {status}
          </span>
          <Pencil className="edit-icon" size={17} />
        </button>
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
      <header className="app-header">
        <div className="header-inner">
          <a
            href="/"
            className="brand"
            onClick={(event) => {
              if (hasUnsavedChanges && !confirmDiscardChanges())
                event.preventDefault();
            }}
          >
            <span className="brand-icon">
              <Activity size={23} />
            </span>
            <span>Marathon training</span>
          </a>
          <div className="header-actions">
            {preview && <span className="preview-tag">Design preview</span>}
            <span className="private-label">
              <LockKeyhole size={13} /> Private training log
            </span>
            <a
              className="button quiet export-button"
              href={preview ? undefined : '/api/export'}
              onClick={(event) => {
                if (preview) event.preventDefault();
              }}
              aria-disabled={preview}
            >
              <Download size={16} />
              <span>Export backup</span>
            </a>
            <span className="avatar" title={data.displayName}>
              {data.displayName[0]?.toUpperCase() || 'R'}
            </span>
          </div>
        </div>
      </header>
      <main className="main-content">
        <section className="page-heading">
          <div>
            <div className="overline">Your road to race day</div>
            <h1>Training log</h1>
            <button
              className="race-subtitle"
              onClick={() => setShowRaceSettings(true)}
            >
              <span>{data.plan.raceName}</span>
              <span className="dot">·</span>
              <span>
                {formatDate(data.plan.raceDate, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
              <Settings2 size={15} />
            </button>
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
                  onClick={() => {
                    if (confirmDiscardChanges()) {
                      setExpandedWorkoutId('new');
                      setHasUnsavedChanges(false);
                      setError('');
                      setFilter('all');
                    }
                  }}
                  disabled={saving}
                >
                  <Plus size={16} />
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
              <span
                className="live-dot"
                title="Calculated from saved workouts"
              />
            </div>
            <section className="panel progress-panel">
              <div className="panel-title">
                <h3>Plan completed</h3>
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
      {showRaceSettings && (
        <RaceSettings
          data={data}
          preview={preview}
          onClose={() => setShowRaceSettings(false)}
          onSaved={(value) => {
            setData(value);
            setToast('Race settings saved.');
          }}
        />
      )}
    </div>
  );
}
