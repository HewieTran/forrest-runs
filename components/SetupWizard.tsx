'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Flag, Save, X } from 'lucide-react';
import AppHeader from './AppHeader';
import { DAY_NAMES, emptySetup, RESULT_DISTANCES, RESULT_LABELS, SETUP_STEPS, setupIssues, validateSetup, convertSetupUnits, setupForEditing, suggestedBlockName, durationSeconds, type BlockSetup, type IntakeSetup, type ResultDistance, type SetupIssue } from '../lib/setup';
import { formatDuration } from '../lib/workout-form';
import { validDate, type Plan } from '../lib/domain';
import type { RecentBaseline } from '../lib/recent-baseline';

function formFields(setup: IntakeSetup): Record<string, string> {
  const string = (value: number | null) => value === null ? '' : String(value);
  return {
    name: setup.goal.name, targetDate: setup.goal.targetDate, startDate: setup.goal.startDate,
    targetTime: setup.goal.targetTime, goalKind: setup.goal.distanceKm === null ? '' : String(setup.goal.distanceKm),
    age: string(setup.runner.age), weight: string(setup.runner.weight), height: string(setup.runner.height),
    experience: setup.runner.experience ?? '', mode: setup.goal.mode, paceGuidance: setup.goal.paceGuidance,
    vo2Value: string(setup.runner.vo2?.value ?? null), vo2Source: setup.runner.vo2?.source ?? '', vo2Date: setup.runner.vo2?.date ?? '',
    weeklyDistance: string(setup.baseline.weeklyDistance), longestRun: string(setup.baseline.longestRun), runsPerWeek: string(setup.baseline.runsPerWeek),
    trainingChanges: setup.baseline.trainingChanges ?? '', trainingChangesNotes: setup.baseline.trainingChangesNotes,
    sessionLimit: formatDuration(setup.availability.maxSessionDurationSeconds), otherCommitments: setup.availability.otherCommitments,
    ...Object.fromEntries(DAY_NAMES.map((_, day) => [`limit${day}`, formatDuration(setup.availability.dayDurationLimits[day] ?? null)])),
    ...Object.fromEntries(RESULT_DISTANCES.flatMap(key => [[`${key}Time`, setup.baseline.results[key].time], [`${key}Date`, setup.baseline.results[key].date], [`${key}Source`, setup.baseline.results[key].source]])),
  };
}

export default function SetupWizard({ initial = null, displayName, today, readOnly = false, preview = false, recentBaseline = null }: {
  initial?: Plan | null; displayName: string; today: string; readOnly?: boolean; preview?: boolean; recentBaseline?: RecentBaseline | null;
}) {
  const original = initial?.setup ? setupForEditing(initial.setup) : emptySetup(initial?.raceName, initial?.raceDate, today);
  const [block, setBlock] = useState(initial);
  const [fields, setFields] = useState(() => formFields(original));
  const [step, setStep] = useState(original.step);
  const [units, setUnits] = useState(original.units);
  const [vo2Enabled, setVo2Enabled] = useState(original.runner.vo2 !== null);
  const [days, setDays] = useState(original.availability.days);
  const [longDay, setLongDay] = useState<number | null>(original.availability.longRunDay);
  const [resultRows, setResultRows] = useState<ResultDistance[]>(() => RESULT_DISTANCES.filter(key => original.baseline.results[key].time || original.baseline.results[key].date));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<SetupIssue[]>([]);
  const disabled = saving || readOnly;
  const libraryPath = preview ? '/preview?view=blocks' : '/blocks';
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  function update(name: string, value: string) {
    setFields(current => ({ ...current, [name]: value })); setDirty(true); setMessage('');
    setErrors(current => current.filter(error => error.field !== name));
  }
  function collect(): IntakeSetup {
    const numeric = (key: string) => fields[key].trim() === '' ? null : Number(fields[key]);
    const duration = (key: string) => fields[key] === '' ? null : durationSeconds(fields[key]) ?? NaN;
    const value = emptySetup();
    value.step = step; value.units = units;
    value.runner = { age: numeric('age'), weight: numeric('weight'), height: numeric('height'), experience: (fields.experience || null) as IntakeSetup['runner']['experience'], vo2: vo2Enabled ? { value: numeric('vo2Value'), source: fields.vo2Source, date: fields.vo2Date } : null };
    value.goal = { name: fields.name, targetDate: fields.targetDate, startDate: fields.startDate, targetTime: fields.targetTime,
      distanceKm: numeric('goalKind'), mode: fields.mode as 'finish' | 'time', paceGuidance: fields.paceGuidance as 'effort' | 'performance' };
    value.baseline = { weeklyDistance: numeric('weeklyDistance'), longestRun: numeric('longestRun'), runsPerWeek: numeric('runsPerWeek'), trainingChanges: (fields.trainingChanges || null) as IntakeSetup['baseline']['trainingChanges'], trainingChangesNotes: fields.trainingChangesNotes, results: {
      '5k': { time: fields['5kTime'], date: fields['5kDate'], source: fields['5kSource'] as 'race' | 'time-trial' },
      '10k': { time: fields['10kTime'], date: fields['10kDate'], source: fields['10kSource'] as 'race' | 'time-trial' },
      half: { time: fields.halfTime, date: fields.halfDate, source: fields.halfSource as 'race' | 'time-trial' },
    } };
    value.availability = { days, longRunDay: longDay, maxSessionDurationSeconds: duration('sessionLimit'), dayDurationLimits: Object.fromEntries(days.filter(day => fields[`limit${day}`] !== '').map(day => [String(day), duration(`limit${day}`)!])), otherCommitments: fields.otherCommitments };
    return value;
  }
  function switchUnits(next: 'mi' | 'km') {
    if (next === units) return;
    const converted = formFields(convertSetupUnits(collect(), next));
    setFields(current => ({ ...current, weight: converted.weight, height: converted.height, weeklyDistance: converted.weeklyDistance, longestRun: converted.longestRun }));
    setUnits(next); setDirty(true); setMessage('');
  }
  function localIssue(name: string, type: string): string | undefined {
    const value = fields[name];
    if (name.startsWith('vo2') && !vo2Enabled) return undefined;
    if (!value) return errors.find(error => error.field === name)?.message;
    if (type === 'number') {
      const zeroAllowed = ['weeklyDistance', 'longestRun', 'runsPerWeek'].includes(name);
      if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value)) || (zeroAllowed ? Number(value) < 0 : Number(value) <= 0)) return zeroAllowed ? 'Use zero or a positive number.' : 'Use a number greater than zero.';
      if (['age', 'runsPerWeek'].includes(name) && !Number.isSafeInteger(Number(value))) return 'Use a whole number.';
      if (name === 'runsPerWeek' && Number(value) > 7) return 'Choose between 0 and 7 days.';
    }
    if (/Time$/.test(name) || name === 'targetTime' || name === 'sessionLimit' || /^limit\d$/.test(name)) {
      const seconds = durationSeconds(value);
      if (seconds === null) return 'Use m:ss or h:mm:ss, such as 45:00 or 1:30:00.';
      if ((name === 'sessionLimit' || /^limit\d$/.test(name)) && seconds > 86400) return 'Use a session limit no longer than 24 hours.';
    }
    if (type === 'date' && (!validDate(value) || (!['startDate', 'targetDate'].includes(name) && value > today))) return 'Use a valid date on or before today.';
    if (['startDate', 'targetDate'].includes(name) && fields.startDate && fields.targetDate && fields.targetDate <= fields.startDate) return 'The race date must come after the start date.';
    return errors.find(error => error.field === name)?.message;
  }
  function next() {
    const badFields = Object.keys(fields).filter(name => localIssue(name, ['age', 'weight', 'height', 'weeklyDistance', 'longestRun', 'runsPerWeek', 'vo2Value'].includes(name) ? 'number' : /Date$/.test(name) ? 'date' : 'text'));
    // Validation still runs on the server. Local checks identify an invalid box.
    if (badFields.some(name => fieldStep(name) === step)) {
      setErrors(badFields.filter(name => fieldStep(name) === step).map(name => ({ step, field: name, message: localIssue(name, ['age', 'weight', 'height', 'weeklyDistance', 'longestRun', 'runsPerWeek', 'vo2Value'].includes(name) ? 'number' : /Date$/.test(name) ? 'date' : 'text')! })));
      return;
    }
    try {
      const issues = setupIssues(validateSetup(collect(), today)).filter(issue => issue.step === step);
      if (issues.length) { setErrors(issues); return; }
      setErrors([]); setStep(current => Math.min(4, current + 1));
    } catch (error) { setErrors([{ step, field: '', message: error instanceof Error ? error.message : 'Check your entries.' }]); }
  }
  async function save(complete: boolean) {
    setErrors([]); setMessage('');
    let setup: BlockSetup;
    try {
      setup = validateSetup(collect(), today);
      if (!setup.goal.targetDate) { setStep(0); throw new Error('Choose a race date to save your draft.'); }
      const issues = complete ? setupIssues(setup) : [];
      if (issues.length) { setErrors(issues); setStep(issues[0].step); return; }
    } catch (error) { setErrors([{ step, field: '', message: error instanceof Error ? error.message : 'Check your setup.' }]); return; }
    setSaving(true);
    try {
      let saved: Plan;
      if (preview) {
        const timestamp = new Date().toISOString();
        saved = { id: block?.id ?? `preview-setup-${Date.now()}`, status: 'draft', raceName: setup.goal.name, raceDate: setup.goal.targetDate, setup, paceGuide: [], sourceName: null, version: (block?.version ?? 0) + 1, createdAt: block?.createdAt ?? timestamp, updatedAt: timestamp };
      } else {
        const response = await fetch(block ? `/api/blocks/${encodeURIComponent(block.id)}/setup` : '/api/blocks', {
          method: block ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setup, version: block?.version, complete }),
        });
        const result = await response.json() as { block: Plan; error?: string; issues?: SetupIssue[] };
        if (!response.ok) { if (result.issues) setErrors(result.issues); throw new Error(result.error || 'Your setup could not be saved.'); }
        saved = result.block;
        if (!block) window.history.replaceState(window.history.state, '', `/blocks/${encodeURIComponent(saved.id)}/setup`);
      }
      setBlock(saved); setDirty(false);
      if (!fields.name) setFields(current => ({ ...current, name: setup.goal.name }));
      setMessage(complete ? 'Setup saved. Your baseline and constraints are ready for the next planner stage. No workouts have been generated.' : 'Draft saved. You can resume it from Training blocks.');
    } catch (error) { setErrors(current => [...current, { step, field: '', message: error instanceof Error ? error.message : 'Please try again.' }]); }
    finally { setSaving(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); if (step < 4) next(); else void save(true); }
  function input(name: string, label: string, type = 'text', hint?: string, required = false) {
    const error = localIssue(name, type), id = `setup-${name}`, feedbackId = `${id}-feedback`;
    return <label key={name} htmlFor={id}>{label}{required && <span className="setup-required">Required</span>}<input id={id} name={name} type={type} step={type === 'number' ? ['age', 'runsPerWeek'].includes(name) ? '1' : 'any' : undefined} min={type === 'number' ? '0' : type === 'date' ? '1900-01-01' : undefined} max={type === 'date' ? !['startDate', 'targetDate'].includes(name) ? today : '2200-12-31' : name === 'runsPerWeek' ? '7' : undefined} value={fields[name]} onChange={event => update(name, event.target.value)} autoComplete="off" aria-required={required} aria-invalid={Boolean(error)} aria-describedby={hint || error ? feedbackId : undefined} placeholder={name === 'name' ? suggestedBlockName(collect()) : undefined} />{(error || hint) && <small id={feedbackId} className={error ? 'setup-field-error' : undefined}>{error || hint}</small>}</label>;
  }
  function removeResult(key: ResultDistance) {
    setResultRows(current => current.filter(row => row !== key));
    setFields(current => ({ ...current, [`${key}Time`]: '', [`${key}Date`]: '', [`${key}Source`]: 'race' }));
    setDirty(true); setErrors([]);
  }
  const snapshot = collect();
  let ready = false;
  try { ready = setupIssues(validateSetup(snapshot, today)).length === 0; } catch { /* Partial inputs remain editable. */ }
  const defaultName = fields.name || suggestedBlockName(snapshot);
  return <div className="app-shell"><AppHeader displayName={displayName} preview={preview} /><main className="main-content setup-main">
    <a className="block-breadcrumb" href={libraryPath}><ArrowLeft size={15} /> Training blocks</a>
    <section className="page-heading setup-heading"><div><div className="overline">Build around the runner you are</div><h1>{readOnly ? 'Starting setup' : block ? 'Continue your setup' : 'Create a training block'}</h1><p className="blocks-intro">Your goal, your starting point, your time to train.</p></div><span className="block-status block-status-draft">{readOnly ? 'Saved snapshot' : 'Guided draft'}</span></section>
    {preview && <p className="preview-notice">Preview changes reset when you leave this page.</p>}
    {readOnly && <p className="block-callout">This starting setup is preserved with the block.</p>}
    <nav className="setup-stepper" aria-label="Setup steps">{SETUP_STEPS.map((title, index) => <button key={title} type="button" aria-current={index === step ? 'step' : undefined} disabled={saving} onClick={() => { setStep(index); setErrors([]); }}><span>{index + 1}</span>{title}{index === 1 && <small>Optional</small>}</button>)}</nav>
    <div className="setup-layout"><form className="setup-panel" onSubmit={submit} noValidate>
      {message && <div className="block-success" role="status"><CheckCircle2 size={17} />{message}</div>}
      {errors.length > 0 && <div className="setup-errors" role="alert"><strong>Let’s check a few details.</strong><ul>{errors.map((error, index) => <li key={index}><button type="button" onClick={() => setStep(error.step)}>{error.message}</button></li>)}</ul><p>Your entries are still here.</p></div>}
      <fieldset disabled={disabled}>
        {step === 0 && <><div className="section-eyebrow">01 · The finish line</div><h2>What are you working toward?</h2><p className="setup-description">Choose your race and how you want to approach it. Your start and race dates determine the training window.</p><div className="setup-fields">
          <label>Race distance <span className="setup-required">Required</span><select aria-label="Race distance" value={fields.goalKind} onChange={event => update('goalKind', event.target.value)}><option value="">Choose distance</option><option value="5">5K</option>{fields.goalKind && fields.goalKind !== '5' && <option value={fields.goalKind}>{fields.goalKind} km · saved distance</option>}</select><small>The first planner release starts with 5K. Existing goals stay saved.</small></label>
          <label>Goal type <span className="setup-required">Required</span><select aria-label="Goal type" value={fields.mode} onChange={event => update('mode', event.target.value)}><option value="finish">Finish comfortably</option><option value="time">Target a finish time</option></select></label>
          {(fields.mode === 'time' || fields.targetTime) && input('targetTime', fields.mode === 'time' ? 'Target finish time' : 'Previous target time · optional', 'text', fields.mode === 'time' ? 'm:ss or h:mm:ss, such as 28:00. A goal is not a measure of current fitness.' : 'Kept for reference; not used for a finish-comfortably goal. You can clear it.', fields.mode === 'time')}
          {input('startDate', 'Training start date', 'date', 'Starts today by default. Change it if you plan to begin later.', true)}{input('targetDate', 'Race date', 'date', undefined, true)}
          {input('name', 'Block name · optional', 'text', 'Leave blank to use the suggested name.')}
        </div><p className="setup-footnote">Saving your setup does not generate workouts or establish that your goal is achievable.</p></>}
        {step === 1 && <><div className="section-eyebrow">02 · The runner · optional</div><h2>Add context, or skip this step.</h2><p className="setup-description">Your recent running matters most. These details are optional and stay with this block’s starting snapshot.</p><div className="setup-fields"><label>Running experience · optional<select value={fields.experience} onChange={event => update('experience', event.target.value)}><option value="">Not provided</option><option value="novice">Novice · building a running routine</option><option value="intermediate">Intermediate · running consistently</option><option value="advanced">Advanced · experienced with structured training</option></select></label></div>
          <details className="setup-optional" open={readOnly || undefined}><summary>Body measurements <span>Optional</span></summary><div className="setup-fields">{input('age', 'Age (years)', 'number')}{input('weight', `Weight (${units === 'mi' ? 'lb' : 'kg'})`, 'number')}{input('height', `Height (${units === 'mi' ? 'inches' : 'cm'})`, 'number', units === 'mi' ? 'Use total inches, such as 70 for 5 ft 10 in.' : undefined)}</div></details>
          <div className="setup-optional"><label className="setup-check"><input type="checkbox" checked={vo2Enabled} onChange={event => { setVo2Enabled(event.target.checked); setDirty(true); }} />Include VO₂ max <span>Optional</span></label><p>A supporting measurement. It does not replace your training history.</p>{vo2Enabled && <div className="setup-fields">{input('vo2Value', 'VO₂ max', 'number')}{input('vo2Source', 'Measurement source', 'text', 'e.g. watch estimate or lab test')}{input('vo2Date', 'Measurement date', 'date')}</div>}</div>
        </>}
        {step === 2 && <><div className="section-eyebrow">03 · Your starting point</div><h2>Start with the running you do now.</h2><p className="setup-description">Use the last four weeks, not your peak training or your goal. Zero means none; a blank answer means unknown.</p>
          {recentBaseline && !readOnly && <div className="setup-history-suggestion"><strong>Use your recorded training?</strong><p>{recentBaseline.from} – {recentBaseline.to}: {Number((recentBaseline.weeklyDistanceMiles * (units === 'km' ? 1.609344 : 1)).toFixed(2))} {units}/week, about {recentBaseline.runsPerWeek} running days/week. Confirm your log includes your recent runs before using this summary.</p><button type="button" className="button" onClick={() => { const factor = units === 'km' ? 1.609344 : 1; setFields(current => ({ ...current, weeklyDistance: String(Number((recentBaseline.weeklyDistanceMiles * factor).toFixed(4))), longestRun: String(Number((recentBaseline.longestRunMiles * factor).toFixed(4))), runsPerWeek: String(recentBaseline.runsPerWeek) })); setDirty(true); setErrors([]); }}>Use recorded summary</button></div>}
          <div className="setup-fields">{input('weeklyDistance', `Average weekly distance (${units})`, 'number', 'Average over the last four weeks.', true)}{input('runsPerWeek', 'Current running days per week', 'number', 'How many days you currently run, from 0 to 7.', true)}{input('longestRun', `Longest recent run (${units})`, 'number', 'Your longest run in the last four weeks.', true)}
          <label>Anything interrupting or limiting training? <span className="setup-required">Required</span><select value={fields.trainingChanges} onChange={event => update('trainingChanges', event.target.value)} aria-invalid={errors.some(error => error.field === 'trainingChanges')}><option value="">Choose an answer</option><option value="none">No recent breaks or current limitations</option><option value="changed">Yes · describe briefly</option><option value="unsure">I’m unsure</option></select></label>
          {fields.trainingChanges === 'changed' && <label className="setup-span-two">What should the planner account for? <span className="setup-required">Required</span><textarea value={fields.trainingChangesNotes} maxLength={1000} rows={3} onChange={event => update('trainingChangesNotes', event.target.value)} placeholder="For example: reduced mileage for two weeks, or avoid hills." aria-invalid={errors.some(error => error.field === 'trainingChangesNotes')} /><small>Share only the information relevant to training.</small></label>}
          </div><div className="setup-optional"><h3>Pace guidance</h3><label>How should workouts describe effort?<select value={fields.paceGuidance} onChange={event => update('paceGuidance', event.target.value)}><option value="effort">By effort · no benchmark required</option><option value="performance">With numeric paces · dated benchmark required</option></select></label><p>A finish-time goal alone does not set your training paces.</p>
          <div className="setup-results">{resultRows.map(key => <section key={key}><div className="setup-result-heading"><h3>{RESULT_LABELS[key]} result</h3><button type="button" className="text-link" onClick={() => removeResult(key)} aria-label={`Remove ${RESULT_LABELS[key]} result`}><X size={14} /> Remove</button></div><div className="setup-fields">{input(`${key}Time`, 'Finish time', 'text', 'm:ss or h:mm:ss')}{input(`${key}Date`, 'Result date', 'date')}<label>Result type<select aria-label={`${RESULT_LABELS[key]} result type`} value={fields[`${key}Source`]} onChange={event => update(`${key}Source`, event.target.value)}><option value="race">Race</option><option value="time-trial">Time trial</option></select></label></div></section>)}</div>
          {resultRows.length < RESULT_DISTANCES.length && <label className="setup-add-result">Add a race or time trial<select aria-label="Add a performance result" value="" onChange={event => { if (event.target.value) { setResultRows(current => [...current, event.target.value as ResultDistance]); setDirty(true); } }}><option value="">Choose result distance</option>{RESULT_DISTANCES.filter(key => !resultRows.includes(key)).map(key => <option key={key} value={key}>{RESULT_LABELS[key]}</option>)}</select></label>}
          </div>
        </>}
        {step === 3 && <><div className="section-eyebrow">04 · Room in your week</div><h2>Choose the days you want scheduled.</h2><p className="setup-description">Each selected day is a planned running session. For example, choosing four days asks for four sessions per week, subject to review.</p><div className="setup-days" role="group" aria-label="Selected training days">{DAY_NAMES.map((name, day) => <button key={name} type="button" aria-pressed={days.includes(day)} onClick={() => {
          setDays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day].sort());
          if (longDay === day) setLongDay(null);
          update(`limit${day}`, ''); setErrors([]);
        }}><span>{name.slice(0, 3)}</span>{days.includes(day) ? '✓' : '+'}</button>)}</div><p className="setup-days-note">{days.length} requested {days.length === 1 ? 'session' : 'sessions'} per week</p><div className="setup-fields">{input('sessionLimit', 'Maximum time per session', 'text', 'm:ss or h:mm:ss, such as 45:00 or 1:30:00. Includes warm-up and cooldown.', true)}<label>Preferred longer-session day · optional<select value={longDay ?? ''} onChange={event => { setLongDay(event.target.value === '' ? null : Number(event.target.value)); setDirty(true); }}><option value="">Let the planner choose</option>{days.map(day => <option key={day} value={day}>{DAY_NAMES[day]}</option>)}</select></label></div>
          <details className="setup-optional" open={Object.values(original.availability.dayDurationLimits).length ? true : undefined}><summary>Different time limits on some days <span>Optional</span></summary><p>Only add an override where you need one. The default limit applies everywhere else.</p><div className="setup-fields">{days.map(day => input(`limit${day}`, `${DAY_NAMES[day]} time limit`, 'text', 'Leave blank to use the default.'))}</div></details>
          <details className="setup-optional" open={original.availability.otherCommitments ? true : undefined}><summary>Other exercise commitments <span>Optional</span></summary><label>Activities and days<textarea rows={3} maxLength={1000} value={fields.otherCommitments} onChange={event => update('otherCommitments', event.target.value)} placeholder="For example: climbing on Saturday, strength on Wednesday." /></label></details>
        </>}
        {step === 4 && <><div className="section-eyebrow">05 · Your starting snapshot</div><h2>Review the information for your plan.</h2><p className="setup-description">Check your current training and the limits the planner must respect. Saving here preserves your setup; AI generation is the next stage.</p><SetupReview setup={snapshot} /><div className="block-callout"><strong>{ready ? 'Your required inputs are complete.' : 'A few details are still missing.'}</strong><p>{ready ? 'Save your setup to keep this starting snapshot. A plan has not been generated or assessed yet.' : 'Save a draft and come back, or finish the highlighted details.'}</p></div><p className="setup-footnote">At generation, the planner will receive this baseline, goal and schedule. Saving this setup does not send it to OpenAI.</p></>}
      </fieldset>
      <div className="setup-form-actions"><button className="button" type="button" disabled={saving || step === 0} onClick={() => { setStep(current => current - 1); setErrors([]); }}><ArrowLeft size={15} />Back</button><div>
        {!readOnly && <button className="button" type="button" disabled={saving} onClick={() => void save(false)}><Save size={15} />{saving ? 'Saving…' : 'Save draft'}</button>}
        {step < 4 ? <button className="button primary" type={readOnly ? 'button' : 'submit'} disabled={saving} onClick={readOnly ? () => setStep(current => current + 1) : undefined}>{step === 1 && !vo2Enabled && !fields.age && !fields.weight && !fields.height && !fields.experience ? 'Skip' : 'Continue'}<ArrowRight size={15} /></button> : !readOnly && <button className="button primary" type="submit" disabled={saving}>Save setup<CheckCircle2 size={15} /></button>}
      </div></div>
    </form><aside className="setup-aside"><div className="setup-unit-choice"><span>Measurements</span><div role="group" aria-label="Measurement units"><button aria-pressed={units === 'mi'} disabled={disabled} onClick={() => switchUnits('mi')}>mi · lb · in</button><button aria-pressed={units === 'km'} disabled={disabled} onClick={() => switchUnits('km')}>km · kg · cm</button></div></div><Flag size={23} /><h3>{defaultName}</h3><dl><dt>Race date</dt><dd>{fields.targetDate || 'Not set'}</dd><dt>Goal</dt><dd>{fields.mode === 'finish' ? 'Finish comfortably' : fields.targetTime || 'Time not set'}</dd><dt>Training days</dt><dd>{days.length ? [...days].sort().map(day => DAY_NAMES[day].slice(0, 3)).join(', ') : 'Not selected'}</dd><dt>Default session limit</dt><dd>{fields.sessionLimit || 'Not set'}</dd></dl><p>{dirty ? 'You have unsaved changes.' : block ? 'Saved with this training block.' : 'Choose a race date to save a draft.'}</p><a className="text-link" href={libraryPath}>Back to training blocks →</a></aside></div>
  </main></div>;
}

function fieldStep(name: string) {
  if (['name', 'goalKind', 'mode', 'startDate', 'targetDate', 'targetTime'].includes(name)) return 0;
  if (['age', 'weight', 'height', 'experience', 'vo2Value', 'vo2Date', 'vo2Source'].includes(name)) return 1;
  if (name === 'sessionLimit' || /^limit\d$/.test(name) || name === 'otherCommitments') return 3;
  return 2;
}

export function SetupReview({ setup }: { setup: BlockSetup }) {
  const value = setupForEditing(setup);
  const number = (amount: number | null, unit = '') => amount === null || !Number.isFinite(amount) ? 'Not provided' : `${amount}${unit ? ` ${unit}` : ''}`;
  const limits = value.availability.dayDurationLimits;
  return <dl className="setup-review"><div><dt>Goal</dt><dd>{value.goal.name || suggestedBlockName(value)} · {number(value.goal.distanceKm, 'km')} · {value.goal.mode === 'finish' ? 'Finish comfortably' : value.goal.targetTime || 'Target time missing'}</dd></div><div><dt>Training window</dt><dd>{value.goal.startDate || 'Start not set'} → {value.goal.targetDate || 'Race date not set'}</dd></div><div><dt>Runner · optional</dt><dd>{value.runner.experience || 'Experience not provided'} · {number(value.runner.age, 'years')} · {number(value.runner.weight, value.units === 'mi' ? 'lb' : 'kg')} · {number(value.runner.height, value.units === 'mi' ? 'in' : 'cm')}</dd></div><div><dt>Recent four weeks</dt><dd>{number(value.baseline.weeklyDistance, `${value.units}/week`)} · Longest {number(value.baseline.longestRun, value.units)} · {number(value.baseline.runsPerWeek, 'running days/week')}</dd></div><div><dt>Changes / limitations</dt><dd>{value.baseline.trainingChanges === 'none' ? 'No recent breaks or current limitations reported' : value.baseline.trainingChanges === 'unsure' ? 'Unsure · needs follow-up before planning' : value.baseline.trainingChangesNotes || 'Not answered'}</dd></div><div><dt>Pace guidance</dt><dd>{value.goal.paceGuidance === 'effort' ? 'By effort' : 'Performance-based numeric paces'}</dd></div>{RESULT_DISTANCES.map(key => { const result = value.baseline.results[key]; return result.time || result.date ? <div key={key}><dt>{RESULT_LABELS[key]} result</dt><dd>{result.time || 'Time missing'} · {result.date || 'Date missing'} · {result.source === 'race' ? 'Race' : 'Time trial'}</dd></div> : null; })}<div><dt>VO₂ max · optional</dt><dd>{value.runner.vo2 ? `${number(value.runner.vo2.value)} · ${value.runner.vo2.source || 'Source missing'} · ${value.runner.vo2.date || 'Date missing'}` : 'Not provided'}</dd></div><div><dt>Requested schedule</dt><dd>{value.availability.days.length ? value.availability.days.map(day => DAY_NAMES[day]).join(', ') : 'No days selected'} · {value.availability.days.length} sessions/week<br />Longer session: {value.availability.longRunDay === null ? 'Planner chooses' : DAY_NAMES[value.availability.longRunDay]}</dd></div><div><dt>Full-session limits</dt><dd>Default: {formatDuration(value.availability.maxSessionDurationSeconds) || 'Not provided'}{Object.entries(limits).map(([day, limit]) => <span key={day}><br />{DAY_NAMES[Number(day)]}: {formatDuration(limit)}</span>)}</dd></div>{value.availability.otherCommitments && <div><dt>Other exercise</dt><dd>{value.availability.otherCommitments}</dd></div>}</dl>;
}
