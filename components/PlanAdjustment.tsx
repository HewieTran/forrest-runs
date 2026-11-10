'use client';
import type { PlanOutput, PlannerIntake } from '../lib/planner';
import { formatDate } from '../lib/domain';
import { DAY_NAMES } from '../lib/setup';
import { formatDuration } from '../lib/workout-form';
import { ASSESSMENT_LABELS, goalSuggestions, type AssessmentAction, type GoalSuggestion } from '../lib/plan-assessment';

export default function PlanAdjustment({ output, base, onEdit, input, today, onApply, disabled = false }: {
  output: PlanOutput; base?: string; onEdit?: (action: AssessmentAction) => void; disabled?: boolean;
  input?: PlannerIntake; today?: string; onApply?: (suggestion: GoalSuggestion) => void;
}) {
  if (output.outcome !== 'needs_clarification') return null;
  const actions = output.assessment?.actions ?? [];
  const suggestions = input && today && onApply ? goalSuggestions(output.assessment, input, today) : [];
  const dateLabel = (date: string) => formatDate(date, { month: 'long', day: 'numeric', year: 'numeric' });
  return <section className="plan-adjustment block-callout" role="status" aria-labelledby="adjustment-title">
    <h2 id="adjustment-title" tabIndex={-1}>Let’s adjust the plan inputs</h2>
    <p>{output.assessment?.reason ?? output.goalAssessment}</p>
    <ul>{output.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
    {suggestions.length > 0 && <div className="plan-suggestions">
      {suggestions.map(suggestion => {
        if (suggestion.kind === 'finish_time') return <section className="plan-suggestion" key={suggestion.kind}>
          <h3>Keep your race date and training days</h3>
          <p>Suggested finish time <strong>{formatDuration(suggestion.durationSeconds)}</strong></p>
          <p>{suggestion.reason} This is an estimate.</p>
          <button className="button" type="button" disabled={disabled} onClick={() => onApply?.(suggestion)}>Apply suggested finish time</button>
        </section>;
        const earlierStart = suggestion.date?.field === 'startDate';
        const date = suggestion.date;
        return <section className="plan-suggestion" key={suggestion.kind}>
          <h3>Keep your target finish time</h3>
          {date && <p>{earlierStart ? 'Start training' : 'If your race date is flexible, move it to'} <strong>{dateLabel(date.to)}</strong> instead of {dateLabel(date.from)}. This adds {suggestion.additionalDays} {suggestion.additionalDays === 1 ? 'day' : 'days'}.</p>}
          {suggestion.trainingDays && <p>Training days <strong>{suggestion.trainingDays.map(day => DAY_NAMES[day]).join(', ')}</strong>. Apply only if these days work for you.</p>}
          <p>{suggestion.reason}</p>
          <button className="button" type="button" disabled={disabled} onClick={() => onApply?.(suggestion)}>{suggestion.trainingDays ? 'Apply suggested schedule' : earlierStart ? 'Apply earlier start' : 'Apply later race date'}</button>
        </section>;
      })}
    </div>}
    <p>Your draft is saved. No workouts were created. {suggestions.length ? 'Apply a suggestion or edit the details before generating again.' : 'Edit the relevant details, then generate again.'}</p>
    <div className="plan-adjustment-actions">{actions.map(action => onEdit
      ? <button className="button" type="button" key={action} disabled={disabled} onClick={() => onEdit(action)}>{ASSESSMENT_LABELS[action]}</button>
      : <a className="button" key={action} href={`${base}/setup?edit=${action}`}>{ASSESSMENT_LABELS[action]}</a>)}</div>
    {!actions.length && base && <a className="button" href={`${base}/setup`}>Edit intake</a>}
  </section>;
}
