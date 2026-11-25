export const AVATAR_COLORS = [
  { name: 'Forest', color: '#285d46' }, { name: 'Blue', color: '#315b78' },
  { name: 'Plum', color: '#6b466f' }, { name: 'Clay', color: '#a04e35' },
  { name: 'Ochre', color: '#7a5a20' }, { name: 'Slate', color: '#4b5c66' },
  { name: 'Teal', color: '#286666' }, { name: 'Berry', color: '#883f54' },
] as const;
export type Profile = { firstName: string | null; lastName: string | null; avatarColor: number | null; version: number; updatedAt: string };
export type ProfileInput = Omit<Profile, 'updatedAt'>;
export function automaticAvatarColor(userId: string) {
  let hash = 2166136261;
  for (const c of userId) { hash ^= c.codePointAt(0)!; hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % AVATAR_COLORS.length;
}
function name(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 80 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('Names must be 80 characters or fewer, without control characters.');
  return value.trim().normalize('NFC') || null;
}
export function validateProfile(value: unknown): ProfileInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter profile details.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(k => !['firstName', 'lastName', 'avatarColor', 'version'].includes(k))) throw new Error('Send only profile name, color and version.');
  if (!Number.isSafeInteger(input.version) || Number(input.version) < 0 || Number(input.version) >= Number.MAX_SAFE_INTEGER) throw new Error('Reload the latest profile before saving.');
  if (input.avatarColor !== null && (!Number.isInteger(input.avatarColor) || Number(input.avatarColor) < 0 || Number(input.avatarColor) >= AVATAR_COLORS.length)) throw new Error('Choose an avatar color or Automatic.');
  return { firstName: name(input.firstName), lastName: name(input.lastName), avatarColor: input.avatarColor as number | null, version: Number(input.version) };
}
export function profileNames(profile: Pick<Profile, 'firstName' | 'lastName'> | null, signInName?: string | null) {
  const first = profile?.firstName?.trim(), last = profile?.lastName?.trim();
  const greetingName = first || last || signInName?.trim().split(/\s+/)[0] || 'Runner';
  return { greetingName, displayName: [first, last].filter(Boolean).join(' ') || signInName?.trim() || 'Runner',
    initial: Array.from(Array.from(greetingName)[0]?.toUpperCase() || '')[0] || 'R' };
}
export function profileView(profile: Profile | null, userId: string, signInName?: string | null) {
  return { profile, signInName: signInName || null, automaticColor: automaticAvatarColor(userId), ...profileNames(profile, signInName) };
}
export type ProfileView = ReturnType<typeof profileView>;
export function normalizeProfileBackup(value: unknown): Profile | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object') throw new Error('Invalid saved profile.');
  const input = value as Record<string, unknown>;
  if (typeof input.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(input.updatedAt) || !Number.isFinite(Date.parse(input.updatedAt))) throw new Error('Invalid profile timestamp.');
  const saved = validateProfile({ firstName: input.firstName, lastName: input.lastName, avatarColor: input.avatarColor, version: input.version });
  if (saved.version < 1) throw new Error('Invalid saved profile version.');
  return { ...saved, updatedAt: input.updatedAt };
}
