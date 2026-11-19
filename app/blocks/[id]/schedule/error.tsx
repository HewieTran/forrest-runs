'use client';
export default function ScheduleError({ reset }: { reset: () => void }) {
  return <main className="main-content"><h1>Could not load your schedule</h1><p role="alert">Your workouts have not changed. Try loading the schedule again.</p><div className="button-group"><button className="button primary" onClick={reset}>Try again</button><a className="button" href="/blocks">Training blocks</a></div></main>;
}
