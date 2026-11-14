import { ArrowRight, Pencil, Sparkles } from 'lucide-react';
import { addDays, formatDate, isRun, weekStart, type AppData, type Workout } from '../lib/domain';
import { runningMileage } from '../lib/progress';
import { formatPace } from '../lib/workout-form';
import { readableDuration, workoutStructure } from '../lib/workout-structure';
import './today-workout.css';

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const weeklyNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export const formatWorkoutTitle = (workoutType: string) =>
  workoutType === 'Race' ? 'Race day' : workoutType.replace(' Run', ' run');

export default function TodayWorkout({ data, savedRunId, saving, progressHref, onOpenWorkout, onProgress }: {
  data: AppData;
  savedRunId: string | null;
  saving: boolean;
  progressHref: string;
  onOpenWorkout: (id: string) => void;
  onProgress: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  const todayWorkouts = data.workouts.filter(workout => workout.date === data.today);
  const featured = todayWorkouts.find(workout => !workout.done) ?? todayWorkouts[0];
  const otherWorkouts = todayWorkouts.filter(workout => workout.id !== featured?.id);
  const restDay = data.restDays.some(day => day.date === data.today);
  const savedRun = todayWorkouts.find(workout => workout.id === savedRunId && workout.done && isRun(workout));
  const completedRun = savedRun ?? (featured?.done && isRun(featured) ? featured : null);
  const start = weekStart(data.today);
  const end = addDays(start, 6);
  const mileage = runningMileage(data.workouts.filter(workout => isRun(workout) && workout.date >= start && workout.date <= end));

  const instructions = featured && (workoutStructure(featured)?.title || featured.plannedWorkout.trim().split('\n')[0]);
  const duration = featured?.plannedDurationSeconds;
  const targets = featured ? [
    { label: 'Distance', value: featured.plannedDistance === null ? '' : number.format(featured.plannedDistance), unit: 'mi' },
    { label: 'Target pace', value: featured.plannedPaceSecondsPerMile === null ? featured.targetPace : formatPace(featured.plannedPaceSecondsPerMile, 'mi'), unit: featured.plannedPaceSecondsPerMile === null ? '' : '/mi' },
    { label: 'Target time', value: duration == null ? '' : duration % 60 === 0 ? number.format(duration / 60) : readableDuration(duration), unit: duration != null && duration % 60 === 0 ? 'min' : '' },
  ].filter(target => target.value) : [];
  const results = completedRun ? [
    completedRun.actualDistance === null ? '' : `${number.format(completedRun.actualDistance)} mi`,
    completedRun.actualDurationSeconds === null ? '' : readableDuration(completedRun.actualDurationSeconds),
  ].filter(Boolean).join(' · ') : '';

  function openButton(workout: Workout, prominent = false) {
    const verb = workout.done ? 'Edit' : 'Log';
    return <button type="button" className={prominent ? 'today-workout-log' : 'today-workout-link'} disabled={saving}
      aria-label={`${verb} ${formatWorkoutTitle(workout.type)} workout`} onClick={() => onOpenWorkout(workout.id)}>
      {prominent ? `${verb} workout` : `${verb} ${formatWorkoutTitle(workout.type).toLowerCase()}`}
      {workout.done ? <Pencil size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
    </button>;
  }

  return <div className="today-dashboard">
    <section className="today-workout" aria-labelledby="today-workout-title">
      <div className="today-workout-copy">
        <p className="today-workout-date">Today’s workout <span aria-hidden="true">·</span> {formatDate(data.today, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
        <h1 id="today-workout-title" tabIndex={-1}>{featured ? formatWorkoutTitle(featured.type) : restDay ? 'Rest day' : 'No workout scheduled'}</h1>
        {instructions && <p className="today-workout-instructions">{instructions}</p>}
        {targets.length > 0 && <dl className="today-workout-targets">
          {targets.map(target => <div key={target.label}>
            <dt>{target.label}</dt><dd>{target.value}{target.unit && <> <small>{target.unit}</small></>}</dd>
          </div>)}
        </dl>}
        {featured && featured.id !== completedRun?.id && openButton(featured, !featured.done)}
        {completedRun && <div className="today-workout-completed" key={completedRun.id}>
          <div className="today-workout-celebration">
            <Sparkles size={22} className={savedRun ? 'today-workout-spark' : undefined} aria-hidden="true" />
            <div><strong>{savedRun ? 'Good miles today.' : 'Run completed'}</strong>
              {results && <p>{results}</p>}</div>
          </div>
          {openButton(completedRun)}
        </div>}
        {otherWorkouts.some(workout => workout.id !== completedRun?.id) && <ul className="today-workout-others" aria-label="Other workouts today">
          {otherWorkouts.filter(workout => workout.id !== completedRun?.id).map(workout => <li key={workout.id}>{openButton(workout)}</li>)}
        </ul>}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="today-workout-art" src="/today-run-sunrise.webp" alt="" width={1040} height={693} />
    </section>

    <section className="today-mileage" aria-labelledby="today-mileage-title">
      <div className="today-mileage-header"><h2 id="today-mileage-title">Weekly mileage</h2><span>{formatDate(start)} – {formatDate(end)}</span></div>
      <p className="today-mileage-value">
        {mileage.recorded === null ? 'No recorded mileage' : <strong>{weeklyNumber.format(mileage.recorded)} mi</strong>}
        {mileage.planned !== null && <span>of {weeklyNumber.format(mileage.planned)} mi planned</span>}
      </p>
      {mileage.planned !== null && mileage.planned > 0 && mileage.recorded !== null &&
        <progress aria-label="Weekly mileage against plan" aria-valuetext={`${weeklyNumber.format(mileage.recorded)} of ${weeklyNumber.format(mileage.planned)} miles planned`}
          max={mileage.planned} value={Math.min(mileage.planned, mileage.recorded)} />}
      {mileage.missingRecorded > 0 && <p className="today-mileage-note">{mileage.missingRecorded} completed {mileage.missingRecorded === 1 ? 'run is' : 'runs are'} missing distance.</p>}
      {mileage.missingPlanned > 0 && <p className="today-mileage-note">{mileage.missingPlanned} {mileage.missingPlanned === 1 ? 'run target is' : 'run targets are'} missing.</p>}
      <a href={progressHref} onClick={onProgress}>Progress Overview <ArrowRight size={16} aria-hidden="true" /></a>
    </section>
  </div>;
}
