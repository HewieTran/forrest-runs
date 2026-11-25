/** Keep the implementation available without letting a stale ?q hide blocks. */
export const LIBRARY_SEARCH_ENABLED = false;
export function librarySearch(value: unknown, enabled = LIBRARY_SEARCH_ENABLED) {
  return enabled && typeof value === 'string' ? value : '';
}
export function firstName(value?: string | null) {
  return value?.trim().split(/\s+/)[0] || 'Runner';
}
export function greetingPeriod(hour: number): 'morning' | 'afternoon' | 'evening' {
  return hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : 'evening';
}
export function greetingText(name: string | null | undefined, period: ReturnType<typeof greetingPeriod> | 'neutral') {
  return `${period === 'neutral' ? 'Welcome back' : `Good ${period}`}, ${firstName(name)}`;
}
