import { useEffect } from 'react';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

interface UseKeyboardShortcutsOptions {
  onCheckout: () => void;
  canCheckout: boolean;
}

/**
 * POS-scoped checkout shortcut: F9 (or a bare Enter when not typing in a field) submits
 * checkout. The global-search shortcut (`/` / Ctrl+K) is app-wide now — see
 * `useGlobalSearchShortcut`, mounted once in AppShell. Escape-closes-dialogs is already handled
 * natively by the base-ui Dialog primitive, so it isn't duplicated here.
 */
export function useKeyboardShortcuts({ onCheckout, canCheckout }: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const typing = isTypingTarget(event.target);

      if (event.key === 'F9' || (event.key === 'Enter' && !typing)) {
        if (canCheckout) {
          event.preventDefault();
          onCheckout();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCheckout, canCheckout]);
}
