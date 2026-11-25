'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AVATAR_COLORS, profileNames, type ProfileView } from '../lib/profile';
import WorkoutDialog from './WorkoutDialog';

export default function ProfileEditor({ account, onClose, onSaved }: { account: ProfileView; onClose: () => void; onSaved: (value: ProfileView) => void }) {
  const router = useRouter();
  const [current, setCurrent] = useState(account);
  const [firstName, setFirstName] = useState(account.profile?.firstName || '');
  const [lastName, setLastName] = useState(account.profile?.lastName || '');
  const [avatarColor, setAvatarColor] = useState<number | null>(account.profile?.avatarColor ?? null);
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [conflict, setConflict] = useState(false), [discard, setDiscard] = useState<'close' | 'reload' | null>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (discard) discardRef.current?.focus(); }, [discard]);
  const dirty = firstName.trim() !== (current.profile?.firstName || '') || lastName.trim() !== (current.profile?.lastName || '') || avatarColor !== (current.profile?.avatarColor ?? null);
  const names = profileNames({ firstName, lastName }, current.signInName);
  const color = avatarColor ?? current.automaticColor;
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  function close() {
    if (saving) return false;
    if (dirty) { setDiscard('close'); return false; }
    onClose(); return true;
  }
  async function reload() {
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/profile');
      const data = await response.json() as { account: ProfileView; error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not reload your profile. Try again.');
      const latest: ProfileView = data.account;
      setCurrent(latest); setFirstName(latest.profile?.firstName || ''); setLastName(latest.profile?.lastName || ''); setAvatarColor(latest.profile?.avatarColor ?? null);
      setConflict(false); setDiscard(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not reload your profile. Try again.'); }
    finally { setSaving(false); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setDiscard(null);
    try {
      const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName, lastName, avatarColor, version: current.profile?.version || 0 }) });
      const data = await response.json() as { account: ProfileView; error?: string };
      if (!response.ok) { setConflict(response.status === 409); throw new Error(data.error || 'Could not save your profile. Your edits are still here. Try again.'); }
      onSaved(data.account); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save your profile. Your edits are still here. Try again.'); }
    finally { setSaving(false); }
  }
  return <WorkoutDialog className="profile-dialog" title="Edit profile" closeLabel="Close profile" saving={saving} onClose={close} returnFocusId="account-menu-trigger">
    <form className="profile-editor" onSubmit={save} aria-busy={saving}>
      <p className="profile-help">Make this space yours. Your training records stay with your account.</p>
      <fieldset disabled={saving} className="profile-fields">
        <label>First name<input autoComplete="given-name" maxLength={80} value={firstName} onChange={event => setFirstName(event.target.value)} /></label>
        <label>Last name<input autoComplete="family-name" maxLength={80} value={lastName} onChange={event => setLastName(event.target.value)} /></label>
      </fieldset>
      <p className="profile-help">Leave both names blank to use your sign-in name.</p>
      <div className="profile-preview"><span className="avatar" aria-hidden="true" style={{ backgroundColor: AVATAR_COLORS[color].color, color: '#fff' }}>{names.initial}</span><span>Welcome back, {names.greetingName}</span></div>
      <fieldset className="profile-palette" disabled={saving}>
        <legend>Avatar color</legend>
        <label className="profile-automatic"><input type="radio" name="avatarColor" checked={avatarColor === null} onChange={() => setAvatarColor(null)} />Automatic</label>
        <div className="profile-swatches">{AVATAR_COLORS.map((entry, index) => <label key={entry.name} className="profile-swatch" style={{ '--avatar-color': entry.color } as React.CSSProperties}>
          <input type="radio" name="avatarColor" aria-label={entry.name} checked={avatarColor === index} onChange={() => setAvatarColor(index)} />
          <span aria-hidden="true">{names.initial}</span><small>{entry.name}</small>
        </label>)}</div>
      </fieldset>
      {error && <div className="profile-error" role="alert"><p>{error}</p>{conflict && <button className="button secondary" type="button" disabled={saving} onClick={() => dirty ? setDiscard('reload') : void reload()}>Reload latest profile</button>}</div>}
      {discard && <div className="profile-discard" ref={discardRef} tabIndex={-1} role="alert"><p>{discard === 'reload' ? 'Reloading will replace your unsaved edits with the latest saved profile.' : 'Discard your unsaved profile edits?'}</p><div className="profile-buttons"><button type="button" className="button secondary" disabled={saving} onClick={() => setDiscard(null)}>Keep editing</button><button type="button" className="button secondary" disabled={saving} onClick={() => discard === 'reload' ? void reload() : onClose()}>{discard === 'reload' ? 'Discard and reload' : 'Discard edits'}</button></div></div>}
      <div className="profile-buttons"><button className="button secondary" type="button" disabled={saving} onClick={close}>Cancel</button><button className="button primary" type="submit" disabled={saving || conflict}>{saving ? 'Saving…' : 'Save profile'}</button></div>
    </form>
  </WorkoutDialog>;
}
