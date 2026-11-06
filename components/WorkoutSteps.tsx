'use client';

import { useState } from 'react';
import { formatDuration, formatPace, parseInput, type DistanceUnit } from '../lib/workout-form';
import { editWorkoutStep, readableDuration, stepPace, type WorkoutStructure } from '../lib/workout-structure';

export default function WorkoutSteps({ structure, unit, onChange, onValidity }: {
  structure: WorkoutStructure; unit: DistanceUnit;
  onChange: (value: WorkoutStructure) => void; onValidity: (valid: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(() => structure.steps.map(step => ({ duration: formatDuration(step.durationSeconds), pace: formatPace(step.paceSecondsPerMile, unit) })));
  const durationValue = (text: string) => { const value = parseInput(text, 'duration', unit); return value !== null && value <= 86400 ? value : null; };
  const validRows = (rows: typeof values) => rows.every((row, i) => durationValue(row.duration) !== null &&
    (structure.steps[i].paceSecondsPerMile === null || structure.steps[i].kind === 'race' || parseInput(row.pace, 'pace', unit) !== null));
  function edit(index: number, field: 'duration' | 'pace', value: string) {
    const nextValues = values.map((row, i) => i === index ? { ...row, [field]: value } : row);
    setValues(nextValues);
    onValidity(validRows(nextValues));
    const parsed = field === 'duration' ? durationValue(value) : parseInput(value, field, unit);
    if (parsed === null) return;
    onChange(editWorkoutStep(structure, index, field, parsed));
  }
  return <section className="workout-steps" aria-label="Workout steps">
    <div className="measurement-heading"><h4>Workout steps</h4><button type="button" className="step-edit-button" disabled={editing && !validRows(values)} onClick={() => setEditing(!editing)}>{editing ? 'Done editing steps' : 'Edit steps'}</button></div>
    {editing && <label>Workout title<input value={structure.title} maxLength={120} required aria-invalid={!structure.title.trim()} onChange={event => onChange({ ...structure, title: event.target.value })} /></label>}
    <div className="step-column-head" aria-hidden="true"><span>Step</span><span>Duration</span><span>Pace</span></div>
    <ol className="workout-step-list">{structure.steps.map((step, index) => {
      const invalidDuration = durationValue(values[index].duration) === null;
      const editablePace = step.paceSecondsPerMile !== null && step.kind !== 'race';
      const invalidPace = editablePace && parseInput(values[index].pace, 'pace', unit) === null;
      return <li key={index} className="workout-step-row">
        <div className="step-name"><span className="step-number" aria-hidden="true">{index + 1}</span><div><strong>{step.label}</strong><small>{step.effort === 'race' ? 'Race effort' : `${step.effort[0].toUpperCase()}${step.effort.slice(1)} effort`}</small></div></div>
        {editing ? <label className="step-value"><span>Duration · h:mm:ss</span><input aria-label={`Step ${index + 1} duration`} inputMode="numeric" value={values[index].duration} maxLength={12} aria-invalid={invalidDuration} onChange={event => edit(index, 'duration', event.target.value)} />{invalidDuration && <small className="is-error">Use h:mm:ss, greater than zero, up to 24:00:00.</small>}</label>
          : <div className="step-value"><span>Duration</span><strong>{readableDuration(step.durationSeconds)}</strong></div>}
        {editing && editablePace ? <label className="step-value"><span>Pace · /{unit}</span><input aria-label={`Step ${index + 1} pace /${unit}`} inputMode="numeric" value={values[index].pace} maxLength={8} aria-invalid={invalidPace} onChange={event => edit(index, 'pace', event.target.value)} />{invalidPace && <small className="is-error">Use mm:ss, greater than zero.</small>}</label>
          : <div className="step-value"><span>Pace</span><strong>{stepPace(step, unit)}</strong>{editing && step.kind === 'race' && <small>Calculated from race distance</small>}</div>}
      </li>;
    })}</ol>
    {editing ? <label className="step-coaching-note">Coaching note<textarea rows={2} maxLength={350} value={structure.notes} onChange={event => onChange({ ...structure, notes: event.target.value })} /></label>
      : structure.notes && <p className="step-coaching-note">{structure.notes}</p>}
  </section>;
}
