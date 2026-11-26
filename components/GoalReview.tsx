'use client';
import { useState } from 'react';
import { addDays, formatDate } from '../lib/domain';
import { DAY_NAMES, simpleSetup } from '../lib/setup';
import { formatDuration, formatPace } from '../lib/workout-form';
import { METERS_PER_MILE, raceForMeters } from '../lib/race-distance';
import { confirmGoalReview, type GoalReview as Review, type ReviewOption, type ReviewSelection } from '../lib/goal-review';
import './goal-review.css';

export default function GoalReview({ review, today, disabled, onGenerate, onEdit }: {
  review: Review; today: string; disabled: boolean; onGenerate: (selection: ReviewSelection) => void; onEdit: () => void;
}) {
  const [chosen, setChosen] = useState<ReviewOption['kind'] | null>(review.confirmation?.selection.option ?? null);
  const [confirming, setConfirming] = useState(!!review.confirmation);
  const [extraDays, setExtraDays] = useState<number[]>(review.confirmation?.selection.trainingDays ?? []);
  const output = review.output;
  if (!output) return null;
  const input = review.input, goal = input.goal, race = raceForMeters(goal.distanceMeters);
  const result = input.baseline.results[0], target = formatDuration(goal.targetDurationSeconds);
  const sample = review.provider === 'simulation';
  const option = output.options.find(option => option.kind === chosen);
  const selection: ReviewSelection = { reviewId: review.id, option: chosen,
    ...(option?.kind === 'training_days' ? { trainingDays: [...extraDays].sort((a, b) => a - b) } : {}) };
  const dateLabel = (date: string) => formatDate(date, { month: 'short', day: 'numeric', year: 'numeric' });
  const names = (days: number[]) => days.map(day => DAY_NAMES[day].slice(0, 3)).join(', ');
  let changedSetup;
  if (confirming) {
    try { changedSetup = simpleSetup(confirmGoalReview(review, review.confirmation?.setup ?? review.setupSnapshot, selection, today)); }
    catch { /* An outdated choice must be reviewed again. */ }
  }
  const extraNeeded = option?.trainingDays ? option.trainingDays.length - input.availability.trainingDays.length : 0;
  const selectedDaysValid = !option || option.kind !== 'training_days' || extraDays.length === option.trainingDays!.length;
  function choose(option: ReviewOption) { setChosen(option.kind);setExtraDays(option.trainingDays ?? []); }
  function description(option: ReviewOption) {
    if (option.kind === 'target_time') return `${target} → ${formatDuration(option.targetDurationSeconds)} · ${option.targetDurationSeconds! - goal.targetDurationSeconds!} sec slower`;
    if (option.kind === 'race_date') return `${dateLabel(goal.raceDate)} → ${dateLabel(addDays(goal.raceDate, option.additionalDays!))} · +${option.additionalDays} days`;
    return `${input.availability.trainingDays.length} → ${option.trainingDays!.length} days / week · +${option.trainingDays!.length - input.availability.trainingDays.length} days`;
  }
  return <section className="goal-review" aria-labelledby="goal-review-title">
    <h2 id="goal-review-title" tabIndex={-1}>{confirming ? chosen === 'race_date' ? 'A little more runway' : 'Review your change' : sample ? 'Explore your sample plan' : output.decision === 'proceed' ? `Let’s chase ${target}` : output.decision === 'unsupported' ? 'That’s quite a leap.' : 'Let’s find your route'}</h2>
    {sample && <p className="preview-notice">Sample assessment and schedule. Goal feasibility has not been assessed.</p>}
    {confirming ? <>
      <p>Review this change before we build your plan.</p>
      {changedSetup ? <>
        <dl className="goal-confirmation">
          <div><dt>{race?.label} goal</dt><dd>{chosen === 'target_time' ? `${target} → ` : ''}{formatDuration(changedSetup.goal.targetDurationSeconds ?? null)}</dd></div>
          <div><dt>Race date</dt><dd>{chosen === 'race_date' ? `${dateLabel(goal.raceDate)} → ` : ''}{dateLabel(changedSetup.goal.targetDate)}{option?.additionalDays && <small>+{option.additionalDays} days</small>}</dd></div>
          <div><dt>Training</dt><dd>{chosen === 'training_days' ? `${input.availability.trainingDays.length} → ` : ''}{changedSetup.availability.days.length} days / week<small>{names(changedSetup.availability.days)}</small></dd></div>
          <div><dt>Recent result</dt><dd>{result && `${raceForMeters(result.distanceMeters)?.label} · ${formatDuration(result.durationSeconds)}`}</dd></div>
        </dl>
        {option && <p>{option.reason}</p>}
        <p>Confirming saves this change and generates your {sample ? 'sample ' : ''}plan toward {formatDuration(changedSetup.goal.targetDurationSeconds ?? null)}. Goal achievement is uncertain.</p>
        <div className="goal-review-actions"><button type="button" className="button" disabled={disabled} onClick={() => setConfirming(false)}>Back to options</button><button type="button" className="button primary" disabled={disabled} onClick={() => onGenerate(selection)}>Confirm &amp; generate {sample ? 'sample' : 'plan'}</button></div>
      </> : <p role="alert">This choice is outdated. Review your setup before continuing.</p>}
    </> : <>
      <div className={`goal-review-reason ${output.decision === 'proceed' ? 'goal-review-proceed' : ''}`}><strong>{output.decision === 'proceed' ? sample ? 'Your selected setup' : 'Keep your goal' : 'Why we’re suggesting a change'}</strong><p>{output.reason}</p></div>
      <dl className="goal-review-metrics"><div><dt>Your {race?.label} goal</dt><dd>{target}</dd><small>{goal.targetDurationSeconds && `${formatPace(goal.targetDurationSeconds / (goal.distanceMeters / METERS_PER_MILE), review.setupSnapshot.units)} /${review.setupSnapshot.units}`}</small></div><div><dt>Recent {result && raceForMeters(result.distanceMeters)?.label} result</dt><dd>{result && formatDuration(result.durationSeconds)}</dd><small>{result?.date && dateLabel(result.date)}</small></div></dl>
      <p className="goal-review-setup">{input.availability.trainingDays.length} days / week · {names(input.availability.trainingDays)} · {dateLabel(goal.raceDate)}</p>
      {output.decision === 'proceed' ? <>
        <h3>How your plan will work</h3><p>{output.approach}</p>
        <p>{sample ? 'The sample saves automatically so you can explore it.' : 'Your race workout will use this goal. Starting paces reflect your recent result, with appropriate progression toward goal-pace work.'}</p>
        <p className="setup-footnote">Your finish-time goal is a training target. Actual progress and race performance remain uncertain.</p>
        <div className="goal-review-actions"><button className="button" type="button" disabled={disabled} onClick={onEdit}>Back to setup</button><button className="button primary" type="button" disabled={disabled} onClick={() => onGenerate({ reviewId: review.id, option: null })}>{sample ? 'Generate sample plan' : `Generate my ${target} plan`}</button></div>
      </> : <>
        <p>{output.approach}</p>
        {!!output.options.length && <fieldset disabled={disabled} className="goal-review-options"><legend>Choose one change to review.</legend>{output.options.map(item => <label className="goal-review-option" key={item.kind}><input type="radio" name="goal-review-option" checked={chosen === item.kind} onChange={() => choose(item)} /><span><strong>{item.kind === 'training_days' ? `Keep ${target} · Add a training day` : item.kind === 'race_date' ? `Keep ${target} · Move the race` : 'Keep your schedule · Adjust the goal'}</strong><b>{description(item)}</b><span>{item.reason}</span></span></label>)}</fieldset>}
        {option?.kind === 'training_days' && <fieldset disabled={disabled} className="goal-extra-days"><legend>Choose {extraNeeded} extra {extraNeeded === 1 ? 'day' : 'days'} that work for you.</legend><div className="setup-days">{DAY_NAMES.map((name, day) => {
          const existing = input.availability.trainingDays.includes(day);
          return <button key={day} type="button" disabled={existing || disabled} aria-pressed={extraDays.includes(day)} onClick={() => setExtraDays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day])}>{name.slice(0, 3)}<span>{existing ? 'Current' : extraDays.includes(day) ? 'Added' : '—'}</span></button>;
        })}</div>{!selectedDaysValid && <p role="status">Select exactly {extraNeeded} extra {extraNeeded === 1 ? 'day' : 'days'} to continue.</p>}</fieldset>}
        <p className="setup-footnote">Your goal stays {target} until you confirm a change. Added days and suggested times are planning estimates.</p>
        <div className="goal-review-actions"><button className="button" type="button" disabled={disabled} onClick={onEdit}>Review setup</button>{!!output.options.length && <button type="button" className="button primary" disabled={disabled || !chosen || !selectedDaysValid} onClick={() => setConfirming(true)}>Review selected change</button>}</div>
      </>}
    </>}
  </section>;
}
