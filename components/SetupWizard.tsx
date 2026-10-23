'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Flag, Save } from 'lucide-react';
import AppHeader from './AppHeader';
import { DAY_NAMES, emptySetup, RESULT_DISTANCES, RESULT_LABELS, SETUP_STEPS, setupIssues, validateSetup, convertSetupUnits, type BlockSetup, type SetupIssue } from '../lib/setup';
import type { Plan } from '../lib/domain';

const PRESETS = ['5', '10', '21.0975', '42.195'];
function formFields(setup: BlockSetup): Record<string, string> {
  const string = (value: number | null) => value === null ? '' : String(value);
  const distance = setup.goal.distanceKm;
  return {
    name: setup.goal.name, targetDate: setup.goal.targetDate, startDate: setup.goal.startDate,
    targetTime: setup.goal.targetTime, goalKind: distance === null ? '' : PRESETS.includes(String(distance)) ? String(distance) : 'custom',
    customDistance: distance === null ? '' : String(Math.round(distance / (setup.units === 'mi' ? 1.609344 : 1) * 10000) / 10000),
    age: string(setup.runner.age), weight: string(setup.runner.weight), height: string(setup.runner.height),
    vo2Value: string(setup.runner.vo2?.value ?? null), vo2Source: setup.runner.vo2?.source ?? '', vo2Date: setup.runner.vo2?.date ?? '',
    weeklyDistance: string(setup.baseline.weeklyDistance), longestRun: string(setup.baseline.longestRun), runsPerWeek: string(setup.baseline.runsPerWeek),
    ...Object.fromEntries(RESULT_DISTANCES.flatMap(key => [[`${key}Time`, setup.baseline.results[key].time], [`${key}Date`, setup.baseline.results[key].date], [`${key}Source`, setup.baseline.results[key].source]])),
  };
}

export default function SetupWizard({ initial = null, displayName, today, readOnly = false, preview = false }: {
  initial?: Plan | null; displayName: string; today: string; readOnly?: boolean; preview?: boolean;
}) {
  const original = initial?.setup ?? emptySetup(initial?.raceName, initial?.raceDate);
  const [block, setBlock] = useState(initial);
  const [fields, setFields] = useState(() => formFields(original));
  const [step, setStep] = useState(original.step);
  const [units, setUnits] = useState(original.units);
  const [vo2Enabled, setVo2Enabled] = useState(original.runner.vo2 !== null);
  const [days, setDays] = useState(original.availability.days);
  const [longDay, setLongDay] = useState<number | null>(original.availability.longRunDay);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<SetupIssue[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const disabled = saving || readOnly;
  const libraryPath = preview ? '/preview?view=blocks' : '/blocks';
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  function update(name: string, value: string) {
    setFields(current => ({ ...current, [name]: value })); setDirty(true); setMessage(''); setErrors([]);
  }
  function collect(): BlockSetup {
    const numeric = (key: string) => fields[key].trim() === '' ? null : Number(fields[key]);
    const value = emptySetup();
    value.step = step; value.units = units;
    value.runner = { age: numeric('age'), weight: numeric('weight'), height: numeric('height'), vo2: vo2Enabled ? { value: numeric('vo2Value'), source: fields.vo2Source, date: fields.vo2Date } : null };
    value.goal = { name: fields.name, targetDate: fields.targetDate, startDate: fields.startDate, targetTime: fields.targetTime,
      distanceKm: fields.goalKind === 'custom' ? numeric('customDistance') === null ? null : numeric('customDistance')! * (units === 'mi' ? 1.609344 : 1) : fields.goalKind ? Number(fields.goalKind) : null };
    value.baseline = { weeklyDistance: numeric('weeklyDistance'), longestRun: numeric('longestRun'), runsPerWeek: numeric('runsPerWeek'), results: {
      '5k': { time: fields['5kTime'], date: fields['5kDate'], source: fields['5kSource'] as 'race' | 'time-trial' },
      '10k': { time: fields['10kTime'], date: fields['10kDate'], source: fields['10kSource'] as 'race' | 'time-trial' },
      half: { time: fields.halfTime, date: fields.halfDate, source: fields.halfSource as 'race' | 'time-trial' },
    } };
    value.availability = { days, longRunDay: longDay };
    return value;
  }
  function switchUnits(next: 'mi' | 'km') {
    if (next === units) return;
    const converted = convertSetupUnits(collect(), next);
    const newFields = formFields(converted);
    setFields(current => ({ ...current, weight: newFields.weight, height: newFields.height, weeklyDistance: newFields.weeklyDistance, longestRun: newFields.longestRun, customDistance: newFields.customDistance }));
    setUnits(next); setDirty(true); setMessage('');
  }
  function next() {
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
      if (!setup.goal.name || !setup.goal.targetDate) { setStep(0); throw new Error('Add a block name and target date to save. Other details can be completed later.'); }
      const issues = complete ? setupIssues(setup) : [];
      if (issues.length) { setErrors(issues); return; }
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
      setMessage(complete ? 'Setup saved. Your inputs are complete; goal feasibility still needs review. A training schedule has not been generated.' : 'Draft saved. You can resume it from Training blocks.');
    } catch (error) { setErrors(current => [...current, { step, field: '', message: error instanceof Error ? error.message : 'Please try again.' }]); }
    finally { setSaving(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); if (step < 4) next(); else void save(true); }
  function input(name: string, label: string, type = 'text', hint?: string) {
    return <label key={name}>{label}<input name={name} type={type} step={type === 'number' ? 'any' : undefined} min={type === 'number' ? '0' : type === 'date' ? '1900-01-01' : undefined} max={type === 'date' ? /Date$/.test(name) && !['startDate', 'targetDate'].includes(name) ? today : '2200-12-31' : undefined} value={fields[name]} onChange={event => update(name, event.target.value)} onInput={event => update(name, event.currentTarget.value)} autoComplete="off" />{hint && <small>{hint}</small>}</label>;
  }
  const snapshot = collect();
  let ready = false;
  try { ready = setupIssues(validateSetup(snapshot, today)).length === 0; }
  catch { /* Incomplete or invalid inputs remain editable in the draft. */ }
  return <div className="app-shell"><AppHeader displayName={displayName} preview={preview} /><main className="main-content setup-main">
    <a className="block-breadcrumb" href={libraryPath}><ArrowLeft size={15} /> Training blocks</a>
    <section className="page-heading setup-heading"><div><div className="overline">Build around the runner you are</div><h1>{readOnly ? 'Starting setup' : block ? 'Continue your setup' : 'Create a training block'}</h1><p className="blocks-intro">Your goal, your starting point, your time to train.</p></div><span className="block-status block-status-draft">{readOnly ? 'Saved snapshot' : 'Guided draft'}</span></section>
    {preview && <p className="preview-notice">Example data only. Preview changes reset when you leave this page.</p>}
    {readOnly && <p className="block-callout">This starting setup is preserved with the block. Reopen an archived block as a draft to edit it.</p>}
    <nav className="setup-stepper" aria-label="Setup steps">{SETUP_STEPS.map((title, index) => <button key={title} type="button" aria-current={index === step ? 'step' : undefined} disabled={saving} onClick={() => { setStep(index); setErrors([]); }}><span>{index + 1}</span>{title}</button>)}</nav>
    <div className="setup-layout"><form ref={formRef} className="setup-panel" onSubmit={submit} noValidate>
      {message && <div className="block-success" role="status"><CheckCircle2 size={17} />{message}</div>}
      {errors.length > 0 && <div className="setup-errors" role="alert"><strong>Let’s check a few details.</strong><ul>{errors.map((error, index) => <li key={index}><button type="button" onClick={() => setStep(error.step)}>{error.message}</button></li>)}</ul><p>Your entries are still here.</p></div>}
      <fieldset disabled={disabled}>
        {step === 0 && <><div className="section-eyebrow">01 · The finish line</div><h2>What are you working toward?</h2><p className="setup-description">Start with a goal. Saving these details does not approve the target or create a schedule.</p><div className="setup-fields">
          {input('name', 'Block name', 'text', 'A name and target date are enough to save an unfinished draft.')}
          <label>Goal distance<select value={fields.goalKind} onChange={event => update('goalKind', event.target.value)}><option value="">Choose distance</option><option value="5">5K</option><option value="10">10K</option><option value="21.0975">Half marathon</option><option value="42.195">Marathon</option><option value="custom">Custom distance</option></select></label>
          {fields.goalKind === 'custom' && input('customDistance', `Custom distance (${units})`, 'number')}
          {input('targetTime', 'Target finish time', 'text', 'm:ss or h:mm:ss, such as 28:00 or 2:15:00.')}
          {input('startDate', 'Training start date', 'date')}{input('targetDate', 'Target / race date', 'date')}
        </div></>}
        {step === 1 && <><div className="section-eyebrow">02 · The runner</div><h2>A little about you.</h2><p className="setup-description">These are the measurements for the start of this block. Each block keeps its own snapshot.</p><div className="setup-fields">{input('age', 'Age (years)', 'number')}{input('weight', `Weight (${units === 'mi' ? 'lb' : 'kg'})`, 'number')}{input('height', `Height (${units === 'mi' ? 'inches' : 'cm'})`, 'number', units === 'mi' ? 'Use total inches, such as 70 for 5 ft 10 in.' : undefined)}</div>
          <div className="setup-optional"><label className="setup-check"><input type="checkbox" checked={vo2Enabled} onChange={event => { setVo2Enabled(event.target.checked); setDirty(true); }} />Include VO₂ max <span>Optional</span></label><p>A supporting measurement. A dated best-effort result is still required.</p>{vo2Enabled && <div className="setup-fields">{input('vo2Value', 'VO₂ max', 'number')}{input('vo2Source', 'Measurement source', 'text', 'e.g. watch estimate or lab test')}{input('vo2Date', 'Measurement date', 'date')}</div>}</div>
        </>}
        {step === 2 && <><div className="section-eyebrow">03 · Your starting point</div><h2>Let your recent runs tell the story.</h2><p className="setup-description">Add at least one 5K, 10K, or half-marathon best effort. Use results that reflect your current fitness; keep the original result dates.</p><div className="setup-results">{RESULT_DISTANCES.map(key => <section key={key}><h3>{RESULT_LABELS[key]}</h3><div className="setup-fields">{input(`${key}Time`, `${RESULT_LABELS[key]} best effort`, 'text', 'm:ss or h:mm:ss')}{input(`${key}Date`, `${RESULT_LABELS[key]} result date`, 'date')}<label>Result type<select aria-label={`${RESULT_LABELS[key]} result type`} value={fields[`${key}Source`]} onChange={event => update(`${key}Source`, event.target.value)}><option value="race">Race</option><option value="time-trial">Time trial</option></select></label></div></section>)}</div><div className="setup-fields">{input('weeklyDistance', `Current weekly running distance (${units})`, 'number', 'Use 0 if you are not currently running.')}{input('longestRun', `Longest recent run (${units})`, 'number')}{input('runsPerWeek', 'Current running days per week', 'number')}</div></>}
        {step === 3 && <><div className="section-eyebrow">04 · Room in your week</div><h2>Make it fit your life.</h2><p className="setup-description">Choose the days you can consistently run. Other days remain available for recovery or cross-training.</p><div className="setup-days" role="group" aria-label="Available running days">{DAY_NAMES.map((name, day) => <button key={name} type="button" aria-pressed={days.includes(day)} onClick={() => {
          const nextDays = days.includes(day) ? days.filter(value => value !== day) : [...days, day].sort();
          setDays(nextDays); if (longDay === day && !nextDays.includes(day)) setLongDay(null); setDirty(true); setErrors([]);
        }}><span>{name.slice(0, 3)}</span>{days.includes(day) ? '✓' : '+'}</button>)}</div><p className="setup-days-note">{days.length} running {days.length === 1 ? 'day' : 'days'} per week</p><div className="setup-fields"><label>Preferred long-run day<select value={longDay ?? ''} onChange={event => { setLongDay(event.target.value === '' ? null : Number(event.target.value)); setDirty(true); }}><option value="">Choose an available day</option>{days.map(day => <option key={day} value={day}>{DAY_NAMES[day]}</option>)}</select></label></div></>}
        {step === 4 && <><div className="section-eyebrow">05 · Your starting snapshot</div><h2>Ready to save your setup?</h2><p className="setup-description">Review the inputs below. Your current active block and completed workouts stay as they are.</p><SetupReview setup={snapshot} /><div className="block-callout"><strong>{ready ? 'Required details are provided.' : 'A few details are still missing.'}</strong><p>{ready ? 'Saving confirms the inputs are complete. Goal feasibility and a training schedule still need review.' : 'You can save this draft now and finish the remaining details later.'}</p></div></>}
      </fieldset>
      <div className="setup-form-actions"><button className="button" type="button" disabled={saving || step === 0} onClick={() => { setStep(current => current - 1); setErrors([]); }}><ArrowLeft size={15} />Back</button><div>
        {!readOnly && <button className="button" type="button" disabled={saving} onClick={() => void save(false)}><Save size={15} />{saving ? 'Saving…' : 'Save draft'}</button>}
        {step < 4 ? <button className="button primary" type={readOnly ? 'button' : 'submit'} disabled={saving} onClick={readOnly ? () => setStep(current => current + 1) : undefined}>Continue<ArrowRight size={15} /></button> : !readOnly && <button className="button primary" type="submit" disabled={saving}>Save setup<CheckCircle2 size={15} /></button>}
      </div></div>
    </form><aside className="setup-aside"><div className="setup-unit-choice"><span>Measurements</span><div role="group" aria-label="Measurement units"><button aria-pressed={units === 'mi'} disabled={disabled} onClick={() => switchUnits('mi')}>mi · lb · in</button><button aria-pressed={units === 'km'} disabled={disabled} onClick={() => switchUnits('km')}>km · kg · cm</button></div></div><Flag size={23} /><h3>{fields.name || 'Your next chapter'}</h3><dl><dt>Target date</dt><dd>{fields.targetDate || 'Not set'}</dd><dt>Finish time</dt><dd>{fields.targetTime || 'Not set'}</dd><dt>Available days</dt><dd>{days.length ? [...days].sort().map(day => DAY_NAMES[day].slice(0, 3)).join(', ') : 'Not selected'}</dd><dt>VO₂ max</dt><dd>{vo2Enabled ? fields.vo2Value || 'Not entered' : 'Not provided · optional'}</dd></dl><p>{dirty ? 'You have unsaved changes.' : block ? 'Saved with this training block.' : 'Add a name and target date to save a draft.'}</p><a className="text-link" href={libraryPath}>Back to training blocks →</a></aside></div>
  </main></div>;
}

export function SetupReview({ setup }: { setup: BlockSetup }) {
  const value = (number: number | null, unit = '') => number === null ? 'Not provided' : `${number}${unit ? ` ${unit}` : ''}`;
  return <dl className="setup-review"><div><dt>Goal</dt><dd>{setup.goal.name || 'Untitled'} · {value(setup.goal.distanceKm, 'km')} · {setup.goal.targetTime || 'Time not set'}</dd></div><div><dt>Training window</dt><dd>{setup.goal.startDate || 'Start not set'} → {setup.goal.targetDate || 'Target not set'}</dd></div><div><dt>Runner</dt><dd>{value(setup.runner.age, 'years')} · {value(setup.runner.weight, setup.units === 'mi' ? 'lb' : 'kg')} · {value(setup.runner.height, setup.units === 'mi' ? 'in' : 'cm')}</dd></div><div><dt>Current running</dt><dd>{value(setup.baseline.weeklyDistance, `${setup.units}/week`)} · Longest {value(setup.baseline.longestRun, setup.units)} · {value(setup.baseline.runsPerWeek, 'days/week')}</dd></div>{RESULT_DISTANCES.map(key => { const result = setup.baseline.results[key]; return result.time || result.date ? <div key={key}><dt>{RESULT_LABELS[key]} best effort</dt><dd>{result.time || 'Time missing'} · {result.date || 'Date missing'} · {result.source === 'race' ? 'Race' : 'Time trial'}</dd></div> : null; })}<div><dt>VO₂ max</dt><dd>{setup.runner.vo2 ? `${value(setup.runner.vo2.value)} · ${setup.runner.vo2.source || 'Source missing'} · ${setup.runner.vo2.date || 'Date missing'}` : 'Not provided · optional'}</dd></div><div><dt>Available days</dt><dd>{setup.availability.days.length ? setup.availability.days.map(day => DAY_NAMES[day]).join(', ') : 'Not selected'} · Long run: {setup.availability.longRunDay === null ? 'Not selected' : DAY_NAMES[setup.availability.longRunDay]}</dd></div></dl>;
}
