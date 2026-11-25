import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Accessibilité des feuilles / modales : piège le focus clavier à l'intérieur
 * du panneau, place le focus sur le premier élément utile à l'ouverture, et
 * restitue le focus à l'élément déclencheur à la fermeture.
 *
 * À combiner avec `role="dialog"` + `aria-modal="true"` + `aria-labelledby`.
 */
export function useDialogA11y<T extends HTMLElement>(
  open: boolean,
  containerRef: RefObject<T | null>
) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    if (!container) return;

    // Focus initial : premier élément focusable, sinon le conteneur lui-même
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    const first = focusables()[0];
    if (first) {
      first.focus({ preventScroll: true });
    } else {
      container.setAttribute('tabindex', '-1');
      container.focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === firstItem || active === container)) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const restoreTo = previouslyFocused.current;
      if (restoreTo && typeof restoreTo.focus === 'function' && document.contains(restoreTo)) {
        restoreTo.focus({ preventScroll: true });
      }
    };
  }, [open, containerRef]);
}
