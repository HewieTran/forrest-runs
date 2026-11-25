import { dateDiff, validDate, type AppData } from './domain.ts';
import { journey, orderedWorkouts, overviewStats } from './block-overview.ts';

/** Presentation data only: use saved dates and measurements, never description parsing. */
export function libraryHero(data: AppData) {
  const route = journey(data), stats = overviewStats(data);
  const rows = orderedWorkouts(data.workouts);
  const phases: { name: string; start: string; end: string }[] = [];
  const datedPhases = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!validDate(row.date) || !row.phase?.trim() || row.phase === 'Not applicable') continue;
    const names = datedPhases.get(row.date) ?? new Set<string>();
    names.add(row.phase); datedPhases.set(row.date, names);
  }
  for (const [date, names] of datedPhases) {
    if (names.size !== 1) continue; // Conflicting same-day labels provide no reliable boundary.
    const name = [...names][0], previous = phases.at(-1);
    if (previous?.name === name) previous.end = date;
    else phases.push({ name, start: date, end: date });
  }
  const timedPhases = phases.filter(phase => route && phase.start >= route.start && phase.start <= route.end)
    .map(phase => ({ ...phase,
      percent: route!.start === route!.end ? 0 : dateDiff(phase.start, route!.start) / dateDiff(route!.end, route!.start) * 100,
      startWeek: Math.floor(dateDiff(phase.start, route!.start) / 7) + 1,
      endWeek: Math.min(route!.totalWeeks, Math.floor(dateDiff(phase.end, route!.start) / 7) + 1),
    }));
  // Overlapping saved ranges have no unambiguous current phase.
  const sameDayAmbiguous = (datedPhases.get(data.today)?.size ?? 0) > 1;
  const current = timedPhases.filter(phase => phase.start <= data.today && data.today <= phase.end);
  const next = rows.find(row => !row.done && row.date >= data.today) ?? null;
  return { id: data.plan.id, route, phases: timedPhases,
    phase: !sameDayAmbiguous && current.length === 1 ? current[0].name : null,
    daysToRace: validDate(data.plan.raceDate) && validDate(data.today) ? dateDiff(data.plan.raceDate, data.today) : null,
    weekly: stats.weekly, weekStart: stats.start, weekEnd: stats.end,
    next: next ? { date: next.date, type: next.type, distance: next.plannedDistance, duration: next.plannedDurationSeconds } : null,
  };
}
export type LibraryHero = ReturnType<typeof libraryHero>;

/** Stable SVG road geometry shared by phase pins and the current-date marker. */
export function roadPoint(percent: number, compact = false) {
  const t = Math.max(0, Math.min(100, percent)) / 100;
  return { x: (compact ? 18 : 24) + (compact ? 304 : 952) * t,
    y: (compact ? 86 : 102) + (compact ? 15 : 22) * Math.sin(t * Math.PI * 2) - 9 * Math.sin(t * Math.PI * 4) };
}
export function journeyTicks(totalWeeks: number, compact = false) {
  if (totalWeeks < 1 || !Number.isFinite(totalWeeks)) return [];
  const step = Math.max(1, Math.ceil((totalWeeks - 1) / (compact ? 3 : 6)));
  const ticks = Array.from({ length: Math.floor((totalWeeks - 1) / step) + 1 }, (_, i) => 1 + i * step);
  if (totalWeeks - ticks[ticks.length - 1] >= step / 2) ticks.push(totalWeeks);
  return ticks;
}
