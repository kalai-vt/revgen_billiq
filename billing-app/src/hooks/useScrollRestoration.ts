import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Creates an independent scroll-restoration hook, keyed by react-router's history-entry key
 * (not pathname) so that navigating back to an earlier entry restores where the user left off,
 * while a fresh navigation to the same path starts at the top — matching native browser
 * scroll-restoration semantics. Each call site that scrolls independently (AppShell's `<main>`
 * fallback vs. a module page's own scroll region) needs its own instance — sharing one map
 * across two different scrollable elements for the same route would let one clobber the other.
 */
export function createScrollRestoration() {
  const positions = new Map<string, number>();

  return function useScrollRestoration<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const location = useLocation();

    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      // Direct scrollTop assignment is always instant, regardless of `scroll-smooth` — a
      // route change should snap to the remembered position, not animate to it.
      el.scrollTop = positions.get(location.key) ?? 0;
    }, [location.key]);

    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      function handleScroll() {
        positions.set(location.key, el!.scrollTop);
      }
      el.addEventListener('scroll', handleScroll, { passive: true });
      return () => el.removeEventListener('scroll', handleScroll);
    }, [location.key]);

    return ref;
  };
}
