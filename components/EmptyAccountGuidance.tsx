'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TARGET = 'create-training-block';
type Position = { left: number; top: number; width: number; target: { left: number; top: number; width: number; height: number } };

export default function EmptyAccountGuidance({ sessionKey }: { sessionKey: string }) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const note = useRef<HTMLElement>(null);
  useEffect(() => {
    try { setVisible(sessionStorage.getItem(sessionKey) !== 'dismissed'); }
    catch { setVisible(true); }
  }, [sessionKey]);
  const dismiss = useCallback((returnFocus = true) => {
    try { sessionStorage.setItem(sessionKey, 'dismissed'); } catch { /* Storage is optional. */ }
    setVisible(false);
    if (returnFocus) document.getElementById(TARGET)?.focus({ preventScroll: true });
  }, [sessionKey]);

  useEffect(() => {
    if (!visible) return;
    const target = document.getElementById(TARGET);
    if (!target) return;
    let frame = 0;
    function place() {
      if (!target) return;
      const box = target.getBoundingClientRect();
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
      const offsetLeft = viewport?.offsetLeft ?? 0, offsetTop = viewport?.offsetTop ?? 0;
      // Hide annotations while the target is offscreen; never point at another control.
      if (box.bottom < offsetTop || box.top > offsetTop + height || !box.width) { setPosition(null); return; }
      const noteWidth = Math.min(350, width - 32), noteHeight = note.current?.offsetHeight ?? 158;
      const left = Math.max(offsetLeft + 16, Math.min(box.right - noteWidth, offsetLeft + width - noteWidth - 16));
      const below = box.bottom + 72;
      const top = below + noteHeight <= offsetTop + height - 16 ? below : Math.max(offsetTop + 16, box.top - noteHeight - 62);
      setPosition({ left, top, width: noteWidth, target: { left: box.left, top: box.top, width: box.width, height: box.height } });
    }
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') dismiss(); }
    function start() { dismiss(false); }
    place();
    const observer = new ResizeObserver(schedule);
    observer.observe(target);
    if (note.current) observer.observe(note.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    window.addEventListener('keydown', escape);
    target.addEventListener('click', start);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('keydown', escape);
      target.removeEventListener('click', start);
    };
  }, [visible, dismiss]);

  if (!visible) return null;
  const target = position?.target;
  const above = position && target ? position.top < target.top : false;
  const endX = target ? target.left + target.width * .58 : 0;
  const endY = target ? (above ? target.top - 9 : target.top + target.height + 9) : 0;
  const startX = position ? position.left + position.width * .65 : 0;
  const startY = position ? (above ? position.top + (note.current?.offsetHeight ?? 158) + 8 : position.top - 8) : 0;
  const bend = above ? 1 : -1;
  return createPortal(<div className="training-guidance-overlay" style={{ visibility: position ? 'visible' : 'hidden' }}>
    {target && <div className="guidance-spotlight" aria-hidden="true" style={{ left: target.left - 6, top: target.top - 6, width: target.width + 12, height: target.height + 12 }} />}
    <svg className="guidance-arrow" aria-hidden="true"><path d={`M ${startX} ${startY} C ${startX - 18} ${startY + bend * 58}, ${endX + 19} ${endY - bend * 50}, ${endX} ${endY} M ${endX - 12} ${endY - bend * 17} L ${endX} ${endY} L ${endX + 10} ${endY - bend * 20}`} /></svg>
    <aside ref={note} className="empty-account-guidance" aria-labelledby="empty-guidance-title" style={position ? { left: position.left, top: position.top, width: position.width } : undefined}>
      <svg className="guidance-sketch" viewBox="0 0 350 158" preserveAspectRatio="none" aria-hidden="true"><path d="M8 8 Q166 1 342 9 L345 148 Q183 157 6 148 Z" /><path d="M4 13 Q165 7 346 13 M12 153 Q173 148 339 152" /></svg>
      <button className="guidance-dismiss" type="button" aria-label="Dismiss training guidance for this visit" onClick={() => dismiss()}><svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><path d="m5 5 14 14M18 5 5 19" /></svg></button>
      <span className="guidance-kicker">A little nudge…</span>
      <h2 id="empty-guidance-title">Your next adventure<br />starts right here.</h2>
      <p>Create your first training block.</p>
    </aside>
  </div>, document.body);
}
