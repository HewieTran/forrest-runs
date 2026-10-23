'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { addDays, dateDiff, formatDate, validDate, weekStart, type AppData, type Workout } from '../lib/domain';
import { calendarIndex, calendarYears, DAY_LABELS, dayState, targetResult, type DayState } from '../lib/progress';

const COLUMN = 23;
const LEGEND: DayState[] = ['missed', 'rest', 'below', 'met', 'above', 'unknown', 'partial', 'upcoming', 'empty'];
function measurement(workout: Workout) {
  if (!workout.targetMetric) {
    const recorded = [workout.actualDistance === null ? null : `${workout.actualDistance} mi`, workout.actualDurationSeconds === null ? null : `${Number((workout.actualDurationSeconds / 60).toFixed(1))} min`].filter(Boolean);
    return `Target not recorded · Recorded: ${recorded.length ? recorded.join(' / ') : 'not recorded'}`;
  }
  const duration = workout.targetMetric === 'duration';
  const planned = duration ? workout.plannedDurationSeconds : workout.plannedDistance;
  const actual = duration ? workout.actualDurationSeconds : workout.actualDistance;
  const value = (n: number) => duration ? `${Number((n / 60).toFixed(1))} min` : `${Number(n.toFixed(2))} mi`;
  return `Planned: ${planned === null ? 'unknown' : value(planned)} · Recorded: ${actual === null ? 'not recorded' : value(actual)}`;
}

export default function ProgressCalendar({ data }: { data: AppData }) {
  const index = useMemo(() => calendarIndex(data), [data]);
  const years = calendarYears(index.range), first = weekStart(`${years[0]}-01-01`);
  const last = `${years.at(-1)}-12-31`, columns = Math.floor(dateDiff(last, first) / 7) + 1;
  const anchor = data.today < index.range.start ? index.range.start : data.today > index.range.end ? index.range.end : data.today;
  const [selected, setSelected] = useState(anchor);
  const [viewport, setViewport] = useState({ left: 0, width: 1000 });
  const scroll = useRef<HTMLDivElement>(null);
  function showDate(date: string, smooth = true) {
    const x = Math.floor(dateDiff(date, first) / 7) * COLUMN;
    scroll.current?.scrollTo({ left: Math.max(0, x - (scroll.current.clientWidth / 2)), behavior: smooth ? 'smooth' : 'instant' });
  }
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewport({ left: el.scrollLeft, width: el.clientWidth }));
    observer.observe(el);
    const x = Math.floor(dateDiff(anchor, first) / 7) * COLUMN;
    el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
    setViewport({ left: el.scrollLeft, width: el.clientWidth });
    return () => observer.disconnect();
  }, [anchor, first]);
  const startColumn = Math.max(0, Math.floor(viewport.left / COLUMN) - 3);
  const endColumn = Math.min(columns, Math.ceil((viewport.left + viewport.width) / COLUMN) + 3);
  const markers = years.flatMap(year => Array.from({ length: 12 }, (_, month) => {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    return { date, x: Math.floor(dateDiff(date, first) / 7) * COLUMN, label: formatDate(date, { month: 'short' }), year };
  })).filter(marker => marker.x >= startColumn * COLUMN - 100 && marker.x <= endColumn * COLUMN);
  const state = dayState(selected, data.today, index), rows = index.workouts.get(selected) ?? [];
  return <section className="overview-panel workout-calendar" aria-labelledby="calendar-heading">
    <div className="overview-panel-heading"><div><p className="overview-eyebrow">Every day adds up</p><h2 id="calendar-heading">Workout calendar</h2><p>One continuous timeline, across every year in this block.</p></div><div className="calendar-controls"><button className="icon-button" aria-label="Scroll calendar earlier" onClick={() => scroll.current?.scrollBy({ left: -viewport.width * .8, behavior: 'smooth' })}><ChevronLeft size={18} /></button><button className="button" onClick={() => { setSelected(data.today); showDate(data.today); }}>Today</button><button className="icon-button" aria-label="Scroll calendar later" onClick={() => scroll.current?.scrollBy({ left: viewport.width * .8, behavior: 'smooth' })}><ChevronRight size={18} /></button></div></div>
    <div className="calendar-frame"><div className="calendar-weekdays" aria-hidden="true">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="calendar-scroll" ref={scroll} onScroll={event => setViewport({ left: event.currentTarget.scrollLeft, width: event.currentTarget.clientWidth })} tabIndex={0} aria-label="Workout timeline. Scroll horizontally to explore all years.">
        <div className="calendar-timeline" style={{ width: columns * COLUMN }}>
          {years.map(year => { const x = Math.floor(dateDiff(`${year}-01-01`, first) / 7) * COLUMN; return <div className="calendar-year" key={year} style={{ left: x, width: Math.min(53 * COLUMN, columns * COLUMN - x) }}><span>{year}</span></div>; })}
          {markers.map(marker => <span className="calendar-month" key={marker.date} style={{ left: marker.x }}>{marker.label}</span>)}
          {Array.from({ length: endColumn - startColumn }, (_, offset) => { const column = offset + startColumn; return <div className="calendar-week" key={column} style={{ left: column * COLUMN }}>{Array.from({ length: 7 }, (_, day) => {
            const date = addDays(first, column * 7 + day);
            if (date > last || date < `${years[0]}-01-01`) return <span key={date} className="calendar-blank" />;
            const status = dayState(date, data.today, index), label = `${formatDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}: ${DAY_LABELS[status]}${date === data.today ? ', today' : ''}`;
            return <button key={date} className={`calendar-day day-${status} ${date === data.today ? 'is-today' : ''} ${date === selected ? 'is-selected' : ''}`} title={label} aria-label={label} aria-pressed={date === selected} onClick={() => setSelected(date)} />;
          })}</div>; })}
        </div>
      </div>
    </div>
    <div className="calendar-navigation"><span>Scroll across to explore <span aria-hidden="true">↔</span></span><form onSubmit={event => { event.preventDefault(); const date = new FormData(event.currentTarget).get('date'); if (validDate(date) && date >= `${years[0]}-01-01` && date <= last) { setSelected(date); showDate(date); } }}><label>Jump to date <input key={selected} name="date" type="date" required defaultValue={selected} min={`${years[0]}-01-01`} max={last} /></label><button className="button" type="submit">Go</button></form></div>
    <div className="calendar-legend">{LEGEND.map(status => <span key={status}><i className={`day-${status}`} />{DAY_LABELS[status]}</span>)}</div>
    <p className="calendar-note">Target compares the planned distance or duration. Blue means extra volume, which is not always better. Empty dates are unscheduled, not assumed rest days.</p>
    <div className="calendar-detail" aria-live="polite"><div className="calendar-detail-heading"><CalendarDays size={19} /><h3>{formatDate(selected, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3><span className={`day-status status-${state}`}>{DAY_LABELS[state]}</span></div>
      {rows.length ? <ul className="calendar-workouts">{rows.map(row => <li key={row.id}><div><strong>{row.type}</strong><p>{row.plannedWorkout}</p></div><div><span>{row.done ? DAY_LABELS[targetResult(row)] : selected < data.today ? 'Not completed' : 'Scheduled'}</span><small>{measurement(row)}</small></div></li>)}</ul> : <p>{state === 'rest' ? 'Recovery is part of the plan. No workout is scheduled.' : state === 'outside' ? 'This date is outside the selected training block.' : 'No workout or rest day is scheduled for this date.'}</p>}
    </div>
  </section>;
}
