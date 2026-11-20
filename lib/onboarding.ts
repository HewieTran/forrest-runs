import { blockReady, type BlockSummary } from './blocks.ts';
import { dateDiff, formatDate, validDate } from './domain.ts';

export const LIBRARY_FILTERS = ['all', 'draft', 'ready', 'active', 'completed', 'archived'] as const;
export type LibraryFilter = typeof LIBRARY_FILTERS[number];
export function libraryFilter(value: unknown): LibraryFilter | null {
  return typeof value === 'string' && LIBRARY_FILTERS.includes(value as LibraryFilter) ? value as LibraryFilter : null;
}
export function landingFilter(blocks: BlockSummary[]): LibraryFilter {
  if (blocks.some(block => block.status === 'active')) return 'active';
  if (blocks.some(blockReady)) return 'ready';
  if (blocks.some(block => block.status === 'draft')) return 'draft';
  return 'all';
}
export function trainingStartLabel(date: string | null, today: string): string {
  if (!validDate(date)) return 'Start date not scheduled';
  const days = dateDiff(date, today);
  const formatted = formatDate(date, { month: 'long', day: 'numeric', ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) });
  const relative = days > 1 ? `Training starts in ${days} days` : days === 1 ? 'Training starts tomorrow' : days === 0 ? 'Training starts today' : `Scheduled start was ${-days} ${days === -1 ? 'day' : 'days'} ago`;
  return `${relative} · ${formatted}`;
}

// A presentation key only; authorization remains entirely server-side. Avoid
// exposing the internal owner ID in HTML or using names/emails as account keys.
export const GUIDANCE_PREFIX = 'forrest:onboarding:';
export async function guidanceSessionKey(userId: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  return GUIDANCE_PREFIX + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function clearGuidanceSession(storage: Storage) {
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key?.startsWith(GUIDANCE_PREFIX)) storage.removeItem(key);
  }
}
