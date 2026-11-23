'use client';
import type { ClipboardEvent } from 'react';
import { durationSeconds } from '../lib/setup';
import { finishTimeParts, type FinishTimeParts, type HeightParts } from '../lib/setup-number-entry';
import { formatDuration } from '../lib/workout-form';
import TimePartsInput from './TimePartsInput';

type GroupProps = { id: string; label: string; error?: string };

export function FinishTimeField({ id, label, error, parts, onChange }: GroupProps & {
  parts: FinishTimeParts;
  onChange: (parts: FinishTimeParts) => void;
}) {
  const feedbackId = `${id}-feedback`;
  function pasteTime(event: ClipboardEvent<HTMLFieldSetElement>) {
    const seconds = durationSeconds(event.clipboardData.getData('text').trim());
    if (seconds === null) return;
    event.preventDefault();
    onChange(finishTimeParts(formatDuration(seconds)));
  }
  return <fieldset className="setup-number-field setup-span-two" onPaste={pasteTime}>
    <legend>{label}<span className="setup-required"> Required</span></legend>
    <TimePartsInput id={id} label={label} parts={parts.map(part => part === '' ? '' : String(Number(part)))} maxHours={24} invalid={!!error} describedBy={feedbackId} onChange={parts => onChange(parts as FinishTimeParts)} />
    <small id={feedbackId} className={error ? 'setup-field-error' : undefined}>
      {error || 'Leave any unused box blank.'}
    </small>
  </fieldset>;
}

export function ImperialHeightField({ id, label, error, parts, onChange }: GroupProps & {
  parts: HeightParts;
  onChange: (parts: HeightParts) => void;
}) {
  const feedbackId = `${id}-feedback`;
  return <fieldset className="setup-number-field">
    <legend>{label}<span className="setup-required"> Required</span></legend>
    <div className="setup-number-parts setup-height-parts">
      <label>
        <span className="sr-only">Feet</span>
        <input id={id} type="text" inputMode="numeric" value={parts[0]} aria-invalid={!!error}
          aria-describedby={error ? feedbackId : undefined} onChange={event => onChange([event.target.value.trim(), parts[1]])} />
        <span className="setup-height-unit" aria-hidden="true">ft</span>
      </label>
      <label>
        <span className="sr-only">Inches</span>
        <input type="text" inputMode="decimal" value={parts[1]} aria-invalid={!!error}
          aria-describedby={error ? feedbackId : undefined} onChange={event => onChange([parts[0], event.target.value.trim()])} />
        <span className="setup-height-unit" aria-hidden="true">in</span>
      </label>
    </div>
    {error && <small id={feedbackId} className="setup-field-error">{error}</small>}
  </fieldset>;
}
