'use client';
import { useEffect, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { Plan } from '../lib/domain';
import type { BlockDeletionPreview } from '../lib/blocks';

type SelectedBlock = Pick<Plan, 'id' | 'raceName' | 'status' | 'version'>;
export default function DeleteBlockButton({ block, disabled = false, preview = false, onDeleted }: {
  block: SelectedBlock; disabled?: boolean; preview?: boolean; onDeleted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const [details, setDetails] = useState<BlockDeletionPreview | null>(null), [confirmation, setConfirmation] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    dialog.current?.showModal();
    const abort = new AbortController();
    setLoading(true); setError(''); setConfirmation(''); setDetails(null);
    async function load() {
      try {
        if (preview) { setDetails({ id: block.id, name: block.raceName, status: block.status, version: block.version, workoutCount: 0, restDayCount: 0, revision: '0'.repeat(64) }); return; }
        const response = await fetch(`/api/blocks/${encodeURIComponent(block.id)}`, { cache: 'no-store', signal: abort.signal });
        const result = await response.json() as { deletion?: BlockDeletionPreview; error?: string };
        if (!response.ok || !result.deletion) throw new Error(result.error || 'Deletion details could not be loaded.');
        if (!abort.signal.aborted) setDetails(result.deletion);
      } catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : 'Please try again.'); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    }
    void load();
    return () => abort.abort();
  }, [open, block.id, block.raceName, block.status, block.version, preview]);
  async function remove() {
    if (!details || confirmation !== details.name || details.status === 'active') return;
    setSaving(true); setError('');
    try {
      if (!preview) {
        const response = await fetch(`/api/blocks/${encodeURIComponent(block.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: details.version, revision: details.revision, confirmation }) });
        const result = await response.json() as { deleted?: boolean; error?: string };
        if (!response.ok || !result.deleted) throw new Error(result.error || 'The block could not be deleted.');
      }
      setOpen(false); onDeleted();
    } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  }
  return <>
    <button className="button delete-block-trigger" disabled={disabled} onClick={() => setOpen(true)} aria-label={`Delete ${block.raceName}`}><Trash2 size={15} />Delete block</button>
    <dialog ref={dialog} className="settings-dialog lifecycle-dialog delete-block-dialog" aria-labelledby={`delete-title-${block.id}`} onCancel={event => { event.preventDefault(); if (!saving) setOpen(false); }}>
      <div className="dialog-heading"><h2 id={`delete-title-${block.id}`}>Permanently delete block?</h2><button className="icon-button" aria-label="Close deletion" disabled={saving} onClick={() => setOpen(false)}><X size={17} /></button></div>
      <p className="block-dialog-name">{details?.name ?? block.raceName}</p>
      {loading && <p role="status">Loading the latest block details…</p>}
      {details && <>
        <p className="block-dialog-description">This permanently removes the block, its intake and generated plan, all {details.workoutCount} workouts and results, and {details.restDayCount} rest days from the app. This cannot be undone in the app.</p>
        <p className="setup-footnote">API usage records are retained for spending limits; they contain no workout or fitness details.</p>
        {!preview && <p><a className="text-link" href={`/api/export?blockId=${encodeURIComponent(block.id)}`}>Download a block backup first</a></p>}
        {details.status === 'active' ? <p className="block-callout">Archive this active block first, then reopen Delete block. Your current training cannot be deleted while active.</p> : <label className="delete-block-confirmation">Type <strong>{details.name}</strong> to confirm<input autoComplete="off" spellCheck={false} value={confirmation} maxLength={120} disabled={saving} onChange={event => setConfirmation(event.target.value)} /></label>}
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="block-dialog-actions"><button className="button" disabled={saving} onClick={() => setOpen(false)}>Cancel</button><button className="button delete-block-confirm" disabled={saving || loading || !details || details.status === 'active' || confirmation !== details.name} onClick={() => void remove()}>{saving ? 'Deleting…' : 'Permanently delete'}</button></div>
    </dialog>
  </>;
}
