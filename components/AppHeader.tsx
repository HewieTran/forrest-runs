import { Activity, Download, Layers3, LockKeyhole } from 'lucide-react';

export default function AppHeader({ displayName, preview = false }: { displayName: string; preview?: boolean }) {
  const library = preview ? '/preview?view=blocks' : '/blocks';
  return <header className="app-header"><div className="header-inner">
    <a href={library} className="brand"><span className="brand-icon"><Activity size={23} /></span><span>Forrest Runs</span></a>
    <div className="header-actions">
      <a className="header-library-link" aria-label="Training blocks" href={library}><Layers3 size={16} /><span>Training blocks</span></a>
      {preview && <span className="preview-tag">Design preview</span>}
      <span className="private-label"><LockKeyhole size={13} /> Private training log</span>
      <a className="button quiet export-button" href={preview ? undefined : '/api/export'} aria-disabled={preview}><Download size={16} /><span>Export backup</span></a>
      <span className="avatar" title={displayName}>{displayName[0]?.toUpperCase() || 'R'}</span>
    </div>
  </div></header>;
}
