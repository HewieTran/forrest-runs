import type { WorkoutPeriod } from './workout-period.ts';

// Replace assets here without touching workout data, layout, or time selection.
export const JAPANESE_ART = {
  background: '/appearance/japanese/background.webp',
  thumbnail: '/appearance/japanese/thumbnail.webp',
  journey: '/appearance/japanese/journey.webp',
  workouts: {
    morning: '/appearance/japanese/morning.webp',
    afternoon: '/appearance/japanese/afternoon.webp',
    evening: '/appearance/japanese/evening.webp',
    night: '/appearance/japanese/night.webp',
  } satisfies Record<WorkoutPeriod, string>,
} as const;
