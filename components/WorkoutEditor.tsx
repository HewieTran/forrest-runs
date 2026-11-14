'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Check, Link2, LoaderCircle } from 'lucide-react';
import { isRun, WORKOUT_PHASES, TYPES, validDate, validateWorkout, type Workout, type WorkoutInput } from '../lib/domain';
import { applyCompletion, paceFromRecordedResults, type ResultField as CopiedField } from '../lib/workout-completion';
import {
  changePlanUnit, editLinkedPlan, formatDistance, formatDuration, formatPace,
  initialLinkedPlan, inputFeedback, parseInput, pastedWorkoutTime, workoutTimeText, PLAN_FIELDS,
  type DistanceUnit, type InputKind, type PlanField,
} from '../lib/workout-form';
import '../app/workout-editor.css';
import WorkoutSteps from './WorkoutSteps';
import { workoutStructure, structureMeasurements, sessionDuration, readableDuration, readableDistance, type WorkoutStructure } from '../lib/workout-structure';

type ResultField = 'actualDistance' | 'actualDuration' | 'actualPace' | 'effort';
type ErrorField = InputKind | 'date';

type TimeField = 'pace' | 'duration' | 'actualPace' | 'actualDuration';
const isTimeField = (key: InputKind): key is TimeField =>
  key === 'pace' || key === 'duration' || key === 'actualPace' || key === 'actualDuration';

function WorkoutTimeInput({ id, name, value, unit, invalid, onChange, onBlur }: {
  id: string; name: TimeField; value: string; unit: DistanceUnit; invalid: boolean;
  onChange: (value: string) => void; onBlur: () => void;
}) {
  const [entry, setEntry] = useState<{ text: string; parts: string[] } | null>(null);
  const pace = name === 'pace' || name === 'actualPace';
  const labels = pace ? ['Minutes', 'Seconds'] : ['Hours', 'Minutes', 'Seconds'];
  // Reformat when another measurement calculates this field or its units change.
  const parts = entry?.text === value ? entry.parts : value.split(':');
  return <div className="measurement-time-input" role="group" aria-labelledby={`${id}-label`}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onBlur(); }}
    onPaste={event => {
      const text = pastedWorkoutTime(event.clipboardData.getData('text'), name, unit);
      if (text === null) return;
      event.preventDefault();
      setEntry(null);
      onChange(text);
    }}>
    {labels.map((label, index) => <label key={label}>
      <span id={`${id}-${index}-part`}>{label}</span>
      <input id={index === 0 ? id : `${id}-${index}`} name={index === 0 ? name : undefined} type="text" inputMode="numeric"
        value={parts[index] ?? ''} maxLength={20}
        aria-labelledby={`${id}-label ${id}-${index}-part`} aria-invalid={invalid} aria-describedby={`${id}-feedback`}
        onChange={event => {
          const next = labels.map((_, part) => part === index ? event.target.value.trim() : parts[part] ?? '');
          const text = workoutTimeText(next);
          setEntry({ text, parts: next });
          onChange(text);
        }} />
    </label>)}
  </div>;
}

export default function WorkoutEditor({ workout, saving, error, onSave, onCancel, onDirty }: {
  workout: Workout; saving: boolean; error: string;
  onSave: (value: WorkoutInput) => void; onCancel: () => void; onDirty: (dirty: boolean) => void;
}) {
  const id = useId(), form = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState(workout);
  const [unit, setUnit] = useState<DistanceUnit>('mi');
  const [plan, setPlan] = useState(() => initialLinkedPlan(workout));
  const [planChanged, setPlanChanged] = useState(false);
  const [structure, setStructure] = useState(() => workoutStructure(workout));
  const [structureChanged, setStructureChanged] = useState(false);
  const [stepsValid, setStepsValid] = useState(true);
  const [results, setResults] = useState({
    actualDistance: formatDistance(workout.actualDistance, 'mi'),
    actualDuration: formatDuration(workout.actualDurationSeconds),
    actualPace: formatPace(workout.actualPaceSecondsPerMile, 'mi'),
    effort: workout.effort === null ? '' : String(workout.effort),
  });
  const [changedResults, setChangedResults] = useState<Set<ResultField>>(new Set());
  const [exactResults, setExactResults] = useState({ actualDistance: workout.actualDistance, actualPace: workout.actualPaceSecondsPerMile, actualDuration: workout.actualDurationSeconds });
  const [touched, setTouched] = useState<Set<ErrorField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [localError, setLocalError] = useState('');
  const running = isRun(draft);
  const activeFields: ErrorField[] = ['date', ...(structure ? [] : PLAN_FIELDS), 'actualDistance', 'actualDuration', 'actualPace', 'effort'];
  function editStructure(next: WorkoutStructure) {
    setStructure(next); setStructureChanged(true); setPlanChanged(true);
    setPlan(changePlanUnit(initialLinkedPlan({ ...draft, ...structureMeasurements(next) }), unit));
    onDirty(true); setLocalError('');
  }

  function update<K extends keyof Workout>(key: K, value: Workout[K]) {
    setDraft(previous => ({ ...previous, [key]: value })); onDirty(true); setLocalError('');
  }
  function editPlan(key: PlanField, value: string) {
    setPlan(previous => editLinkedPlan(previous, key, value, unit, running));
    setPlanChanged(true); onDirty(true); setLocalError('');
    setTouched(previous => { const next = new Set(previous); next.delete(key); return next; });
  }
  function editResult(key: ResultField, value: string) {
    setResults(previous => ({ ...previous, [key]: value }));
    if (key !== 'effort') setExactResults(previous => ({ ...previous, [key]: parseInput(value, key, unit) }));
    setChangedResults(previous => new Set(previous).add(key)); onDirty(true); setLocalError('');
    setTouched(previous => { const next = new Set(previous); next.delete(key); return next; });
  }
  function toggleCompleted(done: boolean) {
    const manual = [...changedResults].filter(key => key !== 'effort').map(key => key === 'actualDuration' ? 'actualDurationSeconds' : key === 'actualPace' ? 'actualPaceSecondsPerMile' : key) as CopiedField[];
    const before = { ...draft, actualDistance: exactResults.actualDistance, actualDurationSeconds: exactResults.actualDuration, actualPaceSecondsPerMile: exactResults.actualPace,
      plannedDistance: plan.exact.distance, plannedDurationSeconds: plan.exact.duration, plannedPaceSecondsPerMile: plan.exact.pace };
    const next = applyCompletion(before, { done }, manual);
    setDraft(next);
    setExactResults({ actualDistance: next.actualDistance, actualDuration: next.actualDurationSeconds ?? null, actualPace: next.actualPaceSecondsPerMile ?? null });
    setResults(current => ({ ...current, actualDistance: formatDistance(next.actualDistance, unit), actualDuration: formatDuration(next.actualDurationSeconds ?? null), actualPace: formatPace(next.actualPaceSecondsPerMile ?? null, unit) }));
    onDirty(true);
  }
  function feedback(key: ErrorField, strict = submitted || touched.has(key)) {
    if (key === 'date') return !validDate(draft.date) && strict ? { state: 'error' as const, message: 'Choose a valid date from 1900 to 2200.' } : null;
    const value = PLAN_FIELDS.includes(key as PlanField) ? plan.text[key as PlanField] : results[key as ResultField];
    const issue = inputFeedback(value, key, unit, strict);
    if (!issue || !isTimeField(key)) return issue;
    const pace = key === 'pace' || key === 'actualPace';
    if (value.split(':').slice(1).some(part => Number(part) >= 60)) return issue;
    return { ...issue, message: pace ? 'Enter a pace greater than zero, using whole minutes and seconds.'
      : `Enter a duration ${key === 'duration' ? 'greater than zero and ' : ''}up to 168 hours, using whole numbers.` };
  }
  function changeUnit(next: DistanceUnit) {
    const nextResults = { ...results };
    const distance = exactResults.actualDistance;
    const pace = exactResults.actualPace;
    if (distance !== null) nextResults.actualDistance = formatDistance(distance, next);
    if (pace !== null) nextResults.actualPace = formatPace(pace, next);
    setResults(nextResults); setPlan(previous => changePlanUnit(previous, next)); setUnit(next);
  }
  function measurementField(key: InputKind, label: string, suffix: string, calculated = false) {
    const issue = feedback(key), planned = PLAN_FIELDS.includes(key as PlanField);
    const value = planned ? plan.text[key as PlanField] : results[key as ResultField];
    const fieldId = `${id}-${key}`;
    const markTouched = () => setTouched(previous => new Set(previous).add(key));
    const updateValue = (value: string) => planned ? editPlan(key as PlanField, value) : editResult(key as ResultField, value);
    const heading = <span id={`${fieldId}-label`} className="measurement-label">
      <span>{label}{isTimeField(key) && suffix && <small className="measurement-unit"> {suffix}</small>}</span>
      {calculated && <small className="calculated-label">{planPaused ? 'Paused' : 'Calculated'}</small>}
    </span>;
    const notice = <span id={`${fieldId}-feedback`} className={`measurement-feedback ${issue?.state === 'error' ? 'is-error' : ''}`} aria-live="polite" hidden={!issue}>
      {issue?.state === 'error' && <span aria-hidden="true">ⓘ </span>}{issue?.message}
    </span>;
    const className = `measurement-field ${calculated ? 'calculated-field' : ''}`;
    if (isTimeField(key)) return <div className={`${className} measurement-time-field`} key={key}>
      {heading}
      <WorkoutTimeInput id={fieldId} name={key} value={value} unit={unit}
        invalid={issue?.state === 'error'} onChange={updateValue} onBlur={markTouched} />
      {notice}
    </div>;
    return <label className={className} key={key}>
      {heading}
      <span className="measurement-input"><input
        id={fieldId} name={key} type="text" inputMode={key === 'effort' ? 'numeric' : 'decimal'}
        value={value} placeholder="Optional" maxLength={20}
        aria-invalid={issue?.state === 'error'} aria-describedby={`${fieldId}-feedback`}
        onChange={event => updateValue(event.target.value)} onBlur={markTouched}
      />{suffix && <span className="measurement-unit">{suffix}</span>}</span>
      {notice}
    </label>;
  }
  const planPaused = PLAN_FIELDS.some(key => plan.text[key] !== '' && inputFeedback(plan.text[key], key, unit, true));
  const actualDistance = exactResults.actualDistance;
  const actualDuration = exactResults.actualDuration;
  const calculatedPace = paceFromRecordedResults({ actualDistance, actualDurationSeconds: actualDuration });
  const painOptions = ['', 'None', 'Mild', 'Moderate', 'Severe'];
  if (!painOptions.includes(draft.pain)) painOptions.push(draft.pain);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitted(true);
    if (!stepsValid) { setLocalError('Review the highlighted workout steps before saving.'); return; }
    const invalid = activeFields.find(key => feedback(key, true)?.state === 'error');
    if (invalid) {
      setLocalError('Review the highlighted fields before saving.');
      const input = form.current?.elements.namedItem(invalid);
      if (input instanceof HTMLElement) { const details = input.closest('details'); if (details) details.open = true; input.focus(); }
      return;
    }
    const measurements: Partial<WorkoutInput> = {};
    if (planChanged) {
      const distance = plan.exact.distance, duration = plan.exact.duration;
      const metric = plan.targetMetric === 'distance' && distance !== null ? 'distance' : plan.targetMetric === 'duration' && duration !== null ? 'duration' : distance !== null ? 'distance' : duration !== null ? 'duration' : null;
      Object.assign(measurements, { plannedDistance: distance, plannedDurationSeconds: duration, plannedPaceSecondsPerMile: plan.exact.pace, targetMetric: metric });
    }
    if (changedResults.has('actualDuration')) measurements.actualDurationSeconds = exactResults.actualDuration;
    if (changedResults.has('actualPace')) measurements.actualPaceSecondsPerMile = exactResults.actualPace;
    const description = structureChanged && structure ? structure.title : draft.plannedWorkout.trim() || `${draft.type}${plan.exact.distance !== null ? ` · ${formatDistance(plan.exact.distance, 'mi')} mi` : plan.exact.duration !== null ? ` · ${formatDuration(plan.exact.duration)}` : ''}`;
    try {
      onSave(validateWorkout({ ...measurements, date: draft.date, phase: draft.phase, type: draft.type,
        ...(structureChanged || structure && draft.type !== workout.type ? { planStructure: structure } : {}),
        manualResultFields: [...changedResults].filter(key => key !== 'effort').map(key => key === 'actualDuration' ? 'actualDurationSeconds' : key === 'actualPace' ? 'actualPaceSecondsPerMile' : key),
        plannedWorkout: description, targetPace: draft.targetPace, actualPace: draft.actualPace,
        done: draft.done, actualDistance: changedResults.has('actualDistance') ? actualDistance : workout.actualDistance,
        effort: results.effort === '' ? null : Number(results.effort), pain: draft.pain, notes: draft.notes, version: workout.version,
      }));
    } catch (caught) { setLocalError(caught instanceof Error ? caught.message : 'Check your workout values.'); }
  }
  return <form ref={form} className="workout-form structured-workout-editor" onSubmit={submit} noValidate>
    <fieldset disabled={saving}><legend className="sr-only">Workout details</legend><div className="form-grid workout-meta-grid">
      <label>Date<input name="date" type="date" min="1900-01-01" max="2200-12-31" value={draft.date} onInput={event => update('date', event.currentTarget.value)} onBlur={() => setTouched(previous => new Set(previous).add('date'))} aria-invalid={feedback('date')?.state === 'error'} aria-describedby={`${id}-date-feedback`} /><span id={`${id}-date-feedback`} className="measurement-feedback is-error" hidden={!feedback('date')}>{feedback('date')?.message}</span></label>
      <label>Workout type<select value={draft.type} onChange={event => update('type', event.target.value)}>{TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
      <label>Training phase<select value={draft.phase} onChange={event => update('phase', event.target.value)}>{WORKOUT_PHASES.map(phase => <option key={phase}>{phase}</option>)}</select></label>
    </div></fieldset>
    <fieldset disabled={saving}><legend className="sr-only">Plan</legend>
      <div className="measurement-heading"><h4>Plan</h4><label className="measurement-unit-select">Distance units<select aria-label="Distance units" value={unit} disabled={!stepsValid} onChange={event => changeUnit(event.target.value as DistanceUnit)}><option value="mi">mi</option><option value="km">km</option></select></label></div>
      {structure ? <>
        <dl className="plan-step-totals"><div><dt>{draft.type === 'Race' ? 'Race distance' : 'Planned distance'}</dt><dd>{plan.exact.distance === null ? 'Follow effort' : readableDistance(plan.exact.distance, unit)}</dd></div>
          <div><dt>{draft.type === 'Race' ? 'Estimated race pace' : 'Average planned pace'}</dt><dd>{plan.exact.pace === null ? 'Follow effort' : `${formatPace(plan.exact.pace, unit)} /${unit}`}</dd></div>
          <div><dt>{draft.type === 'Race' ? 'Estimated race duration' : 'Planned duration'}</dt><dd>{plan.exact.duration === null ? '—' : readableDuration(plan.exact.duration)}</dd></div></dl>
        <p className="linked-measurement-hint">{!stepsValid ? 'Fix the highlighted step entries before saving. Totals show the last valid values.' : draft.type === 'Race' ? `Full session: ${readableDuration(sessionDuration(structure))}, including warm-up and cool-down. Race targets are used for progress tracking.` : 'Totals are calculated from the steps. Follow each step’s pace during the run.'}</p>
        <WorkoutSteps key={unit} structure={structure} unit={unit} onChange={editStructure} onValidity={valid => { setStepsValid(valid); onDirty(true); setLocalError(''); }} />
      </> : <>
      <div className="form-grid measurement-grid">
        {measurementField('duration', 'Target duration', '', running && plan.calculated === 'duration')}
        {measurementField('pace', 'Target pace', '/'+unit, plan.calculated === 'pace')}
        {measurementField('distance', 'Planned distance', unit, plan.calculated === 'distance')}
      </div>
      <p className="linked-measurement-hint">{running && <Link2 size={14} />}{!running ? 'For strength and mobility, enter any targets you want to track.' : planPaused ? 'Calculations paused until the entries are valid.' : 'Enter any two. When you edit a value, the least recently edited box recalculates.'}</p>
      {draft.targetPace && draft.plannedPaceSecondsPerMile == null && <p className="legacy-workout-value">Original pace / effort: {draft.targetPace}<small>Preserved. Enter a single numeric pace above to add a structured target.</small></p>}
      <label className="visible-workout-instructions">Workout instructions<textarea rows={4} maxLength={1000} value={draft.plannedWorkout} onChange={event => update('plannedWorkout', event.target.value)} placeholder="Warmup, intervals, or effort guidance" /></label>
      </>}
    </fieldset>
    <fieldset id={`workout-actual-${workout.id}`} className="workout-actual-section" tabIndex={-1} disabled={saving}><legend className="sr-only">Actual</legend><div className="measurement-heading"><h4>Actual</h4><span>What you recorded</span></div>
      <div className="form-grid measurement-grid">
        {measurementField('actualDuration', 'Recorded duration', '')}
        {measurementField('actualPace', 'Recorded pace · optional', '/'+unit)}
        {measurementField('actualDistance', 'Recorded distance', unit)}
      </div>
      {running && <p className="actual-pace-calculation">Calculated pace <strong>{formatPace(calculatedPace, unit) || '—'}{calculatedPace !== null && ` /${unit}`}</strong><button type="button" disabled={calculatedPace === null} onClick={() => { if (calculatedPace !== null) editResult('actualPace', formatPace(calculatedPace, unit)); }}>Use pace</button></p>}
      {draft.actualPace && <p className="legacy-workout-value">Original pace / activity: {draft.actualPace}<small>Preserved alongside your structured results.</small></p>}
      <p className="field-hint">{running ? 'The summary can calculate pace from recorded distance and time. Checking completed fills other missing results from the plan.' : 'Checking completed fills missing duration from the plan.'} Unchecking clears copied results and preserves manual entries.</p>
      {draft.resultOrigins && Object.keys(draft.resultOrigins).length > 0 && <p className="copied-result-label">Filled from plan. Edit a value to record your own result.</p>}
      <details className="workout-optional-details"><summary>Effort, pain &amp; notes <span>Optional</span></summary><div className="form-grid result-extra-grid">
        {measurementField('effort', 'Effort (1–10)', '')}
        <label>Pain<select value={draft.pain} onChange={event => update('pain', event.target.value)}>{painOptions.map(pain => <option key={pain} value={pain}>{pain || 'Not recorded'}</option>)}</select></label>
        <label className="result-notes">Notes<textarea rows={2} maxLength={10000} value={draft.notes} placeholder="How did it feel?" onChange={event => update('notes', event.target.value)} /></label>
      </div></details>
    </fieldset>
    {(localError || error) && <div className="form-error" role="alert">{localError || error}</div>}
    <div className="editor-footer"><label className="checkbox-label"><input type="checkbox" checked={draft.done} disabled={saving} onChange={event => toggleCompleted(event.target.checked)} />Workout completed</label><div className="button-group"><button type="button" className="button quiet" disabled={saving} onClick={onCancel}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{saving ? 'Saving…' : 'Save workout'}</button></div></div>
  </form>;
}
