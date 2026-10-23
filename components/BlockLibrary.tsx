'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, CalendarDays, Flag, Layers3, Plus, Search, X } from 'lucide-react';
import AppHeader from './AppHeader';
import { BlockStatusBadge } from './BlockActions';
import { STATUS_LABELS, type BlockSummary } from '../lib/blocks';
import { BLOCK_STATUSES, formatDate, type BlockStatus, type Plan } from '../lib/domain';

function CreateBlock({ onClose, onSaved, preview }: { onClose: () => void; onSaved: (block: Plan) => void; preview: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty = name !== '' || date !== '';
  function close() { if (!saving && (!dirty || window.confirm('Discard this unsaved block?'))) onClose(); }
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const fields = new FormData(event.currentTarget);
    const submittedName = String(fields.get('raceName'));
    const submittedDate = String(fields.get('raceDate'));
    try {
      let block: Plan;
      if (preview) {
        const stamp = new Date().toISOString();
        block = { id: `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`, raceName: submittedName.trim(), raceDate: submittedDate, status: 'draft', paceGuide: [], sourceName: null, version: 1, createdAt: stamp, updatedAt: stamp };
      } else {
        const response = await fetch('/api/blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raceName: submittedName, raceDate: submittedDate }) });
        const result = await response.json() as { block: Plan; error?: string };
        if (!response.ok) throw new Error(result.error || 'The block could not be created.');
        block = result.block;
      }
      onSaved(block);
    } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  }
  return <dialog ref={ref} className="settings-dialog create-block-dialog" aria-labelledby="create-block-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="dialog-heading"><div><p className="section-eyebrow">Your next chapter</p><h2 id="create-block-title">Create a training block</h2></div><button className="icon-button" disabled={saving} aria-label="Close create block" onClick={close}><X size={17} /></button></div>
    <p className="block-dialog-description">Start a manual training log and add your own workouts. Your new block will be saved as a draft.</p>
    <form className="block-create-form" onSubmit={submit}><fieldset disabled={saving}>
      <label>Block name<input name="raceName" autoFocus required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Spring 10K" /></label>
      <label>Target / race date<input name="raceDate" type="date" required min="1900-01-01" max="2200-12-31" value={date} onChange={event => setDate(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="block-dialog-actions"><button className="button" type="button" onClick={close}>Cancel</button><button type="submit" className="button primary">{saving ? 'Creating…' : 'Save draft'}</button></div>
    </fieldset></form>
  </dialog>;
}

export default function BlockLibrary({ initial, displayName, preview = false }: { initial: BlockSummary[]; displayName: string; preview?: boolean }) {
  const [blocks, setBlocks] = useState(initial);
  const [filter, setFilter] = useState<BlockStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const visible = blocks.filter(block => (filter === 'all' || block.status === filter) && block.raceName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const counts = (status: BlockStatus) => blocks.filter(block => block.status === status).length;
  return <div className="app-shell"><AppHeader displayName={displayName} preview={preview} />
    <main className="main-content blocks-main">
      <section className="page-heading blocks-page-heading"><div><div className="overline">Every goal has a chapter</div><h1>Training blocks</h1><p className="blocks-intro">A home for the work behind every finish line.</p></div><div className="block-create-options"><button className="button" onClick={() => setCreating(true)}>Manual block</button><a className="button primary" href={preview ? '/preview?view=setup' : '/blocks/new'}><Plus size={17} />Create training block</a></div></section>
      <div className="library-stats" aria-label="Training block totals">
        <div><Layers3 size={19} /><span><strong>{blocks.length}</strong> total blocks</span></div>
        <div><Flag size={19} /><span><strong>{counts('active')}</strong> active</span></div>
        <div><span className="library-stat-check">✓</span><span><strong>{counts('completed')}</strong> completed</span></div>
      </div>
      {preview && <p className="preview-notice">Example data only. Preview changes reset when you leave this page.</p>}
      {notice && <p className="block-success" role="status">{notice}</p>}
      <div className="library-toolbar"><div className="block-filters" role="group" aria-label="Filter training blocks">
        {(['all', ...BLOCK_STATUSES] as const).map(status => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status === 'all' ? 'All blocks' : STATUS_LABELS[status]}<span>{status === 'all' ? blocks.length : counts(status)}</span></button>)}
      </div><label className="block-search"><Search size={16} /><span className="sr-only">Search training blocks</span><input type="search" placeholder="Find a block…" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
      <div className="block-grid">
        {visible.map(block => {
          const percent = block.workoutCount ? Math.round(block.completedCount / block.workoutCount * 100) : 0;
          const href = preview ? block.hasSetup ? '/preview?view=setup' : `/preview?blockId=${encodeURIComponent(block.id)}&name=${encodeURIComponent(block.raceName)}&date=${block.raceDate}&status=${block.status}` : `/blocks/${encodeURIComponent(block.id)}${block.hasSetup && block.status === 'draft' ? '/setup' : ''}`;
          return <article className={`block-card ${block.status === 'active' ? 'active-block-card' : ''}`} key={block.id}>
            <div className="block-card-top"><BlockStatusBadge status={block.status} /><span className="block-source">{block.sourceName ? 'Imported training log' : block.hasSetup ? 'Guided setup' : 'Manual training block'}</span></div>
            <h2><a href={href}>{block.raceName}</a></h2><p className="block-card-date"><CalendarDays size={14} />Target · {formatDate(block.raceDate, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            <div className="block-card-facts"><div><small>Workouts logged</small><strong>{block.completedCount}<span> / {block.workoutCount}</span></strong></div><div><small>Recorded running</small><strong>{block.recordedMiles.toLocaleString('en-US', { maximumFractionDigits: 1 })}<span> mi</span></strong></div><div><small>Training starts</small><strong className="block-start-date">{block.firstWorkoutDate ? formatDate(block.firstWorkoutDate) : 'Not scheduled'}</strong></div></div>
            <div className="block-progress-label"><span>Workout completion</span><strong>{percent}%</strong></div><div className="block-progress" role="progressbar" aria-label={`${block.raceName} workout completion`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
            <p className="block-card-note">{block.hasSetup ? 'Runner inputs saved with this block. A training schedule has not been generated.' : block.workoutCount === 0 ? 'A fresh page. Add your first workout whenever you’re ready.' : block.status === 'archived' ? 'Workouts and results preserved in your archive.' : block.status === 'completed' ? 'Block completed. Your training history stays with you.' : `${block.workoutCount} scheduled workouts · Your results stay with this block.`}</p>
            <div className="block-card-bottom"><a className={block.status === 'active' ? 'button primary' : 'button'} href={href}>{block.status === 'active' ? 'Continue training' : block.status === 'draft' ? block.hasSetup ? 'Resume setup' : 'Open draft' : 'View block'}<ArrowUpRight size={15} /></a><span>{block.status === 'active' ? 'Your current block' : `Created ${formatDate(block.createdAt.slice(0, 10))}`}</span></div>
          </article>;
        })}
      </div>
      {!visible.length && <section className="block-empty"><Layers3 size={34} /><h2>{search ? 'No matching blocks' : `No ${filter === 'all' ? 'training' : filter} blocks yet`}</h2><p>{search ? 'Try another name or clear your search.' : 'Your blocks will appear here as your running journey grows.'}</p><button className="button" onClick={() => { setSearch(''); setFilter('all'); }}>{search || filter !== 'all' ? 'Show all blocks' : 'View library'}</button></section>}
      <footer className="app-footer"><span><span className="footer-dot" /> One active block at a time · Every block stays yours</span><span>Archived blocks retain all workouts and results</span></footer>
    </main>
    {creating && <CreateBlock preview={preview} onClose={() => setCreating(false)} onSaved={block => {
      setBlocks(current => [{ ...block, workoutCount: 0, completedCount: 0, recordedMiles: 0, firstWorkoutDate: null, lastWorkoutDate: null }, ...current]);
      setCreating(false); setFilter('draft'); setSearch(''); setNotice(`${block.raceName} saved as a draft. Open it to add workouts.`);
    }} />}
  </div>;
}
