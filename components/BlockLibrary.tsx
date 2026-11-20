'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, Flag, Layers3, Plus, Search, Settings2 } from 'lucide-react';
import AppHeader from './AppHeader';
import { BlockStatusBadge } from './BlockActions';
import BlockStartDate from './BlockStartDate';
import EmptyAccountGuidance from './EmptyAccountGuidance';
import StartBlockButton from './StartBlockButton';
import { STATUS_LABELS, blockReady, type BlockSummary } from '../lib/blocks';
import { centralToday, formatDate } from '../lib/domain';
import { GUIDANCE_PREFIX, LIBRARY_FILTERS, landingFilter, libraryFilter, type LibraryFilter } from '../lib/onboarding';
import './onboarding.css';

export default function BlockLibrary({ initial, displayName, preview = false, initialFilter = landingFilter(initial), initialSearch = '', guidanceKey, today = centralToday() }: {
  initial: BlockSummary[]; displayName: string; preview?: boolean; initialFilter?: LibraryFilter;
  initialSearch?: string; guidanceKey?: string; today?: string;
}) {
  const [blocks] = useState(initial);
  const [filter, setFilter] = useState(initialFilter), [search, setSearch] = useState(initialSearch);
  const selectedFilter = useRef<HTMLButtonElement>(null);
  const activeBlock = blocks.find(block => block.status === 'active') ?? null;
  const emptyAccount = blocks.length === 0;
  const historyOnly = !emptyAccount && blocks.every(block => block.status === 'completed' || block.status === 'archived');
  const createHref = preview ? '/preview?view=setup' : '/blocks/new';
  useEffect(() => {
    function restore() {
      const url = new URL(window.location.href);
      setFilter(libraryFilter(url.searchParams.get('status')) ?? initialFilter);
      setSearch(url.searchParams.get('q') ?? '');
    }
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [initialFilter]);
  useEffect(() => { selectedFilter.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [filter]);
  function select(nextFilter: LibraryFilter, nextSearch = search, push = true) {
    setFilter(nextFilter); setSearch(nextSearch);
    const url = new URL(window.location.href);
    url.searchParams.set('status', nextFilter);
    if (nextSearch) url.searchParams.set('q', nextSearch); else url.searchParams.delete('q');
    window.history[push ? 'pushState' : 'replaceState'](window.history.state, '', url.pathname + url.search + url.hash);
  }
  const visible = blocks.filter(block => (filter === 'all' || (filter === 'ready' ? blockReady(block) : filter === 'draft' ? block.status === 'draft' && !blockReady(block) : block.status === filter)) && block.raceName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const counts = (status: LibraryFilter) => blocks.filter(block => status === 'all' || (status === 'ready' ? blockReady(block) : status === 'draft' ? block.status === 'draft' && !blockReady(block) : block.status === status)).length;
  const label = (status: LibraryFilter) => status === 'all' ? 'All blocks' : status === 'ready' ? 'Not started' : STATUS_LABELS[status];
  return <div className="app-shell"><AppHeader displayName={displayName} preview={preview} />
    <main className="main-content blocks-main onboarding-library">
      <section className="page-heading blocks-page-heading"><div><div className="overline">Your training blocks</div><h1 className="brand-wordmark">Forrest Runs</h1></div>
        <div className="block-create-options"><a id="create-training-block" className="button primary" href={createHref}><Plus size={17} />Create training block</a>
          {emptyAccount && (guidanceKey || preview) && <EmptyAccountGuidance sessionKey={guidanceKey ?? GUIDANCE_PREFIX + 'preview-empty'} />}
        </div>
      </section>
      <div className="library-stats" aria-label="Training block totals">
        <div><Layers3 size={19} /><span><strong>{blocks.length}</strong> total blocks</span></div>
        <div><Flag size={19} /><span><strong>{counts('active')}</strong> in progress</span></div>
        <div><span className="library-stat-check">✓</span><span><strong>{counts('completed')}</strong> completed</span></div>
      </div>
      {preview && <p className="preview-notice">Example data only. Preview changes reset when you leave this page.</p>}
      <div className="library-toolbar"><div className="block-filters" role="group" aria-label="Filter training blocks">
        {LIBRARY_FILTERS.map(status => <button type="button" key={status} ref={filter === status ? selectedFilter : undefined} aria-pressed={filter === status} onClick={() => select(status)}>{label(status)}<span>{counts(status)}</span></button>)}
      </div><label className="block-search"><Search size={16} /><span className="sr-only">Search training blocks</span><input type="search" placeholder="Find a block…" value={search} onChange={event => select(filter, event.target.value, false)} /></label></div>
      {!activeBlock && filter === 'draft' && counts('draft') > 0 && <p className="library-guidance">Pick a draft to continue setting up your training block.</p>}
      {!activeBlock && filter === 'ready' && counts('ready') > 0 && <p className="library-guidance"><strong>Your schedule is ready to review.</strong> Open a block to review its plan. Choose Start this block when you’re ready to make it your current plan.</p>}
      {historyOnly && <p className="library-guidance">Ready for your next goal? <a href={createHref}>Create a new training block.</a></p>}
      <div className="block-grid">
        {visible.map(block => {
          const ready = blockReady(block), canStart = ready && !block.isSimulation;
          const percent = block.workoutCount ? Math.round(block.completedCount / block.workoutCount * 100) : 0;
          const href = preview ? `/preview?blockId=${encodeURIComponent(block.id)}&name=${encodeURIComponent(block.raceName)}&date=${block.raceDate}&status=${block.status}` : `/blocks/${encodeURIComponent(block.id)}`;
          const setupHref = preview ? '/preview?view=setup' : `/blocks/${encodeURIComponent(block.id)}/setup`;
          return <article className={`block-card ${block.status === 'active' ? 'active-block-card' : ''}`} key={block.id}>
            <div className="block-card-top"><BlockStatusBadge status={block.status} ready={ready} /><span className="block-source">{block.isSimulation ? 'SIMULATION · Example schedule' : block.hasGeneratedPlan ? 'OpenAI training plan' : block.sourceName ? 'Imported training log' : block.hasSetup ? 'Guided setup' : 'Manual training block'}</span></div>
            <h2><a href={href}>{block.raceName}</a></h2><p className="block-card-date"><CalendarDays size={14} />Target · {formatDate(block.raceDate, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            {ready && <BlockStartDate date={block.firstWorkoutDate} today={today} />}
            <div className={`block-card-facts${ready ? ' ready-card-facts' : ''}`}><div><small>Workouts logged</small><strong>{block.completedCount}<span> / {block.workoutCount}</span></strong></div><div><small>Recorded running</small><strong>{block.recordedMiles.toLocaleString('en-US', { maximumFractionDigits: 1 })}<span> mi</span></strong></div>{!ready && <div><small>Training starts</small><strong className="block-start-date">{block.firstWorkoutDate ? formatDate(block.firstWorkoutDate) : 'Not scheduled'}</strong></div>}</div>
            <div className="block-progress-label"><span>Workout completion</span><strong>{percent}%</strong></div><div className="block-progress" role="progressbar" aria-label={`${block.raceName} workout completion`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
            <p className="block-card-note">{block.isSimulation ? 'Demonstration schedule saved as a draft. It cannot be activated.' : block.hasGeneratedPlan ? 'Generated schedule saved with its starting intake.' : block.hasSetup ? 'Runner inputs saved with this block. A training schedule has not been generated.' : block.workoutCount === 0 ? 'A fresh page. Add your first workout whenever you’re ready.' : block.status === 'archived' ? 'Workouts and results preserved in your archive.' : block.status === 'completed' ? 'Block completed. Your training history stays with you.' : `${block.workoutCount} scheduled workouts · Your results stay with this block.`}</p>
            <div className="block-card-bottom">
              {canStart && <StartBlockButton plan={block} activeBlock={activeBlock} preview={preview} onStarted={started => window.location.assign(`/blocks/${encodeURIComponent(started.id)}`)} />}
              <a className={block.status === 'active' ? 'button primary' : 'button'} href={!ready && block.status === 'draft' && block.hasSetup ? setupHref : href}>{block.status === 'active' ? 'Continue training' : !ready && block.status === 'draft' && block.hasSetup ? 'Continue setup' : block.status === 'draft' ? 'Open block' : 'View block'}<ArrowUpRight size={15} /></a>
              {!canStart && <span>{block.status === 'active' ? 'Your current block' : `Created ${formatDate(block.createdAt.slice(0, 10))}`}</span>}
            </div>
            <div className="block-card-settings"><a className="icon-button" aria-label={`Settings for ${block.raceName}`} href={preview ? '/preview?view=settings' : `/blocks/${encodeURIComponent(block.id)}/settings`}><Settings2 size={17} /></a></div>
          </article>;
        })}
      </div>
      {!visible.length && <section className="block-empty"><Layers3 size={34} /><h2>{emptyAccount ? 'No training blocks yet' : search ? 'No matching blocks' : filter === 'active' ? 'No blocks in progress' : filter === 'ready' ? 'No blocks waiting to start' : `No ${label(filter).toLocaleLowerCase()} blocks`}</h2>
        <p>{emptyAccount ? 'Build a plan around your next goal.' : search ? 'Try another name or clear your search.' : 'Choose another tab or create a new training block.'}</p>
        <div className="empty-state-actions"><a className="button" href={createHref}><Plus size={17} />Create training block</a>{!emptyAccount && (search || filter !== 'all') && <button className="button" type="button" onClick={() => select('all', '')}>Show all blocks</button>}</div>
      </section>}
      <footer className="app-footer"><span><span className="footer-dot" /> One block in progress at a time · Every block stays yours</span><span>Archived blocks retain all workouts and results</span></footer>
    </main>
  </div>;
}
