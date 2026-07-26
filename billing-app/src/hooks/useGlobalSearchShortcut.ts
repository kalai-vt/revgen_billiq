import { useEffect } from 'react';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * App-wide shortcut (mounted once in AppShell, so it works from every page, not just POS):
 * `/` or Ctrl/Cmd+K focuses the global search input.
 */
export function useGlobalSearchShortcut() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const typing = isTypingTarget(event.target);
      if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing)) {
        event.preventDefault();
        document.getElementById('global-search-input')?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
