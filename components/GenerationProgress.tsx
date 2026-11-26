'use client';
import { useEffect, useRef } from 'react';
import './generation-progress.css';

export default function GenerationProgress({ sample = false, resumed = false, assessment = false }: { sample?: boolean; resumed?: boolean; assessment?: boolean }) {
  const status = useRef<HTMLDivElement>(null);
  useEffect(() => { status.current?.scrollIntoView({ block: 'nearest' }); }, []);
  return <div ref={status} className="generation-progress" role="status" aria-live="polite" aria-atomic="true">
    <div className="generation-progress-track" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/journey-runner.webp" alt="" width={64} height={64} />
    </div>
    <div><strong>{assessment ? sample ? 'Preparing your sample review…' : 'Reviewing your goal…' : sample ? 'Preparing your sample schedule…' : 'Building your training plan…'}</strong>
      <p>{resumed ? 'A request is already running. Reload in a moment to check its result.' : assessment ? 'Considering your goal, recent result, dates and training days. Your draft is saved.' : sample ? 'Adding the example workouts and saving your draft.' : 'Checking your inputs and putting your schedule together. This can take up to two minutes.'}</p>
    </div>
  </div>;
}
