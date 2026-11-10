import { addDays, dateDiff, formatDate, validDate } from './domain.ts';

export const MIN_TRAINING_DAYS = 14;
export const MAX_TRAINING_DAYS = 182;

export function trainingWindowIssue(start: string, race: string, today: string) {
  if (!validDate(start) || !validDate(race) || race <= start) return null;
  if (start < today) return { field: 'startDate', message: 'Choose a training start date today or later.' };
  const days = dateDiff(race, start);
  if (days > MAX_TRAINING_DAYS) {
    const earliest = formatDate(addDays(race, -MAX_TRAINING_DAYS), { month: 'long', day: 'numeric', year: 'numeric' });
    return { field: 'startDate', message: `Plans can span up to 26 weeks. For this race date, choose ${earliest} or later as your training start.` };
  }
  if (days < MIN_TRAINING_DAYS) {
    const latest = addDays(race, -MIN_TRAINING_DAYS);
    const message = latest < today
      ? 'Plans need at least 2 weeks. Choose a later race date.'
      : `Plans need at least 2 weeks. Start by ${formatDate(latest, { month: 'long', day: 'numeric', year: 'numeric' })} or choose a later race date.`;
    return { field: 'targetDate', message };
  }
  return null;
}
