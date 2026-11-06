'use client';
import { useEffect, useState } from 'react';
import AppHeader from './AppHeader';
import PlanAdjustment from './PlanAdjustment';
import { displayGenerationError } from '../lib/plan-validation';
import { SetupReview } from './SetupWizard';
import { DAY_NAMES } from '../lib/setup';
import { acceptedPlan, simulatedBlock, scheduleDays, sessionSeconds } from '../lib/planner';
import { formatDate, weekStart, type Plan } from '../lib/domain';
import { formatDuration } from '../lib/workout-form';

export default function PlanGeneration({ initial, displayName, configured, mode, today }: { initial: Plan; displayName: string; configured: boolean; mode: 'disabled' | 'simulation' | 'openai'; today: string }) {
  const [block, setBlock] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 10000); return () => clearInterval(timer); }, []);
  const generation = block.generation, output = generation?.output;
  const simulation = generation ? simulatedBlock(block) : mode === 'simulation';
  const inFlight = generation?.status === 'generating' && clock - Date.parse(generation.startedAt) < 180000;
  const cooldown = generation ? Math.max(0, Math.ceil((60000 - clock + Date.parse(generation.startedAt)) / 1000)) : 0;
  const accepted = acceptedPlan(block), editable = block.status === 'draft' && !accepted;
  const base = `/blocks/${encodeURIComponent(block.id)}`;
  const input = generation?.input;
  const manifest = input ? scheduleDays(input) : [];
  const weeks = [...new Set(manifest.map(day => weekStart(day.date)))];
  const raceDay = new Date(block.raceDate + 'T12:00:00Z').getUTCDay();
  const raceExtra = block.setup && !block.setup.availability.days.includes(raceDay);
  const staleDate = Boolean(block.setup && block.setup.goal.startDate < today);
  async function generate() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api${base}/generation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: block.version, consent: true, saveImmediately: true }) });
      const result = await response.json() as { block?: Plan; error?: string };
      if (result.block) { setBlock(result.block); if (acceptedPlan(result.block)) { window.location.assign(base); return; } }
      if (!response.ok && !result.block) throw new Error(result.error || 'Generation could not finish. Reload to check its status.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Generation could not finish. Reload to check its status.'); }
    finally { setBusy(false); setClock(Date.now()); }
  }
  return <><AppHeader displayName={displayName} /><main className="main-content plan-generation">
    <a className="text-link" href={accepted ? base : '/blocks'}>← {accepted ? 'Back to this block' : 'Training blocks'}</a>
    <section className="page-heading"><h1>{simulation ? 'Try a simulated 5K plan' : accepted ? 'Original training plan' : 'Build your 5K plan'}</h1><p className="blocks-intro">{block.raceName} · {formatDate(block.raceDate, { month: 'long', day: 'numeric', year: 'numeric' })}</p></section>
    {simulation && <p className="block-callout" role="status"><strong>SIMULATION · No AI calls or API charges.</strong> This example uses your dates, selected days and experience to demonstrate numeric targets. It is not a personalized training recommendation. You can save it as a demonstration draft; it cannot become your active training block.</p>}
    <details className="plan-intake"><summary>{accepted ? 'Starting intake' : 'Review saved intake'}</summary>{block.setup && <SetupReview setup={generation?.setupSnapshot ?? block.setup} />}</details>
    {raceExtra && <p className="block-callout">Race day is {DAY_NAMES[raceDay]}, outside your selected running days. The plan includes the race on that date; the race stays on its actual date.</p>}
    {!accepted && !simulation && <p className="setup-footnote">Generate with OpenAI sends this block’s confirmed benchmark, runner details, race goal and selected training days to OpenAI. It does not include your name, email, other blocks or raw run history. The validated schedule is saved directly to your block. Training suitability and goal achievement are not guaranteed.</p>}
    {!configured && editable && <p className="block-callout">Plan generation isn’t connected yet. Your intake is saved.</p>}
    {staleDate && editable && <p className="block-callout">The start date is in the past. Update your intake before generating a plan.</p>}
    {(error || generation?.error) && <p role="alert" className="form-error">{displayGenerationError(error || generation?.error || '')}</p>}
    {(busy || inFlight) && <p role="status" className="block-callout">{busy ? simulation ? 'Preparing the example schedule…' : 'Working on your plan. This can take up to two minutes…' : 'A generation request is in progress. Reload in a moment to see the result.'}</p>}
    {generation?.status === 'generating' && !inFlight && !busy && <p className="block-callout">The previous request did not finish. You can generate a fresh draft.</p>}
    {output && <section className="plan-proposal" aria-labelledby="proposal-title">
      <h2 id="proposal-title">{output.outcome === 'plan' ? accepted ? 'Original generated schedule' : 'Generated schedule' : 'A few things to clarify'}</h2>
      {accepted && <p className="block-callout">{generation?.alteredAt ? 'This block has been altered since generation. The original schedule below is preserved; open the block to see your current schedule.' : 'This is the schedule originally generated. Your current workout results are in the block.'}</p>}
      <p>{output.summary}</p><h3>Your race goal</h3><p>{output.goalAssessment}</p>
      {!!output.assumptions.length && <><h3>Assumptions to review</h3><ul>{output.assumptions.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
      {output.outcome === 'needs_clarification' && <PlanAdjustment output={output} base={base} />}
      {output.outcome === 'plan' && <><p className="setup-footnote">Full-session times include all steps. Race-step time is an estimate. Days marked rest are explicit parts of this proposed schedule.</p><div className="plan-weeks">{weeks.map((week, i) => {
        const days = manifest.filter(day => weekStart(day.date) === week);
        const sessions = output.sessions.filter(session => weekStart(session.date) === week);
        return <details key={week} className="plan-week" open={i === 0}>
          <summary>Week of {formatDate(week)} <span>{sessions.length} sessions · {formatDuration(sessions.reduce((sum, session) => sum + sessionSeconds(session), 0))} total</span></summary>
          {days.map(day => { const session = output.sessions.find(session => session.date === day.date);
            return <article className={`plan-day ${session ? '' : 'plan-rest'}`} key={day.date}>
              <div className="plan-day-heading"><strong>{formatDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' })}</strong><span>{session ? `${session.type} · ${formatDuration(sessionSeconds(session))}` : 'Rest'}</span></div>
              {session && <><h4>{session.title}</h4><ol>{session.steps.map((step, index) => <li key={index}>{step.label} · {formatDuration(step.durationSeconds)} · {step.effort}{step.distanceMiles !== null && ` · ${Number((step.distanceMiles * (block.setup?.units === 'km' ? 1.609344 : 1)).toFixed(2))} ${block.setup?.units ?? 'mi'}`}{step.paceSecondsPerMile !== null && ` · ${formatDuration(Math.round(step.paceSecondsPerMile / (block.setup?.units === 'km' ? 1.609344 : 1)))}/${block.setup?.units ?? 'mi'}`}</li>)}</ol>{session.notes && <p>{session.notes}</p>}{block.setup && block.setup.schemaVersion < 3 && <small>Full-session limit {formatDuration(day.limitSeconds)}</small>}</>}
            </article>;
          })}
        </details>;
      })}</div></>}
    </section>}
    <div className="setup-form-actions">
      {editable && <a className="button" aria-disabled={busy} href={busy ? undefined : `${base}/setup`}>Edit intake</a>}
      <div>{editable && <button className="button primary" disabled={busy || inFlight || output?.outcome === 'needs_clarification' || (cooldown > 0 && generation?.status !== 'review') || !configured || staleDate} onClick={() => void generate()}>{generation?.status === 'review' ? 'Finish saving plan' : 'Generate plan'}</button>}</div>
    </div>
    {generation && <p className="setup-footnote">Generated {new Date(generation.startedAt).toLocaleString()} · {generation.model} · {generation.promptVersion} / {generation.validatorVersion}</p>}
  </main></>;
}
