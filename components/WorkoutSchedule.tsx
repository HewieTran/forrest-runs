'use client';

import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { formatDate, validDate, type AppData } from '../lib/domain';
import { orderedWorkouts } from '../lib/block-overview';
import { calendarIndex } from '../lib/progress';
import { monthDates, scheduleTarget, shiftMonth, shortWorkoutTitle } from '../lib/workout-schedule';
import { formatWorkoutTitle } from './TodayWorkout';
import './workout-schedule.css';

export default function WorkoutSchedule({ data, date, month, canEdit, disabled, onDate, onMonth, onOpen, onAdd, onOpenWorkout, onAddDate, onSelectDate }: {
  data: AppData; date: string; month: string; canEdit: boolean; disabled: boolean;
  onDate: (date: string) => void; onMonth: (month: string) => void; onOpen: (date: string) => void;
  onAdd: () => void; onOpenWorkout: (id: string) => void; onAddDate: (date: string) => void; onSelectDate: (date: string) => void;
}) {
  const index = calendarIndex({ ...data, workouts: orderedWorkouts(data.workouts) });
  const rows = index.workouts.get(date) ?? [], isRest = index.rest.has(date);
  const previous = shiftMonth(month, -1), next = shiftMonth(month, 1);
  return <>
    <p className="schedule-block-name">{data.plan.raceName}</p>
    <h1>Workout schedule</h1>
    <p className="schedule-range">{formatDate(index.range.start, { month: 'long', day: 'numeric', year: 'numeric' })} – {formatDate(index.range.end, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
    <div className="schedule-toolbar">
      <h2 id="schedule-month" aria-live="polite">{formatDate(month, { month: 'long', year: 'numeric' })}</h2>
      <div className="schedule-month-actions"><button className="icon-button" aria-label="Previous month" disabled={disabled || !previous} onClick={() => onMonth(previous!)}><ChevronLeft size={19} /></button>
        <button className="icon-button" aria-label="Next month" disabled={disabled || !next} onClick={() => onMonth(next!)}><ChevronRight size={19} /></button>
        <button className="button" disabled={disabled} onClick={() => onDate(data.today)}>Today</button></div>
      <label className="schedule-date-picker">Go to date<input type="date" value={date} min="1900-01-01" max="2200-12-31" disabled={disabled} onChange={event => { if (validDate(event.target.value)) onDate(event.target.value); }} /></label>
      <button className="button primary schedule-add" disabled={disabled || !canEdit || isRest} onClick={onAdd}><Plus size={17} /> Add workout</button>
    </div>
    {!canEdit && <p className="block-callout">Finish your starting setup and save a plan before adding or editing workouts.</p>}
    <p className="schedule-interaction-hint"><span className="schedule-pointer-hint">Select a date. Double-click a workout to edit, or blank space to add.</span><span className="schedule-touch-hint">Select a date, then use the workout actions below.</span></p>
    <div className="schedule-calendar" role="group" aria-labelledby="schedule-month">
      <div className="schedule-weekdays" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="schedule-days">{monthDates(month).map(day => {
        const workouts = index.workouts.get(day) ?? [], rest = index.rest.has(day), today = day === data.today;
        const summary = rest ? 'Rest day' : workouts.length ? workouts.map(row => `${formatWorkoutTitle(row.type)}, ${scheduleTarget(row)}, ${row.done ? 'completed' : 'scheduled'}`).join('; ') : 'No workout scheduled';
        const unavailable = disabled || !validDate(day);
        return <div key={day} className={`schedule-day${day.slice(0, 7) !== month.slice(0, 7) ? ' outside-month' : ''}${day === date ? ' selected' : ''}${today ? ' today' : ''}${unavailable ? ' unavailable' : ''}`}
          onClick={() => { if (!unavailable) onSelectDate(day); }} onDoubleClick={() => {
            if (unavailable || !window.matchMedia('(pointer: fine)').matches) return;
            if (rest || !canEdit) onOpen(day); else onAddDate(day);
          }}>
          <button id={day === date ? 'schedule-selected-date' : `schedule-date-${day}`} type="button" className="schedule-day-number"
            aria-label={`${formatDate(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. ${summary}${day === date ? '. Selected date' : ''}`}
            aria-current={today ? 'date' : undefined} aria-pressed={day === date} disabled={unavailable}
            onClick={event => { event.stopPropagation(); onSelectDate(day); }}><span>{Number(day.slice(-2))}</span>{today && <small>Today</small>}</button>
          {rest && <span className="schedule-rest">Rest</span>}
          {workouts.slice(0, 2).map(row => <button type="button" className={`schedule-session${row.done ? ' completed' : ''}`} key={row.id} disabled={unavailable}
            aria-label={`Select ${formatWorkoutTitle(row.type)}, ${scheduleTarget(row)}, ${row.done ? 'completed' : 'scheduled'}, ${day}`}
            onClick={event => { event.stopPropagation(); onSelectDate(day); }}
            onDoubleClick={event => { event.stopPropagation(); if (canEdit && window.matchMedia('(pointer: fine)').matches) onOpenWorkout(row.id); }}>
            <span className="schedule-session-title">{row.done && <Check size={12} aria-hidden="true" />}<span className="schedule-full-title">{formatWorkoutTitle(row.type)}</span><span className="schedule-short-title">{shortWorkoutTitle(row)}</span></span>
            <span className="schedule-session-target">{scheduleTarget(row)}</span></button>)}
          {workouts.length > 2 && <span className="schedule-overflow">+{workouts.length - 2} more</span>}
        </div>;
      })}</div>
    </div>
    <div className="schedule-legend" aria-label="Calendar legend"><span><i className="schedule-key completed"><Check size={12} /></i> Completed</span><span><i className="schedule-key" /> Scheduled</span><span><i className="schedule-key today" /> Today</span><span>Rest = planned recovery</span><span>No label = empty</span></div>
    <section className="schedule-selected-day" aria-labelledby="schedule-selected-title"><div><h2 id="schedule-selected-title">{formatDate(date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</h2>
      <p>{date === data.today ? 'Today · Selected date' : 'Selected date'}</p></div><div className="schedule-selected-list">
        {isRest ? <div className="schedule-selected-row"><div><h3>Rest day</h3><p>A little recovery goes a long way.</p></div><button className="button" onClick={() => onOpen(date)}>View rest day</button></div>
          : rows.length ? rows.map(row => <div className="schedule-selected-row" key={row.id}><div><h3>{formatWorkoutTitle(row.type)}</h3><p>{scheduleTarget(row)} planned · {row.done ? 'Completed' : 'Scheduled'}</p></div><button className="button" disabled={disabled || !canEdit} aria-label={`Edit ${formatWorkoutTitle(row.type)} on ${date}`} onClick={() => onOpenWorkout(row.id)}>{row.done ? 'Edit' : 'Log / edit'}</button></div>)
          : <div className="schedule-selected-row"><div><h3>No workout scheduled</h3><p>This date is empty.</p></div><button className="button" disabled={disabled || !canEdit} onClick={onAdd}>Add workout</button></div>}
      </div></section>
  </>;
}
