'use client';
import { useSyncExternalStore } from 'react';
import { greetingPeriod, greetingText } from '../lib/library-greeting';

function subscribe(listener: () => void) {
  window.addEventListener('focus', listener);
  document.addEventListener('visibilitychange', listener);
  const timer = window.setInterval(listener, 60_000);
  return () => { window.removeEventListener('focus', listener); document.removeEventListener('visibilitychange', listener); window.clearInterval(timer); };
}
const snapshot = () => greetingPeriod(new Date().getHours());
const serverSnapshot = () => 'neutral' as const;
export default function LibraryGreeting({ name }: { name: string }) {
  const period = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return <h1 className="library-greeting">{greetingText(name, period)}</h1>;
}
