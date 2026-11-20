'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { formatDate } from '../lib/domain';

export default function WorkoutDialog({ title, date, saving, onClose, children, returnFocusId }: {
  title: string;
  date: string;
  saving: boolean;
  onClose: () => boolean;
  children: ReactNode;
  returnFocusId: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose), savingRef = useRef(saving);
  closeRef.current = onClose;
  savingRef.current = saving;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    if (contentRef.current) contentRef.current.scrollTop = 0;
    titleRef.current?.focus({ preventScroll: true });
    // Give an open popup its own same-document Back step. This catches browser
    // Back before a document/router transition can unmount an unsaved editor.
    const key = '__forrestWorkoutDialog', historyId = `${titleId}:${Date.now()}`;
    let active = true, added = false, poppedToBase = false;
    let baseState: Record<string, unknown>, popupUrl: string;
    queueMicrotask(() => {
      if (!active) return;
      baseState = { ...window.history.state };
      delete baseState[key];
      popupUrl = window.location.href;
      window.history.replaceState({ ...baseState, [key]: { id: historyId, entry: 'base' } }, '', popupUrl);
      window.history.pushState({ ...baseState, [key]: { id: historyId, entry: 'popup' } }, '', popupUrl);
      added = true;
    });
    const onBack = (event: PopStateEvent) => {
      const marker = event.state?.[key];
      if (marker?.id !== historyId) return;
      event.stopImmediatePropagation();
      if (marker.entry !== 'base') return; // Restoring after Keep editing.
      if (savingRef.current) { window.history.forward(); return; }
      poppedToBase = true;
      if (!closeRef.current()) {
        poppedToBase = false;
        window.history.forward();
      } else {
        window.history.replaceState(baseState, '', popupUrl);
      }
    };
    window.addEventListener('popstate', onBack, true);
    return () => {
      active = false;
      window.removeEventListener('popstate', onBack, true);
      if (added && !poppedToBase) queueMicrotask(() => {
        if (window.history.state?.[key]?.id !== historyId) return;
        const url = window.location.href, state = { ...window.history.state };
        delete state[key];
        const removePopupEntry = (event: PopStateEvent) => {
          if (event.state?.[key]?.id === historyId) {
            event.stopImmediatePropagation();
            window.history.replaceState(state, '', url);
          }
          window.removeEventListener('popstate', removePopupEntry, true);
        };
        window.addEventListener('popstate', removePopupEntry, true);
        window.history.back();
      });
      dialog.close();
      document.body.style.overflow = previousOverflow;
      const returnTarget = trigger?.isConnected && trigger !== document.body ? trigger : document.getElementById(returnFocusId);
      returnTarget?.focus({ preventScroll: true });
    };
  }, [returnFocusId, titleId]);

  return <dialog ref={dialogRef} className="workout-dialog" aria-labelledby={titleId}
    onCancel={event => {
      event.preventDefault();
      if (!saving) onClose();
    }}
    onClick={event => {
      if (saving || event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <header className="workout-dialog-heading">
      <div><h2 ref={titleRef} id={titleId} tabIndex={-1}>{title}</h2><p>{formatDate(date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p></div>
      <button type="button" className="icon-button" aria-label="Close workout" disabled={saving} onClick={onClose}><X size={21} aria-hidden="true" /></button>
    </header>
    <div ref={contentRef} className="workout-dialog-content">{children}</div>
  </dialog>;
}
