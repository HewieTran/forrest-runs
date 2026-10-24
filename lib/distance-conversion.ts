// Offline review proposals only. Live reads, saves, and migrations never call
// this parser or infer targets from legacy descriptions.
export function proposeDistanceTarget(row: {
  type: string;
  plannedWorkout: string;
  plannedDistance: number | null;
  targetMetric: string | null;
}): { status: 'proposed' | 'review' | 'skip'; miles: number | null; reason: string } {
  if (row.type === 'Strength' || row.type === 'Mobility')
    return { status: 'skip', miles: null, reason: 'Strength/mobility excluded from running mileage.' };
  if (row.plannedDistance !== null || row.targetMetric !== null)
    return { status: 'skip', miles: null, reason: 'Existing structured target preserved.' };
  const match = row.plannedWorkout.trim().match(/^(?:race\s+)?(\d+(?:\.\d+)?)\s*(mi|miles?|km|kilomet(?:er|re)s?)\b(.*)$/i);
  if (!match) return { status: 'review', miles: null, reason: 'No unambiguous single running distance.' };
  const [, amount, unit, suffix] = match;
  const plain = /^\s*(?:easy|steady|recovery|long|cutback|peak|relaxed|shakeout)?\s*$/i.test(suffix);
  const explicitTotal = /^\s+total\s*:/i.test(suffix);
  if (!plain && !explicitTotal)
    return { status: 'review', miles: null, reason: 'Additional prescription needs a person to confirm the total.' };
  const miles = Number(amount) / (/^k/i.test(unit) ? 1.609344 : 1);
  if (!(miles > 0 && miles <= 1000)) return { status: 'review', miles: null, reason: 'Distance outside supported limits.' };
  return { status: 'proposed', miles, reason: explicitTotal ? 'Description explicitly names the total distance.' : 'Single distance with an explicit unit.' };
}
