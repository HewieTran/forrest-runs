'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Flag, Save } from 'lucide-react';
import AppHeader from './AppHeader';
import PlanAdjustment from './PlanAdjustment';
import { displayGenerationError } from '../lib/plan-validation';
import { assessmentStep, ASSESSMENT_FIELDS, type AssessmentAction } from '../lib/plan-assessment';
import { dateDiff } from '../lib/domain';
import { DAY_NAMES, SETUP_STEPS, RESULT_DISTANCES, RESULT_LABELS, simpleSetup, setupTargetTime, setupIssues, validateSetup, convertSetupUnits, suggestedBlockName, durationSeconds, type BlockSetup, type IntakeSetup, type ResultDistance, type SetupIssue } from '../lib/setup';
import { validDate, type Plan } from '../lib/domain';
import { RACE_DISTANCES, raceDistanceLabel, raceForKilometers } from '../lib/race-distance';
import { formatDuration } from '../lib/workout-form';
import type { RecentBaseline } from '../lib/recent-baseline';

function fieldsFor(value: IntakeSetup): Record<string, string> {
  const number = (value: number | null) => value === null ? '' : String(value);
  return { name: value.goal.name, goalKind: String(value.goal.distanceKm ?? ''), targetTime: setupTargetTime(value), startDate: value.goal.startDate, targetDate: value.goal.targetDate,
    age: number(value.runner.age), height: number(value.runner.height), weight: number(value.runner.weight), experience: value.runner.experience ?? '',
    benchmarkDistance: value.benchmark?.distance ?? '', benchmarkTime: formatDuration(value.benchmark?.durationSeconds ?? null),
    benchmarkDate: value.benchmark?.date ?? '', benchmarkEffort: value.benchmark?.effortConfirmed ? 'yes' : '' };
}

export default function SetupWizard({ initial = null, displayName, today, readOnly = false, preview = false, initialEdit }: {
  initialEdit?: AssessmentAction; initial?: Plan | null; displayName: string; today: string; readOnly?: boolean; preview?: boolean; recentBaseline?: RecentBaseline | null;
}) {
  const original = simpleSetup(initial?.setup ?? undefined, initial?.raceName, initial?.raceDate, today);
  const [block, setBlock] = useState(initial), [fields, setFields] = useState(() => fieldsFor(original));
  const [step, setStep] = useState(initialEdit ? assessmentStep(initialEdit) : original.step), [units, setUnits] = useState(original.units), [days, setDays] = useState(original.availability.days);
  const [saving, setSaving] = useState(false), [dirty, setDirty] = useState(false), [message, setMessage] = useState(''), [errors, setErrors] = useState<SetupIssue[]>([]);
  const [generationError, setGenerationError] = useState(initial?.generation?.status === 'failed' ? displayGenerationError(initial.generation.error ?? 'Generation could not finish. Your draft is saved.') : '');
  const [clarification, setClarification] = useState(initial?.generation?.status === 'clarification' ? initial.generation.output : null);
  const [focusTarget, setFocusTarget] = useState(initialEdit ? ASSESSMENT_FIELDS[initialEdit] : '');
  useEffect(() => { if (focusTarget) { document.getElementById(focusTarget)?.focus(); setFocusTarget(''); } }, [focusTarget, step]);
  function editAssessment(action: AssessmentAction) { setStep(assessmentStep(action)); setFocusTarget(ASSESSMENT_FIELDS[action]); setErrors([]); }
  const disabled = saving || readOnly;
  const library = preview ? '/preview?view=blocks' : '/blocks';
  useEffect(() => { if (!dirty) return; const handler = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [dirty]);
  function update(name: string, value: string) { setGenerationError(''); setClarification(null); setFields(current => ({ ...current, [name]: value })); setDirty(true); setMessage(''); setErrors(current => current.filter(issue => issue.field !== name)); }
  function collect(): IntakeSetup {
    const value = simpleSetup(original);
    const number = (key: string) => fields[key].trim() === '' ? null : Number(fields[key]);
    value.step = step; value.units = units;
    value.goal = { ...value.goal, name: fields.name, distanceKm: number('goalKind'), startDate: fields.startDate, targetDate: fields.targetDate, targetDurationSeconds: fields.targetTime.trim() ? durationSeconds(fields.targetTime) ?? NaN : null };
    value.runner = { ...value.runner, age: number('age'), height: number('height'), weight: number('weight'), experience: (fields.experience || null) as IntakeSetup['runner']['experience'] };
    value.benchmark = { distance: (fields.benchmarkDistance || null) as ResultDistance | null,
      durationSeconds: fields.benchmarkTime.trim() ? durationSeconds(fields.benchmarkTime) ?? NaN : null,
      date: fields.benchmarkDate, effortConfirmed: fields.benchmarkEffort === 'yes' };
    value.availability = { ...value.availability, days, longRunDay: value.availability.longRunDay !== null && days.includes(value.availability.longRunDay) ? value.availability.longRunDay : null,
      dayDurationLimits: Object.fromEntries(Object.entries(value.availability.dayDurationLimits).filter(([day]) => days.includes(Number(day)))) };
    return value;
  }
  function switchUnits(next: 'mi' | 'km') {
    if (next === units) return;
    const converted = fieldsFor(convertSetupUnits(collect(), next));
    setFields(current => ({ ...current, height: converted.height, weight: converted.weight }));setUnits(next);setClarification(null);setDirty(true);setErrors([]);
  }
  function issueFor(name: string, type = 'text'): string | undefined {
    const v = fields[name];
    if (v && type === 'number' && (!Number.isFinite(Number(v)) || Number(v) <= 0 || (name === 'age' && !Number.isInteger(Number(v))))) return 'Use a positive' + (name === 'age' ? ' whole' : '') + ' number.';
    if (v && ['targetTime', 'benchmarkTime'].includes(name) && durationSeconds(v) === null) return 'Use m:ss or h:mm:ss, for example 30:00.';
    if (v && type === 'date' && !validDate(v)) return 'Choose a valid date.';
    if (name === 'benchmarkDate' && v > today) return 'Choose today or an earlier date.';
    if (['startDate', 'targetDate'].includes(name) && fields.startDate && fields.targetDate && fields.targetDate <= fields.startDate) return 'Race date must be after the training start date.';
    return errors.find(issue => issue.field === name)?.message;
  }
  function next() {
    try {
      const issues = setupIssues(validateSetup(collect(), today)).filter(issue => issue.step === step);
      if (issues.length) { setErrors(issues); return; }
      setErrors([]);setStep(current => Math.min(3, current + 1));
    } catch (error) { setErrors([{ step, field: '', message: error instanceof Error ? error.message : 'Check your entries.' }]); }
  }
  async function save(complete: boolean) {
    if (complete && clarification) { setMessage('Edit the relevant inputs before generating again.');return; }
    setMessage('');setErrors([]);setGenerationError('');
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
      if (preview) { setDirty(false);setMessage(complete ? 'Preview complete. The live app generates and saves your plan from here.' : 'Draft saved in this preview only.');return; }
      let saved = block;
      // A retry after an interrupted save reuses the existing validated result.
      if (!saved || dirty || !saved.setup || saved.setup.schemaVersion !== 4) {
        const response = await fetch(saved ? `/api/blocks/${encodeURIComponent(saved.id)}/setup` : '/api/blocks', { method: saved ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setup, version: saved?.version, complete }) });
        const result = await response.json() as { block?: Plan; error?: string; issues?: SetupIssue[] };
        if (!response.ok || !result.block) { if (result.issues) setErrors(result.issues);throw new Error(result.error || 'Your draft could not be saved.'); }
        saved = result.block;setBlock(saved);setDirty(false);setFields(current => ({ ...current, name: saved!.raceName }));
        window.history.replaceState(window.history.state, '', `/blocks/${encodeURIComponent(saved.id)}/setup`);
      }
      if (!complete) { setMessage('Draft saved. Resume it from your training blocks.');return; }
      generating = true;
      const response = await fetch(`/api/blocks/${encodeURIComponent(saved.id)}/generation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: saved.version, consent: true, saveImmediately: true }) });
      const result = await response.json() as { block?: Plan; error?: string };
      if (result.block) setBlock(result.block);
      if (!response.ok || !result.block) throw new Error(result.error || result.block?.generation?.error || 'Generation could not finish. Your draft is saved; retry when ready.');
      if (result.block.generation?.status === 'clarification' && result.block.generation.output) { setClarification(result.block.generation.output);return; }
      if (result.block.generation?.status !== 'accepted') throw new Error(result.block.generation?.output?.questions.join(' ') || result.block.generation?.error || 'The plan needs more information. Your draft is preserved.');
      window.location.assign(`/blocks/${encodeURIComponent(saved.id)}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Please try again. Your draft is preserved.';
      if (generating) setGenerationError(displayGenerationError(text));
      else setErrors([{ step, field: '', message: text }]);
    }
    finally { setSaving(false); }
  }
  function input(name: string, label: string, type = 'text', required = true, hint?: string) {
    const error = issueFor(name, type), id = `setup-${name}`;
    return <label htmlFor={id}>{label}{required && <span className="setup-required">Required</span>}<input id={id} name={name} type={type} value={fields[name]} onChange={event => update(name, event.target.value)} step={type === 'number' ? name === 'age' ? '1' : 'any' : undefined} min={type === 'number' ? '0' : undefined} max={name === 'benchmarkDate' ? today : undefined} aria-required={required} aria-invalid={!!error} aria-describedby={`${id}-feedback`} placeholder={name === 'name' ? suggestedBlockName(collect()) : ['targetTime', 'benchmarkTime'].includes(name) ? '0:30:00' : undefined} /><small id={`${id}-feedback`} className={error ? 'setup-field-error' : undefined}>{error || hint}</small></label>;
  }
  const snapshot = collect();
  function submit(event: FormEvent) { event.preventDefault();if (step < 3) next();else void save(true); }
  return <div className="app-shell"><AppHeader displayName={displayName} preview={preview} /><main className="main-content setup-main">
    <a className="block-breadcrumb" href={library}><ArrowLeft size={15} />Training blocks</a>
    <section className="page-heading setup-heading"><div><h1>{readOnly ? 'Starting setup' : block ? 'Continue your setup' : 'Create a training block'}</h1><p className="blocks-intro">Your race goal, running experience and training days.</p></div><span className="block-status block-status-draft">{readOnly ? 'Saved snapshot' : 'Draft'}</span></section>
    {preview && <p className="preview-notice">Example preview. No personal data or paid generation calls.</p>}
    <nav className="setup-stepper" aria-label="Setup steps">{SETUP_STEPS.map((name, index) => <button type="button" key={name} disabled={saving} aria-current={step === index ? 'step' : undefined} onClick={() => { setStep(index);setErrors([]); }}><span>{index + 1}</span>{name}</button>)}</nav>
    <div className="setup-layout"><form className="setup-panel" onSubmit={submit} noValidate>
      {message && <p className="block-success" role="status"><CheckCircle2 size={17} />{message}</p>}
      {!!errors.length && <div className="setup-errors" role="alert"><strong>Check these details</strong><ul>{errors.map((issue, index) => <li key={index}><button type="button" onClick={() => setStep(issue.step)}>{issue.message}</button></li>)}</ul></div>}
      {generationError && <div className="setup-errors" role="alert"><strong>Plan generation couldn’t finish</strong><p>{generationError}</p></div>}
      {clarification && <PlanAdjustment output={clarification} onEdit={editAssessment} disabled={saving} />}
      <fieldset disabled={disabled}>
      {step === 0 && <><h2>What are you working toward?</h2><div className="setup-fields"><label htmlFor="setup-goalKind">Race distance<span className="setup-required">Required</span>
        <select id="setup-goalKind" value={fields.goalKind} onChange={event => update('goalKind', event.target.value)} aria-required="true" aria-invalid={!!issueFor('goalKind')} aria-describedby="race-distance-feedback">
          <option value="" disabled>Choose a race distance</option>
          {RACE_DISTANCES.map(race => <option key={race.meters} value={race.meters / 1000}>{race.label}</option>)}
          {fields.goalKind && !raceForKilometers(snapshot.goal.distanceKm) && <option value={fields.goalKind}>{raceDistanceLabel(snapshot.goal.distanceKm)} · saved goal</option>}
        </select>
        <small id="race-distance-feedback" className={issueFor('goalKind') ? 'setup-field-error' : undefined}>{issueFor('goalKind')}</small>
      </label>{input('targetTime', 'Target finish time', 'text', true, 'Enter m:ss or h:mm:ss. This is your goal, not a measured result.')}{input('startDate', 'Training start date', 'date')}{input('targetDate', 'Race date', 'date')}{input('name', 'Block name', 'text', false, 'Leave blank for a suggested name.')}</div></>}
      {step === 1 && <><h2>About you</h2><p className="setup-description">Choose your running experience and add your measurements.</p><div className="setup-fields"><label>Running experience<span className="setup-required">Required</span><select aria-label="Running experience" value={fields.experience} onChange={event => update('experience', event.target.value)} aria-invalid={errors.some(issue => issue.field === 'experience')}><option value="">Choose experience</option><option value="novice">Novice</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>{input('age', 'Age (years)', 'number')}{input('weight', `Weight (${units === 'mi' ? 'lb' : 'kg'})`, 'number')}{input('height', `Height (${units === 'mi' ? 'inches' : 'cm'})`, 'number', true, units === 'mi' ? 'Total inches, for example 70 for 5 ft 10 in.' : undefined)}</div>
        <section className="setup-benchmark" aria-labelledby="benchmark-heading">
          <h3 id="benchmark-heading">Performance benchmark</h3>
          <p className="setup-description">Add one recent race or best-effort time trial. Use an achieved result, not your goal time or an easy training run.</p>
          <div className="setup-fields">
            <label htmlFor="setup-benchmarkDistance">Result distance<span className="setup-required">Required</span>
              <select id="setup-benchmarkDistance" value={fields.benchmarkDistance} onChange={event => update('benchmarkDistance', event.target.value)} aria-required="true" aria-invalid={!!issueFor('benchmarkDistance')} aria-describedby="benchmark-distance-feedback">
                <option value="">Choose a distance</option>{RESULT_DISTANCES.map(key => <option key={key} value={key}>{RESULT_LABELS[key]}</option>)}
              </select><small id="benchmark-distance-feedback" className={issueFor('benchmarkDistance') ? 'setup-field-error' : undefined}>{issueFor('benchmarkDistance')}</small>
            </label>
            {input('benchmarkTime', 'Benchmark finish time', 'text', true, 'Use m:ss or h:mm:ss, for example 30:00 or 1:05:00.')}
            {input('benchmarkDate', 'Date achieved', 'date', true, fields.benchmarkDate && validDate(fields.benchmarkDate) && fields.benchmarkDate <= today ? `${dateDiff(today, fields.benchmarkDate)} days before today. The planner considers how representative this result is.` : 'Choose the date you completed this result.')}
          </div>
          <label className="setup-check" htmlFor="setup-benchmarkEffort"><input id="setup-benchmarkEffort" type="checkbox" checked={fields.benchmarkEffort === 'yes'} onChange={event => update('benchmarkEffort', event.target.checked ? 'yes' : '')} aria-required="true" aria-invalid={!!issueFor('benchmarkEffort')} aria-describedby="benchmark-effort-feedback" />I confirm this was a race or best-effort time trial.</label>
          <small id="benchmark-effort-feedback" className={issueFor('benchmarkEffort') ? 'setup-field-error' : undefined}>{issueFor('benchmarkEffort') || 'Required before generation. You can save a draft without completing this section.'}</small>
        </section>
      </>}
      {step === 2 && <><h2>Choose your training days</h2><p className="setup-description">Select the days you want a running workout. Race day is included even if it falls on another weekday.</p><div id="setup-trainingDays" tabIndex={-1} className="setup-days" role="group" aria-label="Selected training days">{DAY_NAMES.map((name, day) => <button type="button" key={name} aria-pressed={days.includes(day)} onClick={() => { setClarification(null);setDays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day].sort());setDirty(true);setErrors([]); }}>{name.slice(0,3)}<span>{days.includes(day) ? 'Run' : '—'}</span></button>)}</div></>}
      {step === 3 && <><h2>Your plan details</h2><SetupReview setup={readOnly && initial?.setup ? initial.setup : snapshot} /><p className="setup-footnote">Your benchmark informs estimated paces; your target finish time remains a goal. The plan saves automatically and starts only when you choose Start training.</p></>}
      </fieldset>
      <div className="setup-form-actions"><button className="button" type="button" disabled={saving || step === 0} onClick={() => { setStep(current => current - 1);setErrors([]); }}><ArrowLeft size={15} />Back</button><div>{!readOnly && <button className="button" type="button" disabled={saving} onClick={() => void save(false)}><Save size={15} />Save draft</button>}{step < 3 ? <button className="button primary" type={readOnly ? 'button' : 'submit'} disabled={saving} onClick={readOnly ? () => setStep(current => current + 1) : undefined}>Continue<ArrowRight size={15} /></button> : !readOnly && <button className="button primary" type="submit" disabled={saving || !!clarification}>{saving ? 'Generating and saving…' : 'Generate plan'}</button>}</div></div>
    </form><aside className="setup-aside"><div className="setup-unit-choice"><span>Measurements</span><div role="group" aria-label="Measurement units"><button aria-pressed={units === 'mi'} disabled={disabled} onClick={() => switchUnits('mi')}>mi · lb · in</button><button aria-pressed={units === 'km'} disabled={disabled} onClick={() => switchUnits('km')}>km · kg · cm</button></div></div><Flag size={23} /><h3>{fields.name || suggestedBlockName(snapshot)}</h3><dl><dt>Race date</dt><dd>{fields.targetDate || 'Not set'}</dd><dt>Target finish</dt><dd>{fields.targetTime || 'Not set'}</dd><dt>Experience</dt><dd>{fields.experience || 'Not selected'}</dd><dt>Training days</dt><dd>{days.length ? days.map(day => DAY_NAMES[day].slice(0,3)).join(', ') : 'Not selected'}</dd><dt>Workout paces</dt><dd>Numeric estimates</dd></dl><p>{dirty ? 'Unsaved changes' : block ? 'Draft saved' : 'Save a draft to return later'}</p></aside></div>
  </main></div>;
}

export function SetupReview({ setup }: { setup: BlockSetup }) {
  const value = simpleSetup(setup), benchmark = setup.schemaVersion === 4 ? (setup as IntakeSetup).benchmark : null;
  const display = (v: number | null, unit: string) => v === null ? 'Not provided' : `${v} ${unit}`;
  return <dl className="setup-review"><div><dt>Goal</dt><dd>{value.goal.name || suggestedBlockName(value)} · {raceDistanceLabel(value.goal.distanceKm)} · {setupTargetTime(value) || 'Target time not set'}</dd></div><div><dt>Training window</dt><dd>{value.goal.startDate || 'Not set'} → {value.goal.targetDate || 'Not set'}</dd></div><div><dt>Runner</dt><dd>{value.runner.experience || 'Experience not provided'} · {display(value.runner.age, 'years')} · {display(value.runner.weight, value.units === 'mi' ? 'lb' : 'kg')} · {display(value.runner.height, value.units === 'mi' ? 'in' : 'cm')}</dd></div>{setup.schemaVersion === 4 && <div><dt>Benchmark</dt><dd>{benchmark?.distance ? RESULT_LABELS[benchmark.distance] : 'Distance not set'} · {formatDuration(benchmark?.durationSeconds ?? null) || 'Time not set'} · {benchmark?.date || 'Date not set'} · {benchmark?.effortConfirmed ? 'Race or best-effort time trial confirmed' : 'Effort not confirmed'}</dd></div>}<div><dt>Training days</dt><dd>{value.availability.days.map(day => DAY_NAMES[day]).join(', ') || 'Not selected'}</dd></div><div><dt>Workout pace</dt><dd>{setup.schemaVersion === 4 ? 'Benchmark-informed estimates' : setup.schemaVersion === 3 ? 'Estimated numeric pace' : 'Original guidance preserved in the saved snapshot'}</dd></div></dl>;
}
