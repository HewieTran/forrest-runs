export type MeasurementUnit = 'mi' | 'km';
export type ExactMeasurement = { value: number | null; units: MeasurementUnit };
// Keep the last entered/saved number; never feed a formatted number back into conversion.
export function measurementIn(entry: ExactMeasurement, units: MeasurementUnit, kind: 'height' | 'weight') {
  if (entry.value === null || entry.units === units) return entry.value;
  const factor = kind === 'height' ? 2.54 : .45359237;
  return entry.units === 'mi' ? entry.value * factor : entry.value / factor;
}
