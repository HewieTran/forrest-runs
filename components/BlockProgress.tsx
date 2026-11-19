import { distanceMilestones, formatDate, phaseMilestones, type AppData } from '../lib/domain';
import { journey, overviewStats } from '../lib/block-overview';
import WeeklyMileageChart from './WeeklyMileageChart';
import '../app/progress.css';
import './block-overview.css';

const number = (value: number | null) => value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 1 });
export default function BlockProgress({ data }: { data: AppData }) {
  const { start, end, weekly, blockMiles, completed, longest } = overviewStats(data);
  const route = journey(data);
  const milestones = distanceMilestones(data.workouts);
  const phases = phaseMilestones(data.workouts, data.today).filter(phase => phase.total);
  return <div id="progress" className="block-overview-progress">
    <section className="overview-weekly" aria-labelledby="overview-weekly-title"><div><p className="overview-eyebrow">This week · {formatDate(start)} – {formatDate(end)}</p><h2 id="overview-weekly-title">Weekly running mileage</h2></div><p><strong>{number(weekly.recorded)} <small>mi recorded</small></strong><span>{number(weekly.planned)} mi planned</span></p>
      {weekly.planned !== null && weekly.planned > 0 && weekly.recorded !== null && <progress aria-label="Weekly mileage against plan" max={weekly.planned} value={Math.min(weekly.planned, weekly.recorded)} />}
      {(weekly.missingPlanned > 0 || weekly.missingRecorded > 0) && <small className="overview-mileage-note">{weekly.missingPlanned > 0 && `${weekly.missingPlanned} run target(s) missing. `}{weekly.missingRecorded > 0 && `${weekly.missingRecorded} completed run(s) missing distance.`}</small>}
    </section>
    <dl className="overview-block-metrics"><div><dt>Workout completion</dt><dd>{completed} <small>/ {data.workouts.length}</small></dd><span>Entire block · includes future workouts</span></div><div><dt>Recorded running mileage</dt><dd>{number(blockMiles.recorded)} <small>mi</small></dd><span>{blockMiles.missingRecorded ? `${blockMiles.missingRecorded} completed run(s) missing distance` : 'Completed runs with recorded distance'}</span></div><div><dt>Longest recorded run</dt><dd>{number(longest)} <small>mi</small></dd><span>One run, one milestone</span></div></dl>
    <section className="journey-panel" aria-labelledby="journey-title"><div className="journey-heading"><h2 id="journey-title">Your training journey</h2><span>{route ? `${route.state} · Week ${route.week} of ${route.totalWeeks}` : 'Set training and race dates to see your journey'}</span></div>{route && <><div className="journey-track" role="progressbar" aria-label="Time through training block" aria-valuenow={Math.round(route.percent)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${route.percent}%` }} />{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/journey-runner.webp" alt="" width={54} height={54} style={{ left: `${route.percent}%` }} /></div><div className="journey-labels"><span>Start · {formatDate(route.start, { month: 'short', day: 'numeric', year: 'numeric' })}</span><span>Race · {formatDate(route.end, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div></>}</section>
    <WeeklyMileageChart workouts={data.workouts} today={data.today} blockData={data} />
    <section className="overview-guide" aria-labelledby="guide-title"><h2 id="guide-title">Milestones, phases &amp; pace guide</h2><div className="overview-guide-grid"><div><h3>Distance milestones</h3>{milestones.map(milestone => <p key={milestone.distance} className={milestone.workout ? 'milestone-achieved' : ''}><strong>{milestone.distance} mi</strong><span>{milestone.workout ? `Reached ${formatDate(milestone.workout.date)}` : 'Ahead'}</span></p>)}<small>Based on completed, recorded runs.</small></div><div><h3>Training phases</h3>{phases.length ? phases.map(phase => <p key={phase.phase}><strong>{phase.phase}</strong><span>{phase.done} / {phase.total} completed · {phase.state === 'current' ? 'Current phase' : phase.state === 'complete' ? 'Complete' : phase.state === 'past' ? 'Past dates' : 'Upcoming'}</span></p>) : <p>Your phases appear when workouts are scheduled.</p>}</div><div><h3>Pace guide</h3>{data.plan.paceGuide.length ? data.plan.paceGuide.map(guide => <p key={guide.type}><strong>{guide.type} · {guide.target}</strong><span>{guide.rule}</span></p>) : <p>No pace guide saved for this block.</p>}</div></div></section>
  </div>;
}
