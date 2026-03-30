import React from 'react';
import { useSessionStore } from '../store/sessionStore';
import { X } from 'lucide-react';
import DevWidget from './DevWidget';

export default function DevDock() {
  const devmode = useSessionStore(s => s.devmode);
  const toggleDevMode = useSessionStore(s => s.toggleDevMode);

  if (!devmode) return null;

  return (
    <div className="dev-dock" role="region" aria-label="dev area">
      <button
        type="button"
        className="dev-dock-close btn btn--icon btn--ghost"
        onClick={toggleDevMode}
        aria-label="Close dev dock"
        title="Close dev dock"
      >
        <X size={16} />
      </button>

      <div className="dev-dock-inner">
        <div style={{ marginLeft: '1rem', flex: '1 1 auto' }}>
          <DevWidget />
        </div>
      </div>
    </div>
  );
}
