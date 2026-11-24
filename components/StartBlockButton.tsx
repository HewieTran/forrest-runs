'use client';
import { useId, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import type { Plan } from '../lib/domain';

// Both library and overview use the existing owned/versioned status endpoint.
export default function StartBlockButton({ plan, activeBlock, disabled = false, preview = false, onStarted, onBusyChange }: {
  plan: Pick<Plan, 'id' | 'version'>; activeBlock?: Pick<Plan, 'id' | 'raceName'> | null;
  disabled?: boolean; preview?: boolean; onStarted: (plan: Plan) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const inFlight = useRef(false), errorId = useId();
  const blocked = activeBlock && activeBlock.id !== plan.id;
  async function start() {
    if (disabled || inFlight.current || blocked) return;
    inFlight.current = true; setBusy(true); setError(''); onBusyChange?.(true);
    try {
      if (preview) throw new Error('This is a design preview. Start a saved block in your account to continue.');
      const response = await fetch(`/api/blocks/${encodeURIComponent(plan.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active', version: plan.version }),
      });
      const result = await response.json() as { block?: Plan; error?: string };
      if (!response.ok || !result.block) throw new Error(result.error || 'Your block could not be started. Reload to check its latest status.');
      onStarted(result.block);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Your block could not be started. Please try again.'); }
    finally { inFlight.current = false; setBusy(false); onBusyChange?.(false); }
  }
  if (blocked) return <p className="start-block-message">{activeBlock.raceName} is already in progress. Complete or archive it first. <a href={`/blocks/${encodeURIComponent(activeBlock.id)}`}>Open current block</a></p>;
  return <div className="start-block-control">
    <button type="button" className="button primary" disabled={disabled || busy} onClick={start} aria-describedby={error ? errorId : undefined}><Play size={16} aria-hidden="true" />{busy ? 'Starting…' : 'Start this block'}</button>
    {error && <p id={errorId} className="start-block-message form-error" role="alert">{error} <a href="">Reload latest status</a></p>}
  </div>;
}
