import { Play, Square } from 'lucide-react';
import { useSessionStore } from '../store/sessionStore';
import { useGameStore }   from '../store/gameStore';
import { IS_CONTROL } from '../utils/viewMode';
import { emitVideoControl } from '../services/socketActions';
import socket from '../services/socket';
import { useShallow } from 'zustand/shallow';

export default function VideoButtons() {
  const { availableVideos, playingVideo } = useSessionStore(
    useShallow(({ availableVideos, playingVideo }) => ({ availableVideos, playingVideo }))
  );
  const presetsReady = useGameStore(s => s.presetsReady);

  if (!IS_CONTROL || !presetsReady || availableVideos.length === 0) return null;

  const videoUrl = (v) => {
    if (v.urlPrefix) return `${v.urlPrefix}/${encodeURIComponent(v.file)}`;
    const base = v.source === 'avatar'
      ? `/uploads/packs/${encodeURIComponent(v.pack)}/videos`
      : `/uploads/packs/${encodeURIComponent(v.pack)}/questions/videos`;
    return `${base}/${encodeURIComponent(v.file)}`;
  };

  return (
    <>
      {availableVideos.map((v) => {
        const url     = videoUrl(v);
        const active  = playingVideo === url;
        const label   = v.file.replace(/^\d+_/, '').replace(/\.[^.]+$/, '');
        return (
          <button
            key={`${v.source}-${v.file}`}
            className={`btn btn--small ${active ? 'btn--accent' : 'btn--ghost'} btn--fw`}
            onClick={() => emitVideoControl(socket, active ? null : url)}
            aria-pressed={active}
          >
            {active
              ? <><Square size={14} /> {label}</>
              : <><Play  size={14} /> {label}</>}
          </button>
        );
      })}
    </>
  );
}
