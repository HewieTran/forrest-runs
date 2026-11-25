import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_COLORS, automaticAvatarColor, profileNames, profileView, validateProfile, normalizeProfileBackup } from '../lib/profile.ts';
import { normalizeTrainingBackup } from '../lib/backups.ts';

test('profile names follow the approved first / last / sign-in / Runner fallback', () => {
  for (const [firstName, lastName, signIn, greetingName, initial] of [
    ['Hieu', 'Tran', 'Other Name', 'Hieu', 'H'], ['Hieu', null, 'Other Name', 'Hieu', 'H'],
    [null, 'Tran', 'Other Name', 'Tran', 'T'], [null, 'Van Tran', 'Other Name', 'Van Tran', 'V'],
    [null, null, ' Hiếu Tran ', 'Hiếu', 'H'], [null, null, null, 'Runner', 'R'],
    ['𐐀', null, null, '𐐀', '𐐀'],
  ]) assert.deepEqual([profileNames({ firstName, lastName }, signIn).greetingName, profileNames({ firstName, lastName }, signIn).initial], [greetingName, initial]);
  assert.equal(profileNames({ firstName: 'Hieu', lastName: 'Tran' }).displayName, 'Hieu Tran');
  assert.equal('userId' in profileView(null, 'private-id', 'Hieu Tran'), false);
});
test('avatar colors are stable across sessions, spread over the palette and readable with white initials', () => {
  assert.equal(automaticAvatarColor('owner-a'), automaticAvatarColor('owner-a'));
  assert.equal(new Set(Array.from({ length: 100 }, (_, i) => automaticAvatarColor('owner-' + i))).size, AVATAR_COLORS.length);
  for (const { color } of AVATAR_COLORS) {
    const channels = color.slice(1).match(/../g).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    assert.ok(1.05 / (luminance + .05) >= 4.5, color);
  }
});
test('profile validation normalizes names and rejects ownership injection and invalid fields', () => {
  const valid = { firstName: ' Hiếu ', lastName: '', avatarColor: null, version: 0 };
  assert.deepEqual(validateProfile(valid), { firstName: 'Hiếu', lastName: null, avatarColor: null, version: 0 });
  for (const invalid of [null, [], { ...valid, ownerId: 'other' }, { ...valid, firstName: 1 }, { ...valid, firstName: 'x'.repeat(81) }, { ...valid, lastName: 'a\nb' }, { ...valid, avatarColor: 8 }, { ...valid, avatarColor: -1 }, { ...valid, avatarColor: 1.1 }, { ...valid, version: -1 }, { ...valid, version: .5 }]) assert.throws(() => validateProfile(invalid));
});
test('v8 includes portable profile preferences; old backup normalization stays v7', () => {
  const old = { schemaVersion: 7, exportedAt: '2026-11-25T12:00:00.000Z', blocks: [], workouts: [], restDays: [] };
  assert.deepEqual(normalizeTrainingBackup(old), old);
  const profile = { firstName: 'Hieu', lastName: null, avatarColor: 2, version: 1, updatedAt: old.exportedAt };
  const backup = { ...old, schemaVersion: 8, profile };
  assert.deepEqual(normalizeTrainingBackup(backup), backup);
  assert.deepEqual(normalizeTrainingBackup({ ...backup, profile: null }).profile, null);
  assert.throws(() => normalizeProfileBackup({ ...profile, avatarColor: 9 }));
  assert.throws(() => normalizeProfileBackup({ ...profile, updatedAt: 'invalid' }));
  assert.throws(() => normalizeProfileBackup({ ...profile, version: 0 }));
});
