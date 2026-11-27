import { Layers3 } from 'lucide-react';
import { AccountAvatar } from './SessionActions';
import { AppearanceButton } from './AppearancePicker';
import BrandIcon from './BrandIcon';

export default function AppHeader({ displayName, preview = false }: { displayName: string; preview?: boolean }) {
  const library = preview ? '/preview?view=blocks' : '/blocks';
  return <header className="app-header"><div className="header-inner">
    <a href={preview ? library : '/'} className="brand"><BrandIcon /><span className="brand-wordmark">Forrest Runs</span></a>
    <div className="header-actions">
      <a className="button header-library-link" aria-label="Training blocks" href={library}><Layers3 size={16} /><span>Training blocks</span></a>
      {preview && <span className="preview-tag">Design preview</span>}
      {!preview && <AppearanceButton />}
      <AccountAvatar displayName={displayName} preview={preview} />
    </div>
  </div></header>;
}
