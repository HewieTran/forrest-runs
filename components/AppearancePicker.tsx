'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Palette } from 'lucide-react';
import { APPEARANCE_PRESETS, resolveAppearance, type AppearancePreset } from '../lib/appearance';
import { useAccountProfile, useUpdateAccountProfile, useAppearancePreview } from './SessionActions';
import type { ProfileView } from '../lib/profile';
import WorkoutDialog from './WorkoutDialog';

export function AppearanceButton() {
  const account = useAccountProfile();
  const [open, setOpen] = useState(false), [saved, setSaved] = useState(false);
  if (!account) return null;
  return <><button id="appearance-trigger" type="button" className="button appearance-trigger" aria-label="Appearance" onClick={() => { setSaved(false); setOpen(true); }}><Palette size={18} aria-hidden="true" /><span>Appearance</span></button>
    {saved && <span className="sr-only" role="status">Appearance saved</span>}
    {open && <AppearancePicker account={account} onClose={() => setOpen(false)} onSaved={() => { setSaved(true); setOpen(false); }} />}
  </>;
}
function AppearancePicker({ account, onClose, onSaved }: { account: ProfileView; onClose: () => void; onSaved: () => void }) {
  const router = useRouter(), update = useUpdateAccountProfile(), { setPreview } = useAppearancePreview();
  const [current, setCurrent] = useState(account);
  const [selected, setSelected] = useState<AppearancePreset>(resolveAppearance(account.profile?.appearance));
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false);
  const dirty = selected !== resolveAppearance(current.profile?.appearance);
  const savingRef = useRef(false);
  useEffect(() => () => setPreview(null), [setPreview]);
  useEffect(() => {
    if (!dirty && !saving) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, saving]);
  function close() {
    if (savingRef.current) return false;
    setPreview(null); onClose(); return true;
  }
  async function reload() {
    setSaving(true); savingRef.current = true; setError('');
    try {
      const response = await fetch('/api/profile');
      const data = await response.json() as { account: ProfileView; error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not reload your appearance. Try again.');
      setCurrent(data.account); update(data.account); setSelected(resolveAppearance(data.account.profile?.appearance)); setPreview(null); setConflict(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not reload. Try again.'); }
    finally { setSaving(false); savingRef.current = false; }
  }
  async function apply(event: React.FormEvent) {
    event.preventDefault(); if (savingRef.current) return;
    setSaving(true); savingRef.current = true; setError('');
    try {
      const response = await fetch('/api/profile/appearance', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset: selected, version: current.profile?.version || 0 }) });
      const data = await response.json() as { account: ProfileView; error?: string };
      if (!response.ok) { setConflict(response.status === 409); throw new Error(data.error || 'Could not save your appearance. Your selection is still here. Try again.'); }
      update(data.account); setPreview(null); onSaved(); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save your appearance. Your selection is still here. Try again.'); }
    finally { setSaving(false); savingRef.current = false; }
  }
  return <WorkoutDialog className="appearance-dialog" title="Appearance" closeLabel="Close appearance" saving={saving} onClose={close} returnFocusId="appearance-trigger">
    <form className="appearance-picker" onSubmit={apply} aria-busy={saving}>
      <p>Make this space yours.</p>
      <fieldset disabled={saving}><legend>Choose your appearance</legend><div className="appearance-choices">{APPEARANCE_PRESETS.map(preset => <label className="appearance-choice" key={preset.id}>
        <input type="radio" name="appearance" value={preset.id} checked={selected === preset.id} onChange={() => { setSelected(preset.id); setPreview(preset.id); }} />
        <span className={`appearance-thumbnail appearance-thumbnail-${preset.id}`} style={preset.image ? { backgroundImage: `url(/appearance/${preset.id}-thumb.webp)` } : undefined} aria-hidden="true">{selected === preset.id && <b>✓</b>}</span>
        <strong>{preset.name}</strong><small>{preset.description}</small><span className="appearance-selected">{selected === preset.id ? '✓ Selected' : 'Select'}</span>
      </label>)}</div></fieldset>
      <p className="appearance-hint">Preview your choice, then apply it to your account. Cancel restores your saved appearance.</p>
      {error && <div className="profile-error" role="alert"><p>{error}</p>{conflict && <button type="button" className="button secondary" disabled={saving} onClick={reload}>Reload latest profile</button>}</div>}
      <div className="appearance-picker-actions"><button type="button" className="button secondary" disabled={saving} onClick={close}>Cancel</button><button type="submit" className="button primary" disabled={saving || conflict}>{saving ? 'Saving…' : 'Apply appearance'}</button></div>
    </form>
  </WorkoutDialog>;
}
