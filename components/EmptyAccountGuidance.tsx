'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export default function EmptyAccountGuidance({ sessionKey }: { sessionKey: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try { setVisible(sessionStorage.getItem(sessionKey) !== 'dismissed'); }
    catch { setVisible(true); }
  }, [sessionKey]);
  function dismiss() {
    try { sessionStorage.setItem(sessionKey, 'dismissed'); } catch { /* Guidance never blocks the app when browser storage is disabled. */ }
    setVisible(false);
    document.getElementById('create-training-block')?.focus();
  }
  if (!visible) return null;
  return <aside className="empty-account-guidance" aria-labelledby="empty-guidance-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); dismiss(); } }}>
    <button className="icon-button" type="button" aria-label="Dismiss training guidance for this visit" onClick={dismiss}><X size={20} /></button>
    <h2 id="empty-guidance-title">Your training journey starts here.</h2>
    <p>Create your first training block.</p>
  </aside>;
}
