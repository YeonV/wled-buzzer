import { Play, Square } from 'lucide-react';
import { useAudioStore }  from '../store/audioStore';
import { useSessionStore } from '../store/sessionStore';
import { useGameStore }   from '../store/gameStore';
import { IS_CONTROL } from '../utils/viewMode';
import { emitLoopControl } from '../services/socketActions';
import socket from '../services/socket';
import { useShallow } from 'zustand/shallow';

export default function LoopButtons() {
  const { playingLoop }               = useAudioStore(useShallow(({ playingLoop }) => ({ playingLoop })));
  const { availableLoops, loopNames } = useSessionStore(useShallow(({ availableLoops, loopNames }) => ({ availableLoops, loopNames })));
  const presetsReady                  = useGameStore(s => s.presetsReady);

  if (!IS_CONTROL || !presetsReady || availableLoops.length === 0) return null;

  return (
    <>
      {availableLoops.map((n) => (
        <button
          key={n}
          className={`btn btn--small ${playingLoop === n ? 'btn--accent' : 'btn--ghost'} btn--fw`}
          onClick={() => emitLoopControl(socket, playingLoop === n ? null : n)}
          aria-pressed={playingLoop === n}
        >
          {playingLoop === n
            ? <><Square size={14} /> {loopNames[n] || n}</>
            : <><Play  size={14} /> {loopNames[n] || n}</>}
        </button>
      ))}
    </>
  );
}
