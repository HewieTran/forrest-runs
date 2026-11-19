'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { formatDate } from '../lib/domain';

export default function WorkoutDialog({ title, date, saving, onClose, children }: {
  title: string;
  date: string;
  saving: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    if (contentRef.current) contentRef.current.scrollTop = 0;
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

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
