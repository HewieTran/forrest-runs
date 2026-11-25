import { dateDiff } from '../lib/domain';
import { journeyTicks, roadPoint, type LibraryHero } from '../lib/library-hero';

function Tree({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${size})`}><path d="M0 4v27" stroke="#80603e" strokeWidth="3" /><path d="M0-14L-10 4h5L-14 18h28L5 4h5Z" fill="#59806a" /><path d="M0-14V18" stroke="#365d48" /></g>;
}
function Road({ data, compact = false }: { data: LibraryHero; compact?: boolean }) {
  const route = data.route!;
  const points = Array.from({ length: 101 }, (_, i) => roadPoint(i, compact));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  const current = roadPoint(route.percent, compact), finish = roadPoint(100, compact);
  const taper = data.phases.find(p => p.name.toLowerCase() === 'taper');
  const bench = taper ? roadPoint(taper.percent, compact) : null;
  return <svg className={compact ? 'library-road library-road-mobile' : 'library-road library-road-desktop'} viewBox={`0 0 ${compact ? 340 : 1000} 174`} aria-hidden="true" focusable="false">
    <path d={path} fill="none" stroke="#dbe0d4" strokeWidth="17" strokeLinecap="round" />
    <path d={points.slice(0, Math.floor(route.percent) + 1).concat(current).map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')} fill="none" stroke="#39674d" strokeWidth="17" strokeLinecap="round" />
    <path d={path} fill="none" stroke="#fff9e9" strokeWidth="1.5" strokeDasharray="5 8" />
    {compact ? <><Tree x={48} y={30} size={.7} /><Tree x={232} y={24} size={.65} /></> : <><Tree x={100} y={45} /><Tree x={180} y={40} size={.65} /><Tree x={300} y={145} size={.6} /><Tree x={560} y={30} /><Tree x={665} y={42} size={.65} /></>}
    {data.phases.map((phase, i) => { const p = roadPoint(phase.percent, compact); return <g key={`${phase.name}-${phase.start}`} transform={`translate(${p.x} ${p.y - 27})`}><path d="M0 0v25" stroke="#7e6444" strokeWidth="2" /><circle r="10" fill="#315e46" stroke="#fffdf7" strokeWidth="2" />{!compact && <text textAnchor="middle" y="4" fontSize="12" fill="white">{i + 1}</text>}</g>; })}
    {bench && <g transform={`translate(${bench.x + (compact ? -9 : 20)} ${bench.y - 57})`} stroke="#775336" strokeWidth="2.5"><path d="M-11 0h22M-11 5h22M-13 11h26M-9 12v9M9 12v9" /><path d="M-10-2v13M10-2v13" strokeWidth="1.6" /></g>}
    <g transform={`translate(${finish.x} ${finish.y - 43})`}><path d="M0 0v43" stroke="#37583f" strokeWidth="2.5" /><path d="M0 0h17v16H0Z" fill="#fffdf7" stroke="#37583f" /><path d="M0 0h6v8H0zm12 0h5v8h-5zM6 8h6v8H6z" fill="#37583f" /></g>
    {journeyTicks(route.totalWeeks, compact).map(week => { const p = roadPoint(route.totalWeeks === 1 ? 0 : (week - 1) * 7 / Math.max(1, dateDiff(route.end, route.start)) * 100, compact); return <text key={week} x={p.x} y={p.y + 34} textAnchor="middle" fill="#4b5d4e" fontSize={compact ? 10 : 12}>W{week}</text>; })}
    <circle cx={current.x} cy={current.y} r="18" fill="#fffdf7" stroke="#986b2d" strokeWidth="2" />
    <image href="/journey-runner.webp" x={current.x - 15} y={current.y - 19} width="30" height="31" />
  </svg>;
}
export default function LibraryJourney({ data }: { data: LibraryHero }) {
  if (!data.route) return <p className="library-journey-fallback">Journey dates not available.</p>;
  return <div className="library-journey"><Road data={data} /><Road data={data} compact />
    <p className="sr-only">Week {data.route.week} of {data.route.totalWeeks}. Journey follows the current date, not workout completion.</p>
    <ol className="library-phase-list">{data.phases.map((phase, i) => <li key={`${phase.name}-${phase.start}`}><span className="library-phase-number">{i + 1}</span><div><strong>{phase.name}</strong><small>Weeks {phase.startWeek}–{phase.endWeek}{data.phaseStart === phase.start ? ' · You are here' : ''}</small></div></li>)}<li className="library-finish"><strong>Finish</strong><small>{data.route.end}</small></li></ol>
  </div>;
}
