'use client';
export default function TimePartsInput({ id, label, parts, onChange, maxHours = 168, pace = false, invalid = false, describedBy, name }: {
  id: string; label: string; parts: string[]; onChange: (parts: string[]) => void; maxHours?: number; pace?: boolean; invalid?: boolean; describedBy?: string; name?: string;
}) {
  const labels = pace ? ['Minutes', 'Seconds'] : ['Hours', 'Minutes', 'Seconds'];
  return <div className="measurement-time-input" role="group" aria-label={label}>
    {labels.map((part, index) => <label key={part}><span>{part}</span><select id={index === 0 ? id : `${id}-${index}`} name={index === 0 ? name : undefined}
      aria-label={`${label} ${part.toLowerCase()}`} aria-invalid={invalid} aria-describedby={describedBy} value={parts[index] ?? ''}
      onChange={event => onChange(labels.map((_, i) => i === index ? event.target.value : parts[i] ?? ''))}>
      <option value="">—</option>{Array.from({ length: (index === 0 ? pace ? 1440 : maxHours : 59) + 1 }, (_, n) => <option key={n} value={String(n)}>{n}</option>)}
    </select></label>)}
    <button type="button" className="time-clear" aria-label={`Clear ${label}`} onClick={() => onChange(labels.map(() => ''))}>Clear</button>
  </div>;
}
