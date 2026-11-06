'use client';
import { useState, type FormEvent } from 'react';
import AppHeader from './AppHeader';
import BlockActions from './BlockActions';
import DeleteBlockButton from './DeleteBlockButton';
import { acceptedPlan } from '../lib/planner';
import type { AppData, Plan } from '../lib/domain';

export default function BlockSettings({ initial, activeBlock, preview = false }: { initial: AppData; activeBlock: Pick<Plan, 'id' | 'raceName'> | null; preview?: boolean }) {
  const [data, setData] = useState(initial), [active, setActive] = useState(activeBlock);
  const [name, setName] = useState(initial.plan.raceName), [date, setDate] = useState(initial.plan.raceDate);
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const base = preview ? '/preview' : `/blocks/${encodeURIComponent(data.plan.id)}`;
  const guidedDraft = !!data.plan.setup && !acceptedPlan(data.plan);
  async function save(event: FormEvent) {
    event.preventDefault();setError('');setNotice('');
    const changed = name !== data.plan.raceName || date !== data.plan.raceDate;
    const confirmPlanChange = changed && acceptedPlan(data.plan);
    if (confirmPlanChange && !window.confirm('This marks the generated block as altered. Workout dates will stay as scheduled. Save settings?')) return;
    setSaving(true);
    try {
      if (preview) setData(current => ({ ...current, plan: { ...current.plan, raceName: name, raceDate: date } }));
      else {
        const response = await fetch(`/api/training?blockId=${encodeURIComponent(data.plan.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raceName: name, raceDate: date, version: data.plan.version, confirmPlanChange }) });
        const result = await response.json() as AppData & { error?: string };
        if (!response.ok) throw new Error(result.error || 'Settings could not be saved.');
        setData(result);
      }
      setNotice('Settings saved. Your workout schedule is unchanged.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  }
  return <div className="app-shell"><AppHeader displayName={data.displayName} preview={preview} /><main className="main-content block-settings-page">
    <a className="block-breadcrumb" href={base}>← Back to {data.plan.raceName}</a><section className="page-heading"><div><h1>Training block settings</h1><p>{data.plan.raceName}</p></div></section>
    {notice && <p className="block-success" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
    <section className="panel block-settings-form"><h2>Block details</h2>{guidedDraft ? <p>Edit the name, dates and runner details in <a className="text-link" href={preview ? '/preview?view=setup' : `${base}/setup`}>your saved setup</a>.</p> : <form onSubmit={save}><fieldset disabled={saving}><label>Block name<input value={name} required maxLength={120} onChange={event => setName(event.target.value)} /></label><label>Race date<input type="date" value={date} required min="1900-01-01" max="2200-12-31" onChange={event => setDate(event.target.value)} /></label><p className="field-hint">Changing the race date updates the countdown. Workouts keep their scheduled dates.</p><button type="submit" className="button primary">{saving ? 'Saving…' : 'Save settings'}</button></fieldset></form>}</section>
    <section className="panel block-settings-management"><h2>Manage this block</h2><p>Archive to keep the history, or permanently delete this block and its workouts.</p><BlockActions plan={data.plan} activeBlock={active} disabled={saving} preview={preview} management onChanged={plan => { setData(current => ({ ...current, plan }));if (active?.id === plan.id && plan.status !== 'active') setActive(null);setNotice('Block status updated. Workouts and results are preserved.'); }} /><DeleteBlockButton block={data.plan} disabled={saving} preview={preview} onDeleted={() => window.location.assign(preview ? '/preview?view=blocks' : '/blocks')} /></section>
    <p className="setup-footnote"><a className="text-link" href={preview ? '/preview?view=blocks' : '/blocks'}>All training blocks</a></p>
  </main></div>;
}
