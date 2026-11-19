'use client';

import { ChevronLeft, ChevronRight, CalendarDays, Pencil, Sparkles } from 'lucide-react';
import { formatDate, isRun, type AppData, type Workout } from '../lib/domain';
import { adjacentWorkouts, PERIOD_LABELS, periodArtwork, type WorkoutPeriod } from '../lib/block-overview';
import { formatPace } from '../lib/workout-form';
import { readableDuration, workoutStructure } from '../lib/workout-structure';
import './today-workout.css';

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const formatWorkoutTitle = (type: string) => type === 'Race' ? 'Race day' : type.replace(' Run', ' run');

export default function TodayWorkout({ data, featured, savedRunId, saving, period, onOpenWorkout, onSelectWorkout }: {
  data: AppData; featured: Workout | null; savedRunId: string | null; saving: boolean; period: WorkoutPeriod;
  onOpenWorkout: (id: string) => void; onSelectWorkout: (id: string | null) => void;
}) {
  const date = featured?.date ?? data.today;
  const isToday = date === data.today;
  const restDay = !featured && data.restDays.some(day => day.date === date);
  const others = data.workouts.filter(row => row.date === date && row.id !== featured?.id);
  const { previous, next } = adjacentWorkouts(data.workouts, data.today, featured);
  const instructions = featured && (workoutStructure(featured)?.title || featured.plannedWorkout.trim().split('\n')[0]);
  const duration = featured?.plannedDurationSeconds;
  const targets = featured ? [
    { label: 'Distance', value: featured.plannedDistance === null ? '' : number.format(featured.plannedDistance), unit: 'mi' },
    { label: 'Target pace', value: featured.plannedPaceSecondsPerMile === null ? featured.targetPace : formatPace(featured.plannedPaceSecondsPerMile, 'mi'), unit: featured.plannedPaceSecondsPerMile === null ? '' : '/mi' },
    { label: 'Target time', value: duration == null ? '' : duration % 60 === 0 ? number.format(duration / 60) : readableDuration(duration), unit: duration != null && duration % 60 === 0 ? 'min' : '' },
  ].filter(target => target.value) : [];
  const results = featured ? [featured.actualDistance === null ? '' : `${number.format(featured.actualDistance)} mi`,
    featured.actualDurationSeconds === null ? '' : readableDuration(featured.actualDurationSeconds),
    featured.timeOfDay ? PERIOD_LABELS[featured.timeOfDay] : ''].filter(Boolean).join(' · ') : '';
  return <section className="today-workout" aria-labelledby="today-workout-title">
    <button type="button" className="workout-browse workout-browse-previous" aria-label="Previous workout" disabled={saving || !previous} onClick={() => onSelectWorkout(previous!.id)}><ChevronLeft size={24} /></button>
    <div className="today-workout-copy">
      <div className="today-workout-topline"><p className="today-workout-date">{isToday ? 'Today' : 'Workout'} · {formatDate(date, { weekday: 'short', month: 'short', day: 'numeric', year: isToday ? undefined : 'numeric' })}</p>
        <button type="button" className="today-reset" disabled={saving} onClick={() => onSelectWorkout(null)}>Today</button></div>
      <h2 id="today-workout-title" tabIndex={-1} aria-live="polite">{featured ? formatWorkoutTitle(featured.type) : restDay ? 'Rest day' : 'No workout scheduled'}</h2>
      {instructions && <p className="today-workout-instructions">{instructions}</p>}
      {!featured && <p className="today-workout-instructions">{restDay ? 'A little recovery goes a long way.' : 'Your next workout is just an arrow away.'}</p>}
      {targets.length > 0 && <dl className="today-workout-targets">{targets.map(target => <div key={target.label}><dt>{target.label}</dt><dd>{target.value}{target.unit && <> <small>{target.unit}</small></>}</dd></div>)}</dl>}
      {featured?.done && <div className="today-workout-celebration"><Sparkles size={22} className={savedRunId === featured.id ? 'today-workout-spark' : undefined} aria-hidden="true" /><div><strong>{savedRunId === featured.id && isRun(featured) ? 'Good miles today.' : 'Workout completed'}</strong>{results && <p>{results}</p>}</div></div>}
      <div className="today-workout-actions">{featured && <button id="featured-workout-action" type="button" className={featured.done ? 'today-workout-link' : 'today-workout-log'} disabled={saving} aria-label={`${featured.done ? 'Edit' : 'Log'} ${formatWorkoutTitle(featured.type)} workout`} onClick={() => onOpenWorkout(featured.id)}>{featured.done ? 'Edit logged workout' : 'Log workout'}{featured.done && <Pencil size={16} aria-hidden="true" />}</button>}
        <button type="button" className="today-workout-schedule" disabled title="The schedule view is coming in the next update">View schedule <CalendarDays size={16} aria-hidden="true" /><span className="sr-only"> · Coming soon</span></button></div>
      {others.length > 0 && <ul className="today-workout-others" aria-label={`Other workouts ${isToday ? 'today' : 'on this date'}`}>{others.map(row => <li key={row.id}><span>{isToday ? 'Also today' : 'Same day'} · {formatWorkoutTitle(row.type)}</span><button type="button" className="today-workout-link" aria-label={`${row.done ? 'Edit' : 'Log'} ${formatWorkoutTitle(row.type)} workout`} disabled={saving} onClick={() => onOpenWorkout(row.id)}>{row.done ? 'Edit' : 'Log'}<span className="sr-only"> {formatWorkoutTitle(row.type)} workout</span></button></li>)}</ul>}
    </div>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="today-workout-art" src={periodArtwork(period)} alt="" width={1040} height={693} />
    <button type="button" className="workout-browse workout-browse-next" aria-label="Next workout" disabled={saving || !next} onClick={() => onSelectWorkout(next!.id)}><ChevronRight size={24} /></button>
  </section>;
}
