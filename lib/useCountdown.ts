'use client';

import { useEffect, useState } from 'react';

/**
 * Milliseconds remaining until `targetIso`, ticking every second — the same live-countdown shape
 * app/daily-challenge/page.tsx already hand-rolls for its own 60-second answer timer, pulled out
 * so the Daily Challenge's "next attempt" timer (dashboard card and attempt page alike) doesn't
 * duplicate the interval bookkeeping. Returns null while there is no target to count down to.
 *
 * `onReachZero`, when given, fires once when the countdown first hits 0 — for a caller (the
 * attempt page) that wants to re-fetch from the server at that point rather than trust the local
 * clock, the same "server's version wins" reasoning the page's own deadline countdown already
 * follows. Intentionally not called on every render once at zero, only on the transition.
 */
export function useCountdown(targetIso: string | null | undefined, onReachZero?: () => void): number | null {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!targetIso) {
      setRemainingMs(null);
      return;
    }

    const target = new Date(targetIso).getTime();
    let reachedZero = false;

    function tick() {
      const remaining = Math.max(0, target - Date.now());
      setRemainingMs(remaining);
      if (remaining <= 0 && !reachedZero) {
        reachedZero = true;
        onReachZero?.();
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // Deliberately keyed on targetIso alone — onReachZero isn't a dep, so a caller passing a new
    // function identity each render doesn't restart the interval.
  }, [targetIso]);

  return remainingMs;
}
