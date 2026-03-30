import { useEffect, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';

export default function FullscreenButton({ className = 'btn btn--icon btn--small btn--ghost', iconSize = 13 }) {
  const [isFs, setIsFs] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const handler = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  const toggle = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  };
  return (
    <button className={className} onClick={toggle} title={isFs ? 'Exit fullscreen' : 'Enter fullscreen'}>
      {isFs ? <Minimize size={iconSize} /> : <Maximize size={iconSize} />}
    </button>
  );
}
