export type FinishTimeParts = [hours: string, minutes: string, seconds: string];
export type HeightParts = [feet: string, inches: string];

export function finishTimeParts(value: string): FinishTimeParts {
  const [hours = '', minutes = '', seconds = ''] = value.split(':');
  return [hours, minutes, seconds];
}

// Blank groups are valid for draft saves. NaN denotes an entered but invalid value.
export function finishTimeFromParts(parts: FinishTimeParts): number | null {
  if (parts.every(part => part === '')) return null;
  if (!parts.every(part => /^\d*$/.test(part))) return NaN;
  const [hours, minutes, seconds] = parts.map(Number);
  const total = hours * 3600 + minutes * 60 + seconds;
  return minutes < 60 && seconds < 60 && total > 0 && total <= 86400 ? total : NaN;
}

export function heightParts(totalInches: number | null): HeightParts {
  if (totalInches === null) return ['', ''];
  if (totalInches < 12) return ['0', String(totalInches)];
  const [whole, fraction] = String(totalInches).split('.');
  const feet = Math.floor(totalInches / 12);
  const inches = Number(whole) - feet * 12;
  return [String(feet), fraction ? `${inches}.${fraction}` : String(inches)];
}

export function heightFromParts([feet, inches]: HeightParts): number | null {
  if (!feet && !inches) return null;
  const inchValue = Number(inches);
  const total = Number(feet) * 12 + inchValue;
  if (!/^\d*$/.test(feet) || (inches && !/^(?:\d+\.?\d*|\.\d+)$/.test(inches))) return NaN;
  return inchValue < 12 && total > 0 && Number.isFinite(total) ? total : NaN;
}
