'use client';
import { useState } from 'react';
import { ArrowUpRight, CalendarDays, Flag, Layers3, Plus, Search, Settings2 } from 'lucide-react';
import AppHeader from './AppHeader';
import { BlockStatusBadge } from './BlockActions';
import { STATUS_LABELS, blockReady, type BlockSummary } from '../lib/blocks';
import { BLOCK_STATUSES, formatDate, type BlockStatus, type Plan } from '../lib/domain';

export default function BlockLibrary({ initial, displayName, preview = false }: { initial: BlockSummary[]; displayName: string; preview?: boolean }) {
  const [blocks, setBlocks] = useState(initial);
  const [filter, setFilter] = useState<BlockStatus | 'all' | 'ready'>('active');
  const [search, setSearch] = useState('');
  const visible = blocks.filter(block => (filter === 'all' || (filter === 'ready' ? blockReady(block) : filter === 'draft' ? block.status === 'draft' && !blockReady(block) : block.status === filter)) && block.raceName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const counts = (status: BlockStatus | 'ready') => blocks.filter(block => status === 'ready' ? blockReady(block) : status === 'draft' ? block.status === 'draft' && !blockReady(block) : block.status === status).length;
  return <div className="app-shell"><AppHeader displayName={displayName} preview={preview} />
    <main className="main-content blocks-main">
      <section className="page-heading blocks-page-heading"><div><div className="overline">Your training blocks</div><h1>Forrest Runs</h1></div><div className="block-create-options"><a className="button primary" href={preview ? '/preview?view=setup' : '/blocks/new'}><Plus size={17} />Create training block</a></div></section>
      <div className="library-stats" aria-label="Training block totals">
        <div><Layers3 size={19} /><span><strong>{blocks.length}</strong> total blocks</span></div>
        <div><Flag size={19} /><span><strong>{counts('active')}</strong> in progress</span></div>
        <div><span className="library-stat-check">✓</span><span><strong>{counts('completed')}</strong> completed</span></div>
      </div>
      {preview && <p className="preview-notice">Example data only. Preview changes reset when you leave this page.</p>}
      <div className="library-toolbar"><div className="block-filters" role="group" aria-label="Filter training blocks">
        {(['all', 'draft', 'ready', 'active', 'completed', 'archived'] as const).map(status => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status === 'all' ? 'All blocks' : status === 'ready' ? 'Not started' : STATUS_LABELS[status]}<span>{status === 'all' ? blocks.length : counts(status)}</span></button>)}
      </div><label className="block-search"><Search size={16} /><span className="sr-only">Search training blocks</span><input type="search" placeholder="Find a block…" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
      <div className="block-grid">
        {visible.map(block => {
          const percent = block.workoutCount ? Math.round(block.completedCount / block.workoutCount * 100) : 0;
          const href = preview ? block.hasSetup ? '/preview?view=setup' : `/preview?blockId=${encodeURIComponent(block.id)}&name=${encodeURIComponent(block.raceName)}&date=${block.raceDate}&status=${block.status}` : `/blocks/${encodeURIComponent(block.id)}${block.hasSetup && !block.hasGeneratedPlan && block.status === 'draft' ? '/setup' : ''}`;
          return <article className={`block-card ${block.status === 'active' ? 'active-block-card' : ''}`} key={block.id}>
            <div className="block-card-top"><BlockStatusBadge status={block.status} ready={blockReady(block)} /><span className="block-source">{block.isSimulation ? 'SIMULATION · Example schedule' : block.hasGeneratedPlan ? 'OpenAI training plan' : block.sourceName ? 'Imported training log' : block.hasSetup ? 'Guided setup' : 'Manual training block'}</span></div>
            <h2><a href={href}>{block.raceName}</a></h2><p className="block-card-date"><CalendarDays size={14} />Target · {formatDate(block.raceDate, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            <div className="block-card-facts"><div><small>Workouts logged</small><strong>{block.completedCount}<span> / {block.workoutCount}</span></strong></div><div><small>Recorded running</small><strong>{block.recordedMiles.toLocaleString('en-US', { maximumFractionDigits: 1 })}<span> mi</span></strong></div><div><small>Training starts</small><strong className="block-start-date">{block.firstWorkoutDate ? formatDate(block.firstWorkoutDate) : 'Not scheduled'}</strong></div></div>
            <div className="block-progress-label"><span>Workout completion</span><strong>{percent}%</strong></div><div className="block-progress" role="progressbar" aria-label={`${block.raceName} workout completion`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
            <p className="block-card-note">{block.isSimulation ? 'Demonstration schedule saved as a draft. It cannot be activated.' : block.hasGeneratedPlan ? 'Generated schedule saved with its starting intake.' : block.hasSetup ? 'Runner inputs saved with this block. A training schedule has not been generated.' : block.workoutCount === 0 ? 'A fresh page. Add your first workout whenever you’re ready.' : block.status === 'archived' ? 'Workouts and results preserved in your archive.' : block.status === 'completed' ? 'Block completed. Your training history stays with you.' : `${block.workoutCount} scheduled workouts · Your results stay with this block.`}</p>
            <div className="block-card-bottom"><a className={block.status === 'active' ? 'button primary' : 'button'} href={href}>{block.status === 'active' ? 'Continue training' : block.status === 'draft' ? block.hasSetup && !block.hasGeneratedPlan ? 'Resume setup' : 'Open block' : 'View block'}<ArrowUpRight size={15} /></a><span>{block.status === 'active' ? 'Your current block' : `Created ${formatDate(block.createdAt.slice(0, 10))}`}</span></div>
            <div className="block-card-settings"><a className="icon-button" aria-label={`Settings for ${block.raceName}`} href={preview ? '/preview?view=settings' : `/blocks/${encodeURIComponent(block.id)}/settings`}><Settings2 size={17} /></a></div>
          </article>;
        })}
      </div>
      {!visible.length && <section className="block-empty"><Layers3 size={34} /><h2>{search ? 'No matching blocks' : filter === 'active' ? 'No blocks in progress' : `No ${filter === 'all' ? 'training' : filter} blocks yet`}</h2><p>{search ? 'Try another name or clear your search.' : filter === 'active' && blocks.length ? 'Open an existing block or create a new one.' : 'Create a training block to get started.'}</p><button className="button" onClick={() => { setSearch(''); setFilter('all'); }}>{search || filter !== 'all' ? 'Show all blocks' : 'View library'}</button></section>}
      <footer className="app-footer"><span><span className="footer-dot" /> One block in progress at a time · Every block stays yours</span><span>Archived blocks retain all workouts and results</span></footer>
    </main>
  </div>;
}
