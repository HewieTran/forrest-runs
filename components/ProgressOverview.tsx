'use client';

import { ArrowLeft, ArrowUpRight, Footprints, Mountain, Activity } from 'lucide-react';
import AppHeader from './AppHeader';
import ProgressCalendar from './ProgressCalendar';
import WeeklyMileageChart from './WeeklyMileageChart';
import { addDays, formatDate, summarize, type AppData } from '../lib/domain';
import { blockRange, calendarYears, completionGroups } from '../lib/progress';
import '../app/progress.css';

export default function ProgressOverview({ data, preview = false }: { data: AppData; preview?: boolean }) {
  const groups = completionGroups(data.workouts, data.today), summary = summarize(data.workouts, data.today), range = blockRange(data);
  const tracker = preview ? '/preview' : `/blocks/${encodeURIComponent(data.plan.id)}`;
  return <><AppHeader displayName={data.displayName} preview={preview} />
    <main className="main-content progress-overview" aria-label="Progress overview">
      <a href={tracker} className="progress-back"><ArrowLeft size={16} /> Back to training</a>
      <div className="overview-heading"><div><p className="overview-eyebrow">{data.plan.raceName} <span>· {data.plan.status}</span></p><h1>Progress overview<span>.</span></h1><p>Your training, one day at a time.</p></div><a className="button" href={tracker}>Open training log <ArrowUpRight size={16} /></a></div>
      <div className="overview-scope"><span className="overview-scope-dot" /> Selected block only <span>·</span> {formatDate(range.start, { month: 'short', day: 'numeric', year: 'numeric' })} – {formatDate(range.end, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      {!data.workouts.length && <p className="overview-empty">No workouts scheduled yet. Open the training log to start building this block.</p>}
      <section aria-labelledby="completion-heading"><div className="overview-section-heading"><h2 id="completion-heading">Workouts completed</h2><p>Scheduled through {formatDate(addDays(data.today, -1))} · today and future workouts excluded</p></div>
        <div className="completion-cards">{groups.map((group, i) => <article className={`completion-card ${i === 0 ? 'completion-total' : ''}`} key={group.label}>
          <div className="completion-label"><h3>{group.label}</h3>{i === 0 ? <Activity size={19} /> : i === 1 ? <Footprints size={19} /> : <Mountain size={19} />}</div>
          <div className="completion-value"><strong>{group.completed}</strong><span>/ {group.scheduled} scheduled</span><b>{group.percent === null ? '—' : `${group.percent}%`}</b></div>
          <div className="completion-track" role="img" aria-label={group.percent === null ? 'No workouts due yet' : `${group.percent}% completed`}><span style={{ width: `${group.percent ?? 0}%` }} /></div>
          <p>{group.scheduled ? 'Of workouts due through yesterday' : 'No workouts due yet'}</p>
        </article>)}</div>
      </section>
      <section className="distance-strip" aria-label="Recorded running totals"><div><span>Recorded mileage</span><strong>{summary.runs > summary.missingDistance ? summary.miles.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}<small> mi</small></strong></div><div><span>Longest recorded run</span><strong>{summary.longest === null ? '—' : summary.longest.toLocaleString('en-US', { maximumFractionDigits: 2 })}<small>{summary.longest === null ? '' : ' mi'}</small></strong></div><p>From completed runs in this block.{summary.missingDistance > 0 && ` ${summary.missingDistance} completed ${summary.missingDistance === 1 ? 'run has' : 'runs have'} no recorded distance.`}</p></section>
      <WeeklyMileageChart workouts={data.workouts} years={calendarYears(range)} today={data.today} />
      <ProgressCalendar data={data} />
      <p className="overview-footnote">Calculated from saved workouts. Training dates use Central time. Rest days are shown only when explicitly scheduled.</p>
    </main></>;
}
