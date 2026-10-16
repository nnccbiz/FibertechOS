'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Keeps an element mounted long enough to play its exit transition.
 *
 *   const { mounted, shown } = usePresence(open, 150);
 *   if (!mounted) return null;
 *   <div data-shown={shown}>…   // CSS: opacity/transform keyed on data-shown
 *
 * `mounted` flips true immediately on open; `shown` flips true one frame
 * later so the enter transition has a starting style to run from. On close
 * `shown` drops at once (exit transition plays) and `mounted` follows after
 * `exitMs`. Reopening mid-exit cancels the unmount — transitions retarget.
 */
export function usePresence(open: boolean, exitMs = 150) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (open) {
      setMounted(true);
      // Two frames: the first lets the browser paint the starting style, the
      // second flips it — one rAF fires before that paint and the transition
      // would never start.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setShown(true)); });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }
    setShown(false);
    timer.current = setTimeout(() => setMounted(false), exitMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [open, exitMs]);

  return { mounted, shown };
}
