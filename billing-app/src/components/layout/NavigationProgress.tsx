import { useEffect, useRef, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { useNavigation } from 'react-router-dom';

const SHOW_DELAY_MS = 150;
const MIN_VISIBLE_MS = 300;

/**
 * Thin top-of-viewport progress bar, the only *always-on* signal that something is happening —
 * route chunk loads and most page-level queries already render their own skeletons, but those
 * only appear once React has something to swap in, and only for the piece of UI that requested
 * the data. Backend requests on this app can take several seconds (see the Neon/cold-start
 * latency notes on the auth endpoints), so the moment between "user clicked" and "a skeleton
 * appears" was otherwise silent — this covers that gap for every route transition and every
 * react-query fetch/mutation, not just the ones an individual page remembered to handle.
 *
 * Delayed by SHOW_DELAY_MS so fast (cached) transitions never flash it, and once shown it stays
 * for at least MIN_VISIBLE_MS so it doesn't blink for a fetch that finishes right after the delay.
 */
export function NavigationProgress() {
  const navigation = useNavigation();
  const fetchCount = useIsFetching();
  const mutationCount = useIsMutating();
  const isBusy = navigation.state !== 'idle' || fetchCount > 0 || mutationCount > 0;

  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (isBusy) {
      const timer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, SHOW_DELAY_MS);
      return () => clearTimeout(timer);
    }

    if (!visible) return;
    const elapsed = shownAtRef.current ? Date.now() - shownAtRef.current : MIN_VISIBLE_MS;
    const remaining = Math.max(MIN_VISIBLE_MS - elapsed, 0);
    const timer = setTimeout(() => {
      setVisible(false);
      shownAtRef.current = null;
    }, remaining);
    return () => clearTimeout(timer);
  }, [isBusy, visible]);

  if (!visible) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading"
      aria-valuetext="Loading"
      className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-primary/20"
    >
      <div className="h-full w-1/3 animate-[navigation-progress_1.1s_ease-in-out_infinite] bg-primary" />
    </div>
  );
}
