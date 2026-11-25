'use client';
import { useSyncExternalStore } from 'react';
import { useAccountProfile } from './SessionActions';
import { greetingPeriod, greetingText } from '../lib/library-greeting';

function subscribe(listener: () => void) {
  window.addEventListener('focus', listener);
  document.addEventListener('visibilitychange', listener);
  const timer = window.setInterval(listener, 60_000);
  return () => { window.removeEventListener('focus', listener); document.removeEventListener('visibilitychange', listener); window.clearInterval(timer); };
}
const snapshot = () => greetingPeriod(new Date().getHours());
const serverSnapshot = () => 'neutral' as const;
export default function LibraryGreeting({ name, useProfile = true }: { name: string; useProfile?: boolean }) {
  const period = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const account = useAccountProfile();
  const text = useProfile && account ? `${period === 'neutral' ? 'Welcome back' : `Good ${period}`}, ${account.greetingName}` : greetingText(name, period);
  return <h1 className="library-greeting">{text}</h1>;
}
