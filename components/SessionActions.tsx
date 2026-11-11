'use client';

import { createContext, useContext, type ReactNode } from 'react';

const SignOutPath = createContext<string | null>(null);

export function SessionActions({ signOutPath, children }: { signOutPath: string | null; children: ReactNode }) {
  return <SignOutPath.Provider value={signOutPath}>{children}</SignOutPath.Provider>;
}

export function AccountAvatar({ displayName, preview }: { displayName: string; preview: boolean }) {
  const path = useContext(SignOutPath);
  const initial = displayName[0]?.toUpperCase() || 'R';
  if (!path || preview) return <span className="avatar" title={displayName}>{initial}</span>;
  return <details className="session-menu">
    <summary className="avatar" aria-label="Account menu" title={displayName}>{initial}</summary>
    <form action={path} method="post"><button className="button quiet" type="submit">Sign out</button></form>
  </details>;
}
