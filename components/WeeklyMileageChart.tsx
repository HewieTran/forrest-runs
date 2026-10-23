'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, type Workout } from '../lib/domain';
import { annualMileage } from '../lib/progress';

export default function WeeklyMileageChart({ workouts, years, today }: { workouts: Workout[]; years: number[]; today: string }) {
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(years.includes(currentYear) ? currentYear : years[0]);
  const [selection, setSelection] = useState(() => {
    const initial = annualMileage(workouts, years.includes(currentYear) ? currentYear : years[0]);
    const current = initial.findIndex(week => today >= week.start && today <= week.end);
    return current >= 0 ? current : Math.max(0, initial.findIndex(week => week.scheduled > 0));
  });
  const weeks = useMemo(() => annualMileage(workouts, year), [workouts, year]);
  const chart = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1100);
  useEffect(() => {
    const element = chart.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(280, element.clientWidth)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [year]);
  const selected = weeks[Math.min(selection, weeks.length - 1)];
  const max = Math.max(10, Math.ceil(Math.max(...weeks.map(week => Math.max(week.planned ?? 0, week.recorded ?? 0))) / 10) * 10);
  const left = 34, top = 15, height = 180, step = (width - left - 12) / weeks.length;
  const missingTargets = weeks.reduce((sum, week) => sum + week.missingPlanned, 0);
  const number = (value: number | null) => value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return <section className="overview-panel mileage-panel" aria-labelledby="mileage-heading"><div className="overview-panel-heading"><div><p className="overview-eyebrow">The bigger picture</p><h2 id="mileage-heading">Weekly mileage</h2><p>Planned and recorded running miles throughout the year.</p></div>{years.length > 1 ? <label className="chart-year">Year <select value={year} onChange={event => { setYear(Number(event.target.value)); setSelection(Math.max(0, annualMileage(workouts, Number(event.target.value)).findIndex(week => week.scheduled > 0))); }}>{years.map(value => <option key={value}>{value}</option>)}</select></label> : <span className="chart-year">{year}</span>}</div>
    <div className="mileage-legend"><span><i className="planned-key" />Planned miles</span><span><i className="recorded-key" />Recorded miles</span><small>Monday–Sunday · selected block only</small></div>
    {!weeks.some(week => week.scheduled) ? <div className="mileage-empty">No runs scheduled in {year}.</div> : <div className="overview-mileage-chart" ref={chart}><svg viewBox={`0 0 ${width} 235`} role="img" aria-label={`Weekly running mileage in ${year}. Choose a week below for exact values.`} onPointerMove={event => { const bounds = event.currentTarget.getBoundingClientRect(); const x = (event.clientX - bounds.left) / bounds.width * width; setSelection(Math.max(0, Math.min(weeks.length - 1, Math.floor((x - left) / step)))); }}>
      {[0, .25, .5, .75, 1].map(fraction => <g key={fraction}><line x1={left} x2={width} y1={top + height * (1-fraction)} y2={top + height * (1-fraction)} className="chart-grid" /><text x={left-10} y={top + height * (1-fraction)+4} textAnchor="end">{Number((max*fraction).toFixed(1))}</text></g>)}
      {weeks.map((week, i) => <g key={week.start}><rect x={left+i*step+1} y={top} width={step-2} height={height} className={i === selection ? 'chart-selection' : 'chart-hit'} />{week.planned !== null && <rect x={left+i*step+step*.15} y={top+height-(week.planned/max*height)} width={step*.7} height={week.planned/max*height} className="planned-bar" />}{week.recorded !== null && <rect x={left+i*step+step*.32} y={top+height-(week.recorded/max*height)} width={step*.36} height={week.recorded/max*height} className="recorded-bar" />}{(i === 0 || week.start.slice(5,7) !== weeks[i-1].start.slice(5,7)) && (width >= 600 || Number(week.start.slice(5,7)) % 2 === 1) && <text x={left+i*step} y={222}>{formatDate(week.start, { month: 'short' })}</text>}</g>)}
    </svg></div>}
    <div className="mileage-details"><label>Week details <select value={Math.min(selection, weeks.length-1)} onChange={event => setSelection(Number(event.target.value))}>{weeks.map((week, i) => <option value={i} key={week.start}>{formatDate(week.start)} – {formatDate(week.end)}</option>)}</select></label><div><span>Planned</span><strong>{number(selected.planned)} <small>mi</small></strong>{selected.missingPlanned > 0 && <small>{selected.missingPlanned} run target{selected.missingPlanned === 1 ? '' : 's'} missing</small>}</div><div><span>Recorded</span><strong>{number(selected.recorded)} <small>mi</small></strong><small>{selected.completed} / {selected.scheduled} runs completed{selected.missingRecorded ? ` · ${selected.missingRecorded} missing distance` : ''}</small></div></div>
    <p className="calendar-note">{missingTargets ? `${missingTargets} run${missingTargets === 1 ? ' has' : 's have'} no planned distance. Bars show known miles only; missing values stay unknown.` : 'Bars show saved planned distances and recorded distances from completed runs.'} Weeks crossing New Year include only dates in {year}.</p>
  </section>;
}
