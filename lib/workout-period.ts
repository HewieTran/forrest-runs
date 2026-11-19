export const WORKOUT_PERIODS = ['morning', 'afternoon', 'evening', 'night'] as const;
export type WorkoutPeriod = typeof WORKOUT_PERIODS[number];
export const PERIOD_LABELS: Record<WorkoutPeriod, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' };
export const periodArtwork = (period: WorkoutPeriod) => `/run-${period}.webp`;

// The browser supplies its local hour; no exact workout timestamp is stored.
export function periodForHour(hour: number): WorkoutPeriod {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}
