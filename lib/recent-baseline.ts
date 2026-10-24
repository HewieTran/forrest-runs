import { addDays, isRun, type Workout } from './domain.ts';

export type RecentBaseline = { from: string; to: string; weeklyDistanceMiles: number; longestRunMiles: number; runsPerWeek: number };

// Suggestions only: four weeks with recorded running are not evidence that a
// log is complete. The user explicitly reviews/applies this summary in setup.
export function summarizeRecentBaseline(rows: Pick<Workout, 'date' | 'type' | 'done' | 'actualDistance'>[], today: string): RecentBaseline | null {
  const from = addDays(today, -28), to = addDays(today, -1);
  const runs = rows.filter(row => row.done && isRun(row) && row.date >= from && row.date <= to);
  if (!runs.length || runs.some(row => row.actualDistance === null || !Number.isFinite(row.actualDistance) || row.actualDistance < 0)) return null;
  // An empty week could mean missing data. Never assume it was zero training.
  const weeks = [0, 1, 2, 3].map(week => runs.filter(row => row.date >= addDays(from, week * 7) && row.date < addDays(from, (week + 1) * 7)));
  if (weeks.some(week => week.length === 0)) return null;
  const distance = runs.reduce((sum, row) => sum + row.actualDistance!, 0);
  const distinctDays = new Set(runs.filter(row => row.actualDistance! > 0).map(row => row.date)).size;
  return { from, to, weeklyDistanceMiles: distance / 4, longestRunMiles: Math.max(...runs.map(row => row.actualDistance!)), runsPerWeek: Math.round(distinctDays / 4) };
}
