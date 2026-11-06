'use client';
import type { PlanOutput } from '../lib/planner';
import { ASSESSMENT_LABELS, type AssessmentAction } from '../lib/plan-assessment';

export default function PlanAdjustment({ output, base, onEdit, disabled = false }: {
  output: PlanOutput; base?: string; onEdit?: (action: AssessmentAction) => void; disabled?: boolean;
}) {
  if (output.outcome !== 'needs_clarification') return null;
  const actions = output.assessment?.actions ?? [];
  return <section className="plan-adjustment block-callout" role="status" aria-labelledby="adjustment-title">
    <h2 id="adjustment-title">Let’s adjust the plan inputs</h2>
    <p>{output.assessment?.reason ?? output.goalAssessment}</p>
    <ul>{output.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
    <p>Your draft is saved. No workouts were created. Edit the relevant details, then generate again.</p>
    <div className="plan-adjustment-actions">{actions.map(action => onEdit
      ? <button className="button" type="button" key={action} disabled={disabled} onClick={() => onEdit(action)}>{ASSESSMENT_LABELS[action]}</button>
      : <a className="button" key={action} href={`${base}/setup?edit=${action}`}>{ASSESSMENT_LABELS[action]}</a>)}</div>
    {!actions.length && base && <a className="button" href={`${base}/setup`}>Edit intake</a>}
  </section>;
}
