'use client';

import { clearGuidanceSession } from '../lib/onboarding';
import { AVATAR_COLORS, type ProfileView } from '../lib/profile';
import { createContext, useContext, useState, type ReactNode } from 'react';
import ProfileEditor from './ProfileEditor';

const SignOutPath = createContext<string | null>(null);
const AccountProfile = createContext<ProfileView | null>(null);
const UpdateProfile = createContext<(account: ProfileView) => void>(() => {});
export const useAccountProfile = () => useContext(AccountProfile);

export function SessionActions({ signOutPath, account, children }: { signOutPath: string | null; account: ProfileView | null; children: ReactNode }) {
  const [current, setCurrent] = useState(account);
  return <SignOutPath.Provider value={signOutPath}><AccountProfile.Provider value={current}><UpdateProfile.Provider value={setCurrent}>{children}</UpdateProfile.Provider></AccountProfile.Provider></SignOutPath.Provider>;
}

export function AccountAvatar({ displayName, preview }: { displayName: string; preview: boolean }) {
  const path = useContext(SignOutPath), account = useAccountProfile(), update = useContext(UpdateProfile);
  const [editing, setEditing] = useState(false), [saved, setSaved] = useState(false);
  const initial = !preview && account ? account.initial : Array.from(displayName)[0]?.toUpperCase() || 'R';
  const color = !preview && account ? account.profile?.avatarColor ?? account.automaticColor : 0;
  const style = { backgroundColor: AVATAR_COLORS[color].color, color: '#fff' };
  if (preview || !account) return <span className="avatar" title={displayName} style={style}>{initial}</span>;
  return <>
    <details className="session-menu">
      <summary id="account-menu-trigger" className="avatar" aria-label="Account menu" title={account.displayName} style={style}>{initial}</summary>
      <div className="session-menu-panel">
        <button className="button quiet" type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setSaved(false); setEditing(true); }}>Edit profile</button>
        {path && <form action={path} method="post" onSubmit={() => { try { clearGuidanceSession(sessionStorage); } catch { /* Browser storage can be disabled. */ } }}><button className="button quiet" type="submit">Sign out</button></form>}
      </div>
    </details>
    {saved && <span className="profile-save-notice" role="status">Profile saved</span>}
    {editing && <ProfileEditor account={account} onClose={() => setEditing(false)} onSaved={value => { update(value); setSaved(true); setEditing(false); }} />}
  </>;
}
