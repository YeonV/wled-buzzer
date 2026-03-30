import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * RAF-driven countdown that tracks time since a buzzer was pressed.
 * Writes `buzzCountdown` (ms remaining) into gameStore.
 * Cancels itself when there is no winner, already a verdict, or autoWrongMs is 0.
 */
export function useBuzzCountdown() {
  const winner      = useGameStore(s => s.winner);
  const autoWrongMs = useGameStore(s => s.autoWrongMs);
  const verdict     = useGameStore(s => s.verdict);
  const startRef = useRef(null);
  const rafRef   = useRef(null);

  useEffect(() => {
    if (!winner || !autoWrongMs || verdict) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      useGameStore.setState({ buzzCountdown: null });
      return;
    }

    startRef.current = Date.now();
    const tick = () => {
      const remaining = Math.max(0, autoWrongMs - (Date.now() - startRef.current));
      useGameStore.setState({ buzzCountdown: remaining });
      if (remaining > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [winner, autoWrongMs, verdict]);
}
