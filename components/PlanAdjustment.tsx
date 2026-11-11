'use client';
import { TriangleAlert } from 'lucide-react';
import type { PlanOutput, PlannerIntake } from '../lib/planner';
import { formatDate } from '../lib/domain';
import { DAY_NAMES } from '../lib/setup';
import { raceForMeters } from '../lib/race-distance';
import { formatDuration } from '../lib/workout-form';
import { ASSESSMENT_LABELS, goalSuggestions, type AssessmentAction, type GoalSuggestion } from '../lib/plan-assessment';

function targetContext(input: PlannerIntake | undefined) {
  const goal = input?.goal;
  const result = input?.baseline.results[0];
  const goalRace = goal && raceForMeters(goal.distanceMeters);
  const pastRace = result && raceForMeters(result.distanceMeters);
  if (!goalRace || !pastRace || !result?.durationSeconds || !goal?.targetDurationSeconds) return null;

  const goalName = goalRace.meters <= 10000 ? goalRace.label : goalRace.label.toLowerCase();
  const pastName = pastRace.meters <= 10000 ? pastRace.label : pastRace.label.toLowerCase();
  const sameDistance = goalRace.meters === pastRace.meters;
  const difference = result.durationSeconds - goal.targetDurationSeconds;
  const gap = difference % 60 === 0
    ? `${difference / 60} ${difference === 60 ? 'minute' : 'minutes'}`
    : formatDuration(difference);
  const summary = sameDistance
    ? difference > 0 ? `Your goal is ${gap} faster than your previous ${pastName} time.` : null
    : `Your past ${pastRace.label} time helps estimate training pace. Your ${goalName} finish time is less certain.`;
  return {
    summary, sameDistance,
    goalLabel: sameDistance ? 'Your target' : `${goalRace.label} goal`,
    pastLabel: sameDistance ? 'Past race time' : `Past ${pastRace.label} time`,
    targetTime: formatDuration(goal.targetDurationSeconds),
    pastTime: formatDuration(result.durationSeconds),
    raceName: goalName,
  };
}

export default function PlanAdjustment({ output, base, onEdit, input, today, onApply, disabled = false }: {
  output: PlanOutput; base?: string; onEdit?: (action: AssessmentAction) => void; disabled?: boolean;
  input?: PlannerIntake; today?: string; onApply?: (suggestion: GoalSuggestion) => void;
}) {
  if (output.outcome !== 'needs_clarification') return null;
  const actions = output.assessment?.actions ?? [];
  const suggestions = input && today && onApply ? goalSuggestions(output.assessment, input, today) : [];
  const finish = suggestions.find(suggestion => suggestion.kind === 'finish_time');
  const schedule = suggestions.find(suggestion => suggestion.kind === 'schedule');
  const context = targetContext(input);
  const reason = output.assessment?.reason ?? output.goalAssessment;
  const title = finish ? context && !context.sameDistance ? `Review your ${context.raceName} target` : 'Target time needs adjustment'
    : schedule ? 'Training schedule needs adjustment'
    : output.assessment?.decision === 'refresh_benchmark' ? 'Update your past race time'
    : 'Let’s adjust the plan inputs';
  const summary = finish ? context?.summary ?? reason : reason;
  const dateLabel = (date: string) => formatDate(date, { month: 'long', day: 'numeric', year: 'numeric' });

  return <section className="plan-adjustment" aria-labelledby="adjustment-title">
    <div className="plan-adjustment-heading">
      <h2 id="adjustment-title" tabIndex={-1}><TriangleAlert aria-hidden="true" size={22} />{title}</h2>
      <span className="block-status">Draft saved</span>
    </div>
    <p className="plan-adjustment-summary" role="status">{summary}</p>

    {context && <dl className="plan-adjustment-times">
      <div><dt>{context.goalLabel}</dt><dd>{context.targetTime}</dd></div>
      <div><dt>{context.pastLabel}</dt><dd>{context.pastTime}</dd></div>
    </dl>}

    {finish && <div className="plan-suggestion">
      <div>
        <h3>{context && !context.sameDistance ? `Suggested ${context.raceName} target` : 'Suggested target'}</h3>
        <strong className="plan-suggestion-time">{formatDuration(finish.durationSeconds)}</strong>
        <p>Planning estimate · Same race date and training days</p>
      </div>
      <div className="plan-suggestion-buttons">
        <button className="button primary" type="button" disabled={disabled} onClick={() => onApply?.(finish)}>Use {formatDuration(finish.durationSeconds)} target</button>
        {onEdit && <button className="plan-adjustment-link" type="button" disabled={disabled} onClick={() => onEdit('target_time')}>Edit target manually</button>}
      </div>
    </div>}

    {schedule && <div className="plan-suggestion">
      <div>
        <h3>Keep your target time</h3>
        {schedule.date && <p>
          {schedule.date.field === 'startDate' ? 'Start training' : 'If your race date is flexible, move it to'}{' '}
          <strong>{dateLabel(schedule.date.to)}</strong> instead of {dateLabel(schedule.date.from)}.
          {' '}This adds {schedule.additionalDays} {schedule.additionalDays === 1 ? 'day' : 'days'}.
        </p>}
        {schedule.trainingDays && <p>Training days <strong>{schedule.trainingDays.map(day => DAY_NAMES[day]).join(', ')}</strong>. Apply if these days work for you.</p>}
      </div>
      <button className={finish ? 'button' : 'button primary'} type="button" disabled={disabled} onClick={() => onApply?.(schedule)}>
        {schedule.trainingDays ? 'Apply suggested schedule' : schedule.date?.field === 'startDate' ? 'Apply earlier start' : 'Apply later race date'}
      </button>
    </div>}

    <details className="plan-adjustment-details">
      <summary>{suggestions.length ? 'Why this was suggested' : 'More about the assessment'}</summary>
      {reason !== summary && <p>{reason}</p>}
      {suggestions.map(suggestion => <p key={suggestion.kind}>{suggestion.reason}</p>)}
      <ul>{output.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
    </details>

    {!suggestions.length && <p className="plan-adjustment-next">No workouts were created. Edit your details to try again.</p>}
    <div className="plan-adjustment-actions">
      {actions.filter(action => action !== 'target_time' || !finish).map(action => onEdit
        ? <button className="plan-adjustment-link" type="button" key={action} disabled={disabled} onClick={() => onEdit(action)}>{ASSESSMENT_LABELS[action]}</button>
        : <a className="plan-adjustment-link" key={action} href={`${base}/setup?edit=${action}`}>{ASSESSMENT_LABELS[action]}</a>)}
      {!actions.length && (base
        ? <a className="plan-adjustment-link" href={`${base}/setup`}>Edit intake</a>
        : onEdit && <button className="plan-adjustment-link" type="button" disabled={disabled} onClick={() => onEdit('target_time')}>Edit target manually</button>)}
    </div>
  </section>;
}
