import { useEffect } from 'react';

const PAUSE_MS = 1500;

/**
 * Cinematic auto-scroll loop for the stats/round-history screen on the display client.
 * Pauses at top, scrolls to bottom at a constant speed, pauses, scrolls back to top, repeats.
 *
 * @param {boolean}              active  - Whether scrolling should be running (e.g. statsOpen && !IS_CONTROL)
 * @param {React.RefObject<HTMLElement>} ref - Ref to the scrollable container
 */
export function useCinematicScroll(active, ref) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    el.scrollTop = 0;
    let rafId;
    let phase     = 'pause-top';
    let phaseStart = performance.now();
    let speed     = 1;

    const tick = (now) => {
      const elapsed = now - phaseStart;
      if (phase === 'pause-top') {
        if (elapsed >= PAUSE_MS) {
          const maxScroll = el.scrollHeight - el.clientHeight;
          speed = maxScroll > 0 ? maxScroll / 30 : 1; // traverse in 30 s
          phase = 'scroll';
          phaseStart = now;
        }
      } else if (phase === 'scroll') {
        el.scrollTop = (elapsed / 1000) * speed;
        if (el.scrollTop >= el.scrollHeight - el.clientHeight - 1) {
          phase = 'pause-bottom';
          phaseStart = now;
        }
      } else {
        if (elapsed >= PAUSE_MS) {
          el.scrollTop = 0;
          phase = 'pause-top';
          phaseStart = now;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, ref]);
}
