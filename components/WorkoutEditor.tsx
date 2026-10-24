'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Check, Link2, LoaderCircle } from 'lucide-react';
import { isRun, PHASES, TYPES, validDate, validateWorkout, type Workout, type WorkoutInput } from '../lib/domain';
import {
  changePlanUnit, editLinkedPlan, formatDistance, formatDuration, formatPace,
  initialLinkedPlan, inputFeedback, parseInput, PLAN_FIELDS,
  type DistanceUnit, type InputKind, type PlanField,
} from '../lib/workout-form';
import '../app/workout-editor.css';

type ResultField = 'actualDistance' | 'actualDuration' | 'actualPace' | 'effort';
type ErrorField = InputKind | 'date';

export default function WorkoutEditor({ workout, saving, error, onSave, onCancel, onDirty }: {
  workout: Workout; saving: boolean; error: string;
  onSave: (value: WorkoutInput) => void; onCancel: () => void; onDirty: (dirty: boolean) => void;
}) {
  const id = useId(), form = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState(workout);
  const [unit, setUnit] = useState<DistanceUnit>('mi');
  const [plan, setPlan] = useState(() => initialLinkedPlan(workout));
  const [planChanged, setPlanChanged] = useState(false);
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
  const activeFields: ErrorField[] = running ? ['date', ...PLAN_FIELDS, 'actualDistance', 'actualDuration', 'actualPace', 'effort'] : ['date', 'duration', 'actualDuration', 'effort'];

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
  function feedback(key: ErrorField, strict = submitted || touched.has(key)) {
    if (key === 'date') return !validDate(draft.date) && strict ? { state: 'error' as const, message: 'Choose a valid date from 1900 to 2200.' } : null;
    const value = PLAN_FIELDS.includes(key as PlanField) ? plan.text[key as PlanField] : results[key as ResultField];
    return inputFeedback(value, key, unit, strict);
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
    const time = key.toLowerCase().includes('pace') || key.toLowerCase().includes('duration');
    const duration = key.toLowerCase().includes('duration');
    return <label className={`measurement-field ${calculated ? 'calculated-field' : ''}`} key={key}>
      <span className="measurement-label">{label}{calculated && <small className="calculated-label">{planPaused ? 'Paused' : 'Calculated'}</small>}</span>
      <span className="measurement-input"><input
        id={`${id}-${key}`} name={key} type="text" inputMode={time || key === 'effort' ? 'numeric' : 'decimal'}
        value={value} placeholder={time ? duration ? 'h:mm:ss' : 'mm:ss' : 'Optional'} maxLength={20}
        aria-invalid={issue?.state === 'error'} aria-describedby={`${id}-${key}-feedback`}
        onInput={event => planned ? editPlan(key as PlanField, event.currentTarget.value) : editResult(key as ResultField, event.currentTarget.value)}
        onBlur={() => setTouched(previous => new Set(previous).add(key))}
      />{suffix && <span className="measurement-unit">{suffix}</span>}</span>
      <span id={`${id}-${key}-feedback`} className={`measurement-feedback ${issue?.state === 'error' ? 'is-error' : ''}`} aria-live="polite" hidden={!issue}>{issue?.state === 'error' && <span aria-hidden="true">ⓘ </span>}{issue?.message}</span>
    </label>;
  }
  const planPaused = PLAN_FIELDS.some(key => plan.text[key] !== '' && inputFeedback(plan.text[key], key, unit, true));
  const actualDistance = exactResults.actualDistance;
  const actualDuration = exactResults.actualDuration;
  const calculatedPace = actualDistance !== null && actualDistance > 0 && actualDuration !== null && actualDuration > 0 ? actualDuration / actualDistance : null;
  const painOptions = ['', 'None', 'Mild', 'Moderate', 'Severe'];
  if (!painOptions.includes(draft.pain)) painOptions.push(draft.pain);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitted(true);
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
    const description = draft.plannedWorkout.trim() || `${draft.type}${plan.exact.distance !== null ? ` · ${formatDistance(plan.exact.distance, 'mi')} mi` : plan.exact.duration !== null ? ` · ${formatDuration(plan.exact.duration)}` : ''}`;
    try {
      onSave(validateWorkout({ ...measurements, date: draft.date, phase: draft.phase, type: draft.type,
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
      <label>Training phase<select value={draft.phase} onChange={event => update('phase', event.target.value)}>{PHASES.map(phase => <option key={phase}>{phase}</option>)}</select></label>
    </div></fieldset>
    <fieldset disabled={saving}><legend className="sr-only">Plan</legend>
      <div className="measurement-heading"><h4>Plan</h4>{running && <label className="measurement-unit-select">Distance units<select aria-label="Distance units" value={unit} onChange={event => changeUnit(event.target.value as DistanceUnit)}><option value="mi">mi</option><option value="km">km</option></select></label>}</div>
      <div className={`form-grid measurement-grid ${!running ? 'support-measurement-grid' : ''}`}>
        {running && measurementField('distance', 'Planned distance', unit, plan.calculated === 'distance')}
        {running && measurementField('pace', 'Target pace', '/'+unit, plan.calculated === 'pace')}
        {measurementField('duration', 'Target duration', 'h:mm:ss', running && plan.calculated === 'duration')}
      </div>
      <p className="linked-measurement-hint">{running && <Link2 size={14} />}{!running ? 'Duration target is optional for strength and mobility.' : planPaused ? 'Calculations paused until the entries are valid.' : 'Enter any two. When you edit a value, the least recently edited box recalculates.'}</p>
      {draft.targetPace && <p className="legacy-workout-value">Original pace / effort: {draft.targetPace}<small>Preserved. Enter a single numeric pace above to add a structured target.</small></p>}
      <details className="workout-optional-details"><summary>Workout instructions <span>Optional</span></summary><label>Instructions<textarea rows={2} maxLength={1000} value={draft.plannedWorkout} onChange={event => update('plannedWorkout', event.target.value)} placeholder="Warmup, intervals, or effort guidance" /></label></details>
    </fieldset>
    <fieldset disabled={saving}><legend className="sr-only">Actual</legend><div className="measurement-heading"><h4>Actual</h4><span>What you recorded</span></div>
      <div className={`form-grid measurement-grid ${!running ? 'support-measurement-grid' : ''}`}>
        {running && measurementField('actualDistance', 'Recorded distance', unit)}
        {measurementField('actualDuration', 'Recorded duration', 'h:mm:ss')}
        {running && measurementField('actualPace', 'Recorded pace · optional', '/'+unit)}
      </div>
      {running && <p className="actual-pace-calculation">Calculated pace <strong>{formatPace(calculatedPace, unit) || '—'}{calculatedPace !== null && ` /${unit}`}</strong><button type="button" disabled={calculatedPace === null} onClick={() => { if (calculatedPace !== null) editResult('actualPace', formatPace(calculatedPace, unit)); }}>Use pace</button></p>}
      {draft.actualPace && <p className="legacy-workout-value">Original pace / activity: {draft.actualPace}<small>Preserved alongside your structured results.</small></p>}
      <p className="field-hint">Leave unknown results blank. Planned values never fill in your actual results.</p>
      <details className="workout-optional-details"><summary>Effort, pain &amp; notes <span>Optional</span></summary><div className="form-grid result-extra-grid">
        {measurementField('effort', 'Effort (1–10)', '')}
        <label>Pain<select value={draft.pain} onChange={event => update('pain', event.target.value)}>{painOptions.map(pain => <option key={pain} value={pain}>{pain || 'Not recorded'}</option>)}</select></label>
        <label className="result-notes">Notes<textarea rows={2} maxLength={10000} value={draft.notes} placeholder="How did it feel?" onChange={event => update('notes', event.target.value)} /></label>
      </div></details>
    </fieldset>
    {(localError || error) && <div className="form-error" role="alert">{localError || error}</div>}
    <div className="editor-footer"><label className="checkbox-label"><input type="checkbox" checked={draft.done} disabled={saving} onChange={event => update('done', event.target.checked)} />Workout completed</label><div className="button-group"><button type="button" className="button quiet" disabled={saving} onClick={onCancel}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{saving ? 'Saving…' : 'Save workout'}</button></div></div>
  </form>;
}
