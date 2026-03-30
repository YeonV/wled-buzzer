import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * rAF-driven elapsed timer that reads a start timestamp from gameStore.
 * Returns elapsed ms (0 when not running). Only the consuming component re-renders.
 * @param {string} startKey - gameStore key holding the start timestamp (e.g. '_timerStart', '_iterStart')
 * @param {string} [capKey] - optional gameStore key holding max elapsed ms (stops rAF when reached)
 */
export default function useElapsed(startKey, capKey) {
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef(null);

  const startTs = useGameStore(s => s[startKey]);
  const cap = useGameStore(s => capKey ? s[capKey] : null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => {
    if (!startTs) {
      stop();
      return;
    }

    const tick = () => {
      const el = Date.now() - startTs;
      if (cap && el >= cap) { setElapsed(cap); return; }
      setElapsed(el);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return stop;
  }, [startTs, cap, stop]);

  return startTs ? elapsed : 0;
}
