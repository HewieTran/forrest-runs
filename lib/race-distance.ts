export const RACE_DISTANCES = [
  { label: '5K', meters: 5000 },
  { label: '10K', meters: 10000 },
  { label: 'Half marathon', meters: 21097.5 },
  { label: 'Full marathon', meters: 42195 },
] as const;

export const METERS_PER_MILE = 1609.344;

export function raceForMeters(meters: number) {
  return RACE_DISTANCES.find(race => race.meters === meters);
}

export function raceForKilometers(kilometers: number | null) {
  return RACE_DISTANCES.find(race => race.meters / 1000 === kilometers);
}

export function raceDistanceLabel(kilometers: number | null) {
  return raceForKilometers(kilometers)?.label ?? (kilometers === null ? 'Distance not set' : `${kilometers} km`);
}
