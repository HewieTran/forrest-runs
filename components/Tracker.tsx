'use client';
import { acceptedPlan, simulatedBlock, changesPrescription } from '../lib/planner';
import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronLeft, Flag, Info, Plus, Settings2, X } from 'lucide-react';
import { EMPTY_WORKOUT_MEASUREMENTS, formatDate, isRun, type AppData, type Plan, type Workout, type WorkoutInput } from '../lib/domain';
import { periodForHour, todayWorkout, type WorkoutPeriod } from '../lib/block-overview';
import AppHeader from './AppHeader';
import WorkoutEditor from './WorkoutEditor';
import WorkoutDialog from './WorkoutDialog';
import TodayWorkout from './TodayWorkout';
import BlockProgress from './BlockProgress';
import BlockActions from './BlockActions';
import { applyCompletion } from '../lib/workout-completion';
import { raceDistanceLabel } from '../lib/race-distance';
import { setupTargetTime } from '../lib/setup';
import { blockReady } from '../lib/blocks';
import './block-overview.css';

export default function Tracker({ initial, preview = false, activeBlock = null }: {
  initial: AppData; preview?: boolean; activeBlock?: Pick<Plan, 'id' | 'raceName'> | null;
}) {
  const [data, setData] = useState(initial);
  const [currentActive, setCurrentActive] = useState(activeBlock);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [localPeriod, setLocalPeriod] = useState<WorkoutPeriod>('morning');
  const [previewPeriod, setPreviewPeriod] = useState<WorkoutPeriod | null>(null);
  const featured = data.workouts.find(row => row.id === featuredId) ?? todayWorkout(data.workouts, data.today);
  const editing = data.workouts.find(row => row.id === expandedWorkoutId);
  const newWorkout: Workout = { ...EMPTY_WORKOUT_MEASUREMENTS, id: 'new', planId: data.plan.id,
    date: featured?.date ?? data.today, phase: featured?.phase ?? 'Not applicable', type: 'Easy Run', plannedWorkout: '', targetPace: '',
    done: false, actualDistance: null, actualPace: '', effort: null, pain: '', notes: '', sourceRow: null, originalSource: null,
    timeOfDay: null, version: 1, updatedAt: '' };
  useEffect(() => {
    const update = () => setLocalPeriod(periodForHour(new Date().getHours()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 6500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);
  function confirmDiscardChanges() {
    return !hasUnsavedChanges || window.confirm('Discard your unsaved workout changes?');
  }
  function closeEditor() {
    if (saving || !confirmDiscardChanges()) return;
    setExpandedWorkoutId(null); setHasUnsavedChanges(false); setError(''); setPreviewPeriod(null);
  }
  function selectWorkout(id: string | null) {
    if (saving || !confirmDiscardChanges()) return;
    setFeaturedId(id); setExpandedWorkoutId(null); setHasUnsavedChanges(false); setError(''); setPreviewPeriod(null);
  }
  function openTodayWorkout(id: string) {
    if (saving || (expandedWorkoutId !== id && !confirmDiscardChanges())) return;
    if (expandedWorkoutId !== id) {
      const row = data.workouts.find(row => row.id === id);
      setPreviewPeriod(row?.timeOfDay ?? periodForHour(new Date().getHours()));
      setFeaturedId(id); setExpandedWorkoutId(id); setHasUnsavedChanges(false); setError('');
    }
  }
  async function saveWorkout(id: string, input: WorkoutInput) {
    const existing = data.workouts.find(workout => workout.id === id);
    const confirmPlanChange = acceptedPlan(data.plan) && (id === 'new' || !!existing && changesPrescription(existing, input));
    if (confirmPlanChange && !window.confirm('Changing prescribed workouts will mark this generated block as altered. The original plan will be kept. Save these changes?')) return;
    setSaving(true);
    setError('');
    try {
      let savedWorkout: Workout;
      if (preview) {
        const previewInput = id === 'new' ? input : applyCompletion(existing!, input, input.manualResultFields);
        savedWorkout = {
          ...(id === 'new'
            ? newWorkout
            : data.workouts.find((workout) => workout.id === id)!),
          ...previewInput,
          id: id === 'new' ? `preview-workout-${Date.now()}-${Math.random().toString(16).slice(2)}` : id,
          version: input.version + 1,
          updatedAt: new Date().toISOString(),
        };
      } else {
        const response = await fetch(
          id === 'new'
            ? `/api/workouts?blockId=${encodeURIComponent(data.plan.id)}`
            : `/api/workouts/${encodeURIComponent(id)}?blockId=${encodeURIComponent(data.plan.id)}`,
          {
            method: id === 'new' ? 'POST' : 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...input, confirmPlanChange }),
          },
        );
        const result = (await response.json()) as {
          workout: Workout;
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error || 'The workout could not be saved.');
        savedWorkout = result.workout;
      }
      const latestPlan = !preview && confirmPlanChange ? await fetch(`/api/blocks/${encodeURIComponent(data.plan.id)}/setup`).then(response => response.ok ? response.json() as Promise<{ block: Plan }> : null).catch(() => null) : null;
      setData((current) => ({
        ...current,
        plan: latestPlan?.block ?? current.plan,
        workouts:
          id === 'new'
            ? [...current.workouts, savedWorkout]
            : current.workouts.map((workout) =>
                workout.id === id ? savedWorkout : workout,
              ),
      }));
      setFeaturedId(savedWorkout.id);
      setPreviewPeriod(null);
      setExpandedWorkoutId(null);
      setHasUnsavedChanges(false);
      const completedRun = savedWorkout.done && !existing?.done && isRun(savedWorkout);
      const celebrateInHero = completedRun;
      if (celebrateInHero) {
        setSavedRunId(savedWorkout.id);
      }
      else if (savedRunId === savedWorkout.id && (!savedWorkout.done || !isRun(savedWorkout))) {
        setSavedRunId(null);
      }
      setToast(preview
        ? 'Preview updated. Changes are not saved.'
        : completedRun
          ? 'Good miles today. Workout saved.'
          : 'Workout saved. Your progress is up to date.',
      );
    } catch (caughtError) {
      setToast('');
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not connect. Your edits are still here. Try saving again.',
      );
    } finally {
      setSaving(false);
    }
  }
  const latestSavedAt = data.workouts
    .map((workout) => workout.updatedAt)
    .concat(data.plan.updatedAt)
    .sort()
    .at(-1);
  return <div className="app-shell">
    <AppHeader displayName={data.displayName} preview={preview} />
    <main className="main-content training-block-overview">
      <a className="block-breadcrumb" href={preview ? '/preview?view=blocks' : '/blocks'} onClick={event => { if (!confirmDiscardChanges()) event.preventDefault(); }}><ChevronLeft size={15} /> All training blocks</a>
      <section className="page-heading block-detail-heading"><div>
        <div className="block-title-row"><h1>{data.plan.raceName}</h1><div className="block-header-controls" role="group" aria-label="Block management">
          <a className="icon-button" aria-label="Training block settings" href={preview ? '/preview?view=settings' : `/blocks/${encodeURIComponent(data.plan.id)}/settings`} onClick={event => { if (!confirmDiscardChanges()) event.preventDefault(); }}><Settings2 size={19} /></a>
        </div></div>
        <div className="block-header-details"><BlockActions pill plan={data.plan} activeBlock={currentActive} preview={preview} disabled={saving || hasUnsavedChanges} ready={blockReady({ ...data.plan, workoutCount: data.workouts.length })} onChanged={block => {
            setData(current => ({ ...current, plan: block }));
            if (block.status === 'active') setCurrentActive({ id: block.id, raceName: block.raceName });
            else if (currentActive?.id === block.id) setCurrentActive(null);
            setToast('Block status updated.');
          }} /><span>Race · {formatDate(data.plan.raceDate, { month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
      </div></section>
      {preview && <div className="preview-notice"><Info size={16} /> Internal preview with example workouts. Changes here are not saved.</div>}
      {simulatedBlock(data.plan) && <p className="block-callout"><strong>Simulation mode.</strong> This example schedule demonstrates the app flow. It is not a personalized running plan and cannot be activated.</p>}
      <TodayWorkout data={data} featured={featured} savedRunId={savedRunId} saving={saving}
        period={previewPeriod ?? featured?.timeOfDay ?? localPeriod} onOpenWorkout={openTodayWorkout} onSelectWorkout={selectWorkout} />
      {(editing || expandedWorkoutId === 'new') && <WorkoutDialog
        title={editing ? `${editing.done ? 'Edit' : 'Log'} workout` : 'Add workout'}
        date={(editing ?? newWorkout).date} saving={saving} onClose={closeEditor}>
        <WorkoutEditor key={`${expandedWorkoutId}:${editing?.version ?? 1}`} workout={editing ?? newWorkout} saving={saving} error={error}
          initialPeriod={previewPeriod ?? localPeriod} onPeriodChange={setPreviewPeriod}
          onSave={input => saveWorkout(expandedWorkoutId!, input)} onCancel={closeEditor} onDirty={setHasUnsavedChanges} />
      </WorkoutDialog>}
      {data.plan.setup && <section className="block-callout overview-setup"><Flag size={21} /><div><strong>Your starting setup</strong><p>{raceDistanceLabel(data.plan.setup.goal.distanceKm)} · Target {setupTargetTime(data.plan.setup) || 'time not set'} · {data.plan.setup.availability.days.length} available running days</p>
        {acceptedPlan(data.plan) && <p>{data.plan.generation?.alteredAt ? 'Altered since acceptance. Your original generated plan is preserved.' : 'Your generated plan is saved.'} <a href={`/blocks/${encodeURIComponent(data.plan.id)}/plan`}>View original plan</a></p>}
        <a className="button" href={preview ? '/preview?view=setup' : `/blocks/${encodeURIComponent(data.plan.id)}/setup`}>{data.plan.status === 'draft' && !acceptedPlan(data.plan) ? 'Continue setup' : 'View starting setup'}</a></div></section>}
      <BlockProgress data={data} />
      <div className="overview-manage"><button type="button" className="button" disabled={saving || (!!data.plan.setup && !acceptedPlan(data.plan))} onClick={() => {
        if (!confirmDiscardChanges()) return;
        setExpandedWorkoutId('new'); setHasUnsavedChanges(false); setError(''); setPreviewPeriod(localPeriod);
      }}><Plus size={16} /> Add workout</button>{!data.workouts.length && !data.plan.setup && <a className="button" href={preview ? '/preview?view=setup' : `/blocks/${encodeURIComponent(data.plan.id)}/setup`}>Start guided setup</a>}</div>
      {error && !expandedWorkoutId && <p className="form-error" role="alert">{error}</p>}
      <footer className="app-footer"><span><span className="footer-dot" /> Dates use Central time · Artwork defaults to your device’s time</span><span>{latestSavedAt ? `Last saved ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(latestSavedAt))}` : ''}</span></footer>
    </main>
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={16} /></button></div>}
  </div>;
}
