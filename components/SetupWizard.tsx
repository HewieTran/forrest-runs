'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Flag, Save } from 'lucide-react';
import AppHeader from './AppHeader';
import PlanAdjustment from './PlanAdjustment';
import { FinishTimeField, ImperialHeightField } from './SetupNumberFields';
import { displayGenerationError } from '../lib/plan-validation';
import { assessmentStep, ASSESSMENT_FIELDS, type AssessmentAction, type GoalSuggestion } from '../lib/plan-assessment';
import { dateDiff } from '../lib/domain';
import { DAY_NAMES, SETUP_STEPS, RESULT_DISTANCES, RESULT_LABELS, simpleSetup, setupTargetTime, setupIssues, validateSetup, convertSetupUnits, suggestedBlockName, type BlockSetup, type IntakeSetup, type ResultDistance, type SetupIssue } from '../lib/setup';
import { validDate, type Plan } from '../lib/domain';
import { RACE_DISTANCES, raceDistanceLabel, raceForKilometers } from '../lib/race-distance';
import { formatDuration } from '../lib/workout-form';
import { finishTimeFromParts, finishTimeParts, heightFromParts, heightParts } from '../lib/setup-number-entry';
import { GENERATION_COOLDOWN_MS } from '../lib/planner-policy';
import { trainingWindowIssue } from '../lib/training-window';
import type { RecentBaseline } from '../lib/recent-baseline';

function fieldsFor(value: IntakeSetup) {
  const number = (value: number | null) => value === null ? '' : String(value);
  return { name: value.goal.name, goalKind: String(value.goal.distanceKm ?? ''), targetTime: finishTimeParts(setupTargetTime(value)), startDate: value.goal.startDate, targetDate: value.goal.targetDate,
    age: number(value.runner.age), height: number(value.runner.height), imperialHeight: heightParts(value.units === 'mi' ? value.runner.height : null), weight: number(value.runner.weight), experience: value.runner.experience ?? '',
    benchmarkDistance: value.benchmark?.distance ?? '', benchmarkTime: finishTimeParts(formatDuration(value.benchmark?.durationSeconds ?? null)),
    benchmarkDate: value.benchmark?.date ?? '', benchmarkEffort: value.benchmark?.effortConfirmed ? 'yes' : '' };
}

type SetupFields = ReturnType<typeof fieldsFor>;
type TextField = Exclude<keyof SetupFields, 'targetTime' | 'benchmarkTime' | 'imperialHeight'>;

export default function SetupWizard({ initial = null, displayName, today, readOnly = false, preview = false, initialEdit }: {
  initialEdit?: AssessmentAction; initial?: Plan | null; displayName: string; today: string; readOnly?: boolean; preview?: boolean; recentBaseline?: RecentBaseline | null;
}) {
  const original = simpleSetup(initial?.setup ?? undefined, initial?.raceName, initial?.raceDate, today);
  const [block, setBlock] = useState(initial), [fields, setFields] = useState(() => fieldsFor(original));
  const [step, setStep] = useState(initialEdit ? assessmentStep(initialEdit) : original.step), [units, setUnits] = useState(original.units), [days, setDays] = useState(original.availability.days);
  const [saving, setSaving] = useState(false), [dirty, setDirty] = useState(false), [message, setMessage] = useState(''), [errors, setErrors] = useState<SetupIssue[]>([]);
  const [generationError, setGenerationError] = useState(initial?.generation?.status === 'failed' ? displayGenerationError(initial.generation.error ?? 'Generation could not finish. Your draft is saved.') : '');
  const [clarification, setClarification] = useState(initial?.generation?.status === 'clarification' ? initial.generation.output : null);
  const [applied, setApplied] = useState<{
    fields: typeof fields; days: typeof days; clarification: typeof clarification; dirty: boolean; label: string;
  } | null>(null);
  const [retryAfter, setRetryAfter] = useState(initial?.generation?.status === 'clarification'
    ? Date.parse(initial.generation.startedAt) + GENERATION_COOLDOWN_MS : 0);
  const [waitingToRetry, setWaitingToRetry] = useState(false);
  useEffect(() => {
    const remaining = retryAfter - Date.now();
    setWaitingToRetry(remaining > 0);
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setWaitingToRetry(false), remaining);
    return () => window.clearTimeout(timer);
  }, [retryAfter]);
  const [focusTarget, setFocusTarget] = useState(initialEdit ? ASSESSMENT_FIELDS[initialEdit] : '');
  useEffect(() => { if (focusTarget) { document.getElementById(focusTarget)?.focus(); setFocusTarget(''); } }, [focusTarget, step]);
  function editAssessment(action: AssessmentAction) { setStep(assessmentStep(action)); setFocusTarget(ASSESSMENT_FIELDS[action]); setErrors([]); }
  const disabled = saving || readOnly;
  const windowIssue = readOnly ? null : trainingWindowIssue(fields.startDate, fields.targetDate, today);
  const library = preview ? '/preview?view=blocks' : '/blocks';
  useEffect(() => { if (!dirty) return; const handler = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [dirty]);
  function update<K extends keyof SetupFields>(name: K, value: SetupFields[K]) {
    setApplied(null);setGenerationError('');setClarification(null);setFields(current => ({ ...current, [name]: value }));setDirty(true);setMessage('');
    const field = name === 'imperialHeight' ? 'height' : name;
    setErrors(current => current.filter(issue => issue.field !== field));
  }
  const targetSeconds = finishTimeFromParts(fields.targetTime);
  const benchmarkSeconds = finishTimeFromParts(fields.benchmarkTime);
  const imperialInches = heightFromParts(fields.imperialHeight);
  const imperialHeightIssue = units === 'mi' && Number.isNaN(imperialInches)
    ? 'Enter a height greater than zero. Use whole feet and inches below 12.' : '';
  function checkNumberEntries() {
    const issues: SetupIssue[] = [];
    const timeMessage = 'Enter a time greater than zero and up to 24 hours. Minutes and seconds must be 0–59.';
    if (Number.isNaN(targetSeconds)) issues.push({ step: 0, field: 'targetTime', message: `Target finish time. ${timeMessage}` });
    if (imperialHeightIssue) issues.push({ step: 1, field: 'height', message: imperialHeightIssue });
    if (Number.isNaN(benchmarkSeconds)) issues.push({ step: 1, field: 'benchmarkTime', message: `Benchmark finish time. ${timeMessage}` });
    if (!issues.length) return true;
    setErrors(issues);
    setStep(issues[0].step);
    setFocusTarget(`setup-${issues[0].field}`);
    return false;
  }
  function applySuggestion(suggestion: GoalSuggestion) {
    if (disabled || !clarification || windowIssue) return;
    let label = 'Target finish time updated.';
    if (suggestion.kind === 'finish_time') {
      setFields(current => ({ ...current, targetTime: finishTimeParts(formatDuration(suggestion.durationSeconds)) }));
    } else {
      const date = suggestion.date;
      if (date) setFields(current => ({ ...current, [date.field]: date.to }));
      if (suggestion.trainingDays) setDays(suggestion.trainingDays);
      label = date && suggestion.trainingDays ? 'Training dates and days updated.'
        : suggestion.trainingDays ? 'Training days updated.'
        : date?.field === 'startDate' ? 'Training start date updated.' : 'Race date updated.';
    }
    setApplied({ fields, days, clarification, dirty, label });
    setClarification(null);
    setDirty(true);
    setErrors([]);
    setMessage('');
    setStep(3);
    setFocusTarget('setup-review-title');
  }
  function undoSuggestion() {
    if (disabled || !applied) return;
    setFields(applied.fields);
    setDays(applied.days);
    setClarification(applied.clarification);
    setDirty(applied.dirty);
    setApplied(null);
    setMessage('Original inputs restored.');
    setFocusTarget('adjustment-title');
  }
  function collect(): IntakeSetup {
    const value = simpleSetup(original);
    const number = (key: TextField) => fields[key].trim() === '' ? null : Number(fields[key]);
    value.step = step; value.units = units;
    value.goal = { ...value.goal, name: fields.name, distanceKm: number('goalKind'), startDate: fields.startDate, targetDate: fields.targetDate, targetDurationSeconds: Number.isNaN(targetSeconds) ? null : targetSeconds };
    const height = units === 'mi' ? imperialInches : number('height');
    value.runner = { ...value.runner, age: number('age'), height: Number.isNaN(height) ? null : height, weight: number('weight'), experience: (fields.experience || null) as IntakeSetup['runner']['experience'] };
    value.benchmark = { distance: (fields.benchmarkDistance || null) as ResultDistance | null,
      durationSeconds: Number.isNaN(benchmarkSeconds) ? null : benchmarkSeconds,
      date: fields.benchmarkDate, effortConfirmed: fields.benchmarkEffort === 'yes' };
    value.availability = { ...value.availability, days, longRunDay: value.availability.longRunDay !== null && days.includes(value.availability.longRunDay) ? value.availability.longRunDay : null,
      dayDurationLimits: Object.fromEntries(Object.entries(value.availability.dayDurationLimits).filter(([day]) => days.includes(Number(day)))) };
    return value;
  }
  function switchUnits(next: 'mi' | 'km') {
    if (next === units) return;
    if (imperialHeightIssue) {
      setErrors([{ step: 1, field: 'height', message: imperialHeightIssue }]);
      setStep(1);
      setFocusTarget('setup-height');
      return;
    }
    setApplied(null);
    const converted = fieldsFor(convertSetupUnits(collect(), next));
    setFields(current => ({ ...current, height: converted.height, imperialHeight: converted.imperialHeight, weight: converted.weight }));setUnits(next);setClarification(null);setDirty(true);setErrors([]);
  }
  function issueFor(name: keyof SetupFields, type = 'text'): string | undefined {
    const value = fields[name];
    const v = typeof value === 'string' ? value : '';
    if (v && type === 'number' && (!Number.isFinite(Number(v)) || Number(v) <= 0 || (name === 'age' && !Number.isInteger(Number(v))))) return 'Use a positive' + (name === 'age' ? ' whole' : '') + ' number.';
    if (v && type === 'date' && !validDate(v)) return 'Choose a valid date.';
    if (name === 'benchmarkDate' && v > today) return 'Choose today or an earlier date.';
    if (['startDate', 'targetDate'].includes(name) && fields.startDate && fields.targetDate && fields.targetDate <= fields.startDate) return 'Race date must be after the training start date.';
    if (windowIssue?.field === name) return windowIssue.message;
    return errors.find(issue => issue.field === name)?.message;
  }
  function next() {
    if (!checkNumberEntries()) return;
    try {
      const issues = setupIssues(validateSetup(collect(), today)).filter(issue => issue.step === step);
      if (issues.length) { setErrors(issues); return; }
      setErrors([]);setStep(current => Math.min(3, current + 1));
    } catch (error) { setErrors([{ step, field: '', message: error instanceof Error ? error.message : 'Check your entries.' }]); }
  }
  async function save(complete: boolean) {
    if (complete && windowIssue) {
      setStep(0);
      setFocusTarget(`setup-${windowIssue.field}`);
      return;
    }
    if (complete && waitingToRetry) return;
    if (complete && clarification) { setMessage('Edit the relevant inputs before generating again.');return; }
    setMessage('');setGenerationError('');
    if (!checkNumberEntries()) return;
    setErrors([]);
    let setup: BlockSetup;
    try {
      setup = validateSetup(collect(), today);
      if (!setup.goal.targetDate) { setStep(0); throw new Error('Choose a race date to save a draft.'); }
      const issues = complete ? setupIssues(setup) : [];
      if (issues.length) { setErrors(issues);setStep(issues[0].step);return; }
    } catch (error) { setErrors([{ step, field: '', message: error instanceof Error ? error.message : 'Check your entries.' }]);return; }
    setSaving(true);
    let generating = false;
    try {
      if (preview) { setApplied(null);setDirty(false);setMessage(complete ? 'Preview complete. The live app generates and saves your plan from here.' : 'Draft saved in this preview only.');return; }
      let saved = block;
      // A retry after an interrupted save reuses the existing validated result.
      if (!saved || dirty || !saved.setup || saved.setup.schemaVersion !== 4) {
        const response = await fetch(saved ? `/api/blocks/${encodeURIComponent(saved.id)}/setup` : '/api/blocks', { method: saved ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setup, version: saved?.version, complete }) });
        const result = await response.json() as { block?: Plan; error?: string; issues?: SetupIssue[] };
        if (!response.ok || !result.block) { if (result.issues) setErrors(result.issues);throw new Error(result.error || 'Your draft could not be saved.'); }
        saved = result.block;setBlock(saved);setApplied(null);setDirty(false);setFields(current => ({ ...current, name: saved!.raceName }));
        window.history.replaceState(window.history.state, '', `/blocks/${encodeURIComponent(saved.id)}/setup`);
      }
      if (!complete) { setMessage('Draft saved. Resume it from your training blocks.');return; }
      generating = true;
      const response = await fetch(`/api/blocks/${encodeURIComponent(saved.id)}/generation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: saved.version, consent: true, saveImmediately: true }) });
      const result = await response.json() as { block?: Plan; error?: string };
      if (result.block) setBlock(result.block);
      if (!response.ok || !result.block) throw new Error(result.error || result.block?.generation?.error || 'Generation could not finish. Your draft is saved; retry when ready.');
      if (result.block.generation?.status === 'clarification' && result.block.generation.output) {
        setClarification(result.block.generation.output);
        setRetryAfter(Date.parse(result.block.generation.startedAt) + GENERATION_COOLDOWN_MS);
        return;
      }
      if (result.block.generation?.status !== 'accepted') throw new Error(result.block.generation?.output?.questions.join(' ') || result.block.generation?.error || 'The plan needs more information. Your draft is preserved.');
      window.location.assign(`/blocks/${encodeURIComponent(saved.id)}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Please try again. Your draft is preserved.';
      if (generating) setGenerationError(displayGenerationError(text));
      else setErrors([{ step, field: '', message: text }]);
    }
    finally { setSaving(false); }
  }
  function input(name: TextField, label: string, type = 'text', required = true, hint?: string) {
    const error = issueFor(name, type), id = `setup-${name}`;
    return <label htmlFor={id}>{label}{required && <span className="setup-required">Required</span>}<input id={id} name={name} type={type} value={fields[name]} onChange={event => update(name, event.target.value)} step={type === 'number' ? name === 'age' ? '1' : 'any' : undefined} min={type === 'number' ? '0' : undefined} max={name === 'benchmarkDate' ? today : undefined} aria-required={required} aria-invalid={!!error} aria-describedby={`${id}-feedback`} placeholder={name === 'name' ? suggestedBlockName(collect()) : undefined} /><small id={`${id}-feedback`} className={error ? 'setup-field-error' : undefined}>{error || hint}</small></label>;
  }
  const snapshot = collect();
  function submit(event: FormEvent) { event.preventDefault();if (step < 3) next();else void save(true); }
  return <div className="app-shell"><AppHeader displayName={displayName} preview={preview} /><main className="main-content setup-main">
    <a className="block-breadcrumb" href={library}><ArrowLeft size={15} />Training blocks</a>
    <section className="page-heading setup-heading"><div><h1>{readOnly ? 'Starting setup' : block ? 'Continue your setup' : 'Create a training block'}</h1><p className="blocks-intro">Your race goal, running experience and training days.</p></div><span className="block-status block-status-draft">{readOnly ? 'Saved snapshot' : 'Draft'}</span></section>
    {preview && <p className="preview-notice">Example preview. No personal data or paid generation calls.</p>}
    <nav className="setup-stepper" aria-label="Setup steps">{SETUP_STEPS.map((name, index) => <button type="button" key={name} disabled={saving} aria-current={step === index ? 'step' : undefined} onClick={() => { setStep(index);setErrors([]); }}><span>{index + 1}</span>{name}</button>)}</nav>
    <div className="setup-layout"><form className="setup-panel" onSubmit={submit} noValidate>
      {applied && <div className="setup-suggestion-applied"><p role="status">{applied.label} Review your changes before generating.</p><button className="button" type="button" disabled={disabled} onClick={undoSuggestion}>Undo</button></div>}
      {message && <p className="block-success" role="status"><CheckCircle2 size={17} />{message}</p>}
      {!!errors.length && <div className="setup-errors" role="alert"><strong>Check these details</strong><ul>{errors.map((issue, index) => <li key={index}><button type="button" onClick={() => setStep(issue.step)}>{issue.message}</button></li>)}</ul></div>}
      {generationError && <div className="setup-errors" role="alert"><strong>Plan generation couldn’t finish</strong><p>{generationError}</p></div>}
      {clarification && <PlanAdjustment output={clarification} onEdit={editAssessment} disabled={disabled}
        input={step === 3 ? block?.generation?.input : undefined} today={today} onApply={applySuggestion} />}
      <fieldset disabled={disabled}>
      {step === 0 && <><h2>What are you working toward?</h2><div className="setup-fields"><label className="setup-span-two" htmlFor="setup-goalKind">Race distance<span className="setup-required">Required</span>
        <select id="setup-goalKind" value={fields.goalKind} onChange={event => update('goalKind', event.target.value)} aria-required="true" aria-invalid={!!issueFor('goalKind')} aria-describedby="race-distance-feedback">
          <option value="" disabled>Choose a race distance</option>
          {RACE_DISTANCES.map(race => <option key={race.meters} value={race.meters / 1000}>{race.label}</option>)}
          {fields.goalKind && !raceForKilometers(snapshot.goal.distanceKm) && <option value={fields.goalKind}>{raceDistanceLabel(snapshot.goal.distanceKm)} · saved goal</option>}
        </select>
        <small id="race-distance-feedback" className={issueFor('goalKind') ? 'setup-field-error' : undefined}>{issueFor('goalKind')}</small>
      </label><FinishTimeField id="setup-targetTime" label="Target finish time" parts={fields.targetTime} error={issueFor('targetTime')} onChange={parts => update('targetTime', parts)} />{input('startDate', 'Training start date', 'date', true, 'Generated plans span 2 to 26 weeks.')}{input('targetDate', 'Race date', 'date')}{input('name', 'Block name', 'text', false, 'Leave blank for a suggested name.')}</div></>}
      {step === 1 && <><h2>About you</h2><p className="setup-description">Choose your running experience and add your measurements.</p><div className="setup-fields"><label>Running experience<span className="setup-required">Required</span><select aria-label="Running experience" value={fields.experience} onChange={event => update('experience', event.target.value)} aria-invalid={errors.some(issue => issue.field === 'experience')}><option value="">Choose experience</option><option value="novice">Novice</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>{input('age', 'Age (years)', 'number')}{input('weight', `Weight (${units === 'mi' ? 'lb' : 'kg'})`, 'number')}{units === 'mi'
        ? <ImperialHeightField id="setup-height" label="Height" parts={fields.imperialHeight} error={issueFor('height')} onChange={parts => update('imperialHeight', parts)} />
        : input('height', 'Height (cm)', 'number')}</div>
        <section className="setup-benchmark" aria-labelledby="benchmark-heading">
          <h3 id="benchmark-heading">Performance benchmark</h3>
          <p className="setup-description">Add one recent race or best-effort time trial. Use an achieved result, not your goal time or an easy training run.</p>
          <div className="setup-fields">
            <label className="setup-span-two" htmlFor="setup-benchmarkDistance">Result distance<span className="setup-required">Required</span>
              <select id="setup-benchmarkDistance" value={fields.benchmarkDistance} onChange={event => update('benchmarkDistance', event.target.value)} aria-required="true" aria-invalid={!!issueFor('benchmarkDistance')} aria-describedby="benchmark-distance-feedback">
                <option value="">Choose a distance</option>{RESULT_DISTANCES.map(key => <option key={key} value={key}>{RESULT_LABELS[key]}</option>)}
              </select><small id="benchmark-distance-feedback" className={issueFor('benchmarkDistance') ? 'setup-field-error' : undefined}>{issueFor('benchmarkDistance')}</small>
            </label>
            <FinishTimeField id="setup-benchmarkTime" label="Benchmark finish time" parts={fields.benchmarkTime} error={issueFor('benchmarkTime')} onChange={parts => update('benchmarkTime', parts)} />
            {input('benchmarkDate', 'Date achieved', 'date', true, fields.benchmarkDate && validDate(fields.benchmarkDate) && fields.benchmarkDate <= today ? `${dateDiff(today, fields.benchmarkDate)} days before today. The planner considers how representative this result is.` : 'Choose the date you completed this result.')}
          </div>
          <label className="setup-check" htmlFor="setup-benchmarkEffort"><input id="setup-benchmarkEffort" type="checkbox" checked={fields.benchmarkEffort === 'yes'} onChange={event => update('benchmarkEffort', event.target.checked ? 'yes' : '')} aria-required="true" aria-invalid={!!issueFor('benchmarkEffort')} aria-describedby="benchmark-effort-feedback" />I confirm this was a race or best-effort time trial.</label>
          <small id="benchmark-effort-feedback" className={issueFor('benchmarkEffort') ? 'setup-field-error' : undefined}>{issueFor('benchmarkEffort') || 'Required before generation. You can save a draft without completing this section.'}</small>
        </section>
      </>}
      {step === 2 && <><h2>Choose your training days</h2><p className="setup-description">Select the days you want a running workout. Race day is included even if it falls on another weekday.</p><div id="setup-trainingDays" tabIndex={-1} className="setup-days" role="group" aria-label="Selected training days">{DAY_NAMES.map((name, day) => <button type="button" key={name} aria-pressed={days.includes(day)} onClick={() => { setApplied(null);setClarification(null);setDays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day].sort());setDirty(true);setErrors([]); }}>{name.slice(0,3)}<span>{days.includes(day) ? 'Run' : '—'}</span></button>)}</div></>}
      {step === 3 && <><h2 id="setup-review-title" tabIndex={-1}>Your plan details</h2><SetupReview setup={readOnly && initial?.setup ? initial.setup : snapshot} />{windowIssue && <div className="setup-errors" role="status"><p>{windowIssue.message}</p><button className="button" type="button" onClick={() => { setStep(0); setFocusTarget(`setup-${windowIssue.field}`); }}>Edit training dates</button></div>}<p className="setup-footnote">Your benchmark informs estimated paces; your target finish time remains a goal. The plan saves automatically and starts only when you choose Start training.</p></>}
      </fieldset>
      {step === 3 && waitingToRetry && !clarification && <p className="setup-footnote" role="status">You can generate again one minute after your last request.</p>}
      <div className="setup-form-actions"><button className="button" type="button" disabled={saving || step === 0} onClick={() => { setStep(current => current - 1);setErrors([]); }}><ArrowLeft size={15} />Back</button><div>{!readOnly && <button className="button" type="button" disabled={saving} onClick={() => void save(false)}><Save size={15} />Save draft</button>}{step < 3 ? <button className="button primary" type={readOnly ? 'button' : 'submit'} disabled={saving} onClick={readOnly ? () => setStep(current => current + 1) : undefined}>Continue<ArrowRight size={15} /></button> : !readOnly && <button className="button primary" type="submit" disabled={saving || waitingToRetry || !!clarification || !!windowIssue}>{saving ? 'Generating and saving…' : 'Generate plan'}</button>}</div></div>
    </form><aside className="setup-aside"><div className="setup-unit-choice"><span>Measurements</span><div role="group" aria-label="Measurement units"><button aria-pressed={units === 'mi'} disabled={disabled} onClick={() => switchUnits('mi')}>mi · lb · ft/in</button><button aria-pressed={units === 'km'} disabled={disabled} onClick={() => switchUnits('km')}>km · kg · cm</button></div></div><Flag size={23} /><h3>{fields.name || suggestedBlockName(snapshot)}</h3><dl><dt>Race date</dt><dd>{fields.targetDate || 'Not set'}</dd><dt>Target finish</dt><dd>{setupTargetTime(snapshot) || 'Not set'}</dd><dt>Experience</dt><dd>{fields.experience || 'Not selected'}</dd><dt>Training days</dt><dd>{days.length ? days.map(day => DAY_NAMES[day].slice(0,3)).join(', ') : 'Not selected'}</dd><dt>Workout paces</dt><dd>Numeric estimates</dd></dl><p>{dirty ? 'Unsaved changes' : block ? 'Draft saved' : 'Save a draft to return later'}</p></aside></div>
  </main></div>;
}

export function SetupReview({ setup }: { setup: BlockSetup }) {
  const value = simpleSetup(setup), benchmark = setup.schemaVersion === 4 ? (setup as IntakeSetup).benchmark : null;
  const display = (v: number | null, unit: string) => v === null ? 'Not provided' : `${v} ${unit}`;
  const imperialHeight = heightParts(value.runner.height);
  const height = value.units === 'mi' && value.runner.height !== null
    ? `${imperialHeight[0]} ft ${imperialHeight[1]} in` : display(value.runner.height, 'cm');
  return <dl className="setup-review"><div><dt>Goal</dt><dd>{value.goal.name || suggestedBlockName(value)} · {raceDistanceLabel(value.goal.distanceKm)} · {setupTargetTime(value) || 'Target time not set'}</dd></div><div><dt>Training window</dt><dd>{value.goal.startDate || 'Not set'} → {value.goal.targetDate || 'Not set'}</dd></div><div><dt>Runner</dt><dd>{value.runner.experience || 'Experience not provided'} · {display(value.runner.age, 'years')} · {display(value.runner.weight, value.units === 'mi' ? 'lb' : 'kg')} · {height}</dd></div>{setup.schemaVersion === 4 && <div><dt>Benchmark</dt><dd>{benchmark?.distance ? RESULT_LABELS[benchmark.distance] : 'Distance not set'} · {formatDuration(benchmark?.durationSeconds ?? null) || 'Time not set'} · {benchmark?.date || 'Date not set'} · {benchmark?.effortConfirmed ? 'Race or best-effort time trial confirmed' : 'Effort not confirmed'}</dd></div>}<div><dt>Training days</dt><dd>{value.availability.days.map(day => DAY_NAMES[day]).join(', ') || 'Not selected'}</dd></div><div><dt>Workout pace</dt><dd>{setup.schemaVersion === 4 ? 'Benchmark-informed estimates' : setup.schemaVersion === 3 ? 'Estimated numeric pace' : 'Original guidance preserved in the saved snapshot'}</dd></div></dl>;
}
