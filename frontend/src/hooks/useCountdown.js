import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * rAF-driven countdown timer that reads start timestamp + duration from gameStore.
 * Returns remaining ms (null when not running, 0 when expired).
 * Only the consuming component re-renders — no Zustand state updates.
 */
export default function useCountdown(startKey, durationKey) {
  const [remaining, setRemaining] = useState(null);
  const rafRef = useRef(null);

  const startTs = useGameStore(s => s[startKey]);
  const duration = useGameStore(s => s[durationKey]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => {
    if (!startTs || !duration) {
      stop();
      return;
    }

    const tick = () => {
      const elapsed = Date.now() - startTs;
      const rem = Math.max(0, duration - elapsed);
      setRemaining(rem);
      if (rem > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return stop;
  }, [startTs, duration, stop]);

  return (startTs && duration) ? remaining : null;
}
