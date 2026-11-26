import type { WorkoutPeriod } from './workout-period.ts';

// Replace assets here without touching workout data, layout, or time selection.
export const JAPANESE_ART = {
  background: '/appearance/japanese/background.webp',
  thumbnail: '/appearance/japanese/thumbnail-v2.webp',
  journey: '/appearance/japanese/journey.webp',
  workouts: {
    morning: '/appearance/japanese/morning-v2.webp',
    afternoon: '/appearance/japanese/afternoon-v2.webp',
    evening: '/appearance/japanese/evening-v2.webp',
    night: '/appearance/japanese/night.webp',
  } satisfies Record<WorkoutPeriod, string>,
} as const;
