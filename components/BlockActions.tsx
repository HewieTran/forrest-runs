'use client';
import { useEffect, useRef, useState } from 'react';
import { Archive, CheckCircle2, Play, RotateCcw, X } from 'lucide-react';
import { BLOCK_TRANSITIONS, STATUS_LABELS } from '../lib/blocks';
import type { BlockStatus, Plan } from '../lib/domain';

const actions = {
  active: { label: 'Activate block', Icon: Play, description: 'Make this your current training block. Workout results stay as recorded.' },
  completed: { label: 'Mark completed', Icon: CheckCircle2, description: 'Close this training block as completed. This does not mark individual workouts done or assert that your race goal was achieved.' },
  archived: { label: 'Archive block', Icon: Archive, description: 'Move this block to your archive. All workouts, notes, and results remain available. Archiving does not mean the goal was achieved.' },
  draft: { label: 'Move to drafts', Icon: RotateCcw, description: 'Reopen this block as a draft. Its workouts and results stay intact; it will not become active automatically.' },
};
export default function BlockActions({ plan, activeBlock, onChanged, disabled, preview = false }: {
  plan: Plan; activeBlock: Pick<Plan, 'id' | 'raceName'> | null;
  onChanged: (block: Plan) => void; disabled: boolean; preview?: boolean;
}) {
  const [target, setTarget] = useState<BlockStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDialogElement>(null);
  const blocked = target === 'active' && activeBlock && activeBlock.id !== plan.id;
  useEffect(() => {
    if (target) ref.current?.showModal();
    else ref.current?.close();
  }, [target]);
  async function apply() {
    if (!target || blocked) return;
    setSaving(true); setError('');
    try {
      let block: Plan;
      if (preview) block = { ...plan, status: target, version: plan.version + 1, updatedAt: new Date().toISOString() };
      else {
        const response = await fetch(`/api/blocks/${encodeURIComponent(plan.id)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: target, version: plan.version }),
        });
        const result = await response.json() as { block: Plan; error?: string };
        if (!response.ok) throw new Error(result.error || 'The block could not be updated.');
        block = result.block;
      }
      onChanged(block); setTarget(null);
    } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  }
  return <>
    <div className="block-action-buttons" aria-label="Block status actions">
      {BLOCK_TRANSITIONS[plan.status].filter(status => status !== 'active' || !plan.setup).map(status => {
        const { Icon, label } = actions[status];
        return <button className={`button ${status === 'active' ? 'primary' : ''}`} key={status} disabled={disabled} onClick={() => { setError(''); setTarget(status); }}><Icon size={15} />{label}</button>;
      })}
    </div>
    <dialog ref={ref} className="settings-dialog lifecycle-dialog" aria-labelledby="lifecycle-title" onCancel={event => {
      if (saving) event.preventDefault(); else setTarget(null);
    }}>
      <div className="dialog-heading"><h2 id="lifecycle-title">{target ? actions[target].label : 'Block status'}</h2><button className="icon-button" aria-label="Close block status" disabled={saving} onClick={() => setTarget(null)}><X size={17} /></button></div>
      <p className="block-dialog-name">{plan.raceName}</p>
      <p className="block-dialog-description">{target && actions[target].description}</p>
      {blocked && <div className="block-callout"><strong>{activeBlock.raceName} is currently active.</strong><p>Complete or archive that block before activating this draft. If it changed in another tab, reload this page.</p><a className="text-link" href={preview ? '/preview?blockId=example' : `/blocks/${encodeURIComponent(activeBlock.id)}`}>Open active block →</a></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="block-dialog-actions"><button className="button" disabled={saving} onClick={() => setTarget(null)}>Cancel</button>
        {!blocked && <button className="button primary" disabled={saving} onClick={apply}>{saving ? 'Saving…' : target ? actions[target].label : 'Confirm'}</button>}
      </div>
      {error && <p className="small-muted">Your entries are still here. Reload this page to get the latest block status before retrying.</p>}
    </dialog>
  </>;
}

export function BlockStatusBadge({ status }: { status: BlockStatus }) {
  return <span className={`block-status block-status-${status}`}><span aria-hidden="true" />{STATUS_LABELS[status]}</span>;
}
