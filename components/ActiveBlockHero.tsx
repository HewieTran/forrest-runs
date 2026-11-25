import { ArrowUpRight, Settings2 } from 'lucide-react';
import type { BlockSummary } from '../lib/blocks';
import { formatDate } from '../lib/domain';
import type { LibraryHero } from '../lib/library-hero';
import LibraryJourney from './LibraryJourney';
const miles = (n: number | null) => n === null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 1 });
export default function ActiveBlockHero({ block, data, href, preview }: { block: BlockSummary; data?: LibraryHero | null; href: string; preview: boolean }) {
  return <article className="block-card active-block-card library-active-hero">
    <div className="block-card-top"><span className="block-status block-status-active">In progress</span><span className="block-source">{block.hasGeneratedPlan ? 'OpenAI training plan' : block.sourceName ? 'Imported training log' : 'Manual training block'}</span></div>
    <div className="library-hero-heading"><div><h2><a href={href}>{block.raceName}</a></h2><p className="block-card-date">Race day · {formatDate(block.raceDate, { month: 'short', day: 'numeric', year: 'numeric' })}</p></div>
      <div className="library-hero-headline">{data?.route ? <><strong>Week {data.route.week}<small> of {data.route.totalWeeks}</small></strong><p>{data.route.state === 'Current training week' ? data.phase ?? 'Phase not specified' : data.route.state}{data.daysToRace !== null && <> · {data.daysToRace < 0 ? `${-data.daysToRace} days since race` : data.daysToRace === 0 ? 'Race day' : `${data.daysToRace} days to race`}</>}</p></> : <p>Your current training block</p>}</div>
    </div>
    {data ? <LibraryJourney data={data} /> : <p className="library-journey-fallback">Journey dates not available.</p>}
    <div className="library-hero-metrics"><div><small>Workouts logged</small><strong>{block.completedCount}<span> / {block.workoutCount}</span></strong></div><div><small>Recorded running</small><strong>{miles(block.recordedMiles)}<span> mi</span></strong></div><div><small>This week{data && <> · {formatDate(data.weekStart)}–{formatDate(data.weekEnd)}</>}</small><strong>{miles(data?.weekly.recorded ?? null)}<span> / {miles(data?.weekly.planned ?? null)} mi planned</span></strong>{data && data.weekly.completed === 0 && <p>No runs logged this week</p>}{data && data.weekly.missingPlanned > 0 && <p>{data.weekly.missingPlanned} run target(s) missing</p>}{data && data.weekly.missingRecorded > 0 && <p>{data.weekly.missingRecorded} recorded distance(s) missing</p>}</div></div>
    <div className="library-hero-bottom"><p>{data?.next ? <>Next up · {formatDate(data.next.date)} · {data.next.type}{data.next.distance !== null ? ` · ${miles(data.next.distance)} mi` : data.next.duration !== null ? ` · ${Math.round(data.next.duration / 60)} min` : ''}</> : 'No upcoming workout scheduled'}</p><div><a className="button primary" href={href}>Continue training <ArrowUpRight size={15} /></a><a className="icon-button" aria-label={`Settings for ${block.raceName}`} href={preview ? '/preview?view=settings' : `/blocks/${encodeURIComponent(block.id)}/settings`}><Settings2 size={17} /></a></div></div>
  </article>;
}
