import { useCallback, useRef, useState } from 'react';
import type { TouchEvent } from 'react';

interface SwipeDownOptions {
  onClose: () => void;
  threshold?: number;
}

/**
 * Geste mobile "balayer vers le bas" pour fermer une fiche (bottom sheet).
 * - S'active sur la poignée / le haut de la fiche ou lorsque le contenu interne est tout en haut (scrollTop <= 2).
 * - Suit le doigt en temps réel (translateY + atténuation de l'arrière-plan) et ferme au-delà du seuil ou sur un geste rapide.
 */
export function useSwipeDownToClose({ onClose, threshold = 95 }: SwipeDownOptions) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const startTimeRef = useRef(0);
  const eligibleRef = useRef(false);
  const draggingRef = useRef(false);

  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const onTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const target = e.target as HTMLElement | null;
    const isHandle = Boolean(target?.closest('[data-swipe-handle="true"]'));
    const scrollTop = scrollRef.current ? scrollRef.current.scrollTop : 0;

    if (!isHandle && scrollTop > 2) {
      eligibleRef.current = false;
      return;
    }

    eligibleRef.current = true;
    draggingRef.current = false;
    startYRef.current = touch.clientY;
    startXRef.current = touch.clientX;
    startTimeRef.current = Date.now();
  }, []);

  const onTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (!eligibleRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dy = touch.clientY - startYRef.current;
    const dx = Math.abs(touch.clientX - startXRef.current);

    if (!draggingRef.current) {
      // L'utilisateur scrolle vers le haut ou glisse horizontalement -> abandonner le swipe-to-close
      if (dy < 0 || dx > Math.abs(dy)) {
        eligibleRef.current = false;
        return;
      }
      if (dy > 10) {
        draggingRef.current = true;
        setIsDragging(true);
      } else {
        return;
      }
    }

    if (dy > 0) {
      setDragY(dy);
    } else {
      setDragY(0);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!eligibleRef.current) return;
    eligibleRef.current = false;

    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);

    const elapsed = Math.max(1, Date.now() - startTimeRef.current);
    const velocity = dragY / elapsed; // px / ms

    if (dragY >= threshold || (dragY >= 38 && velocity >= 0.55)) {
      setDragY(0);
      onClose();
    } else {
      setDragY(0);
    }
  }, [dragY, threshold, onClose]);

  const sheetStyle =
    dragY > 0 || isDragging
      ? {
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        }
      : undefined;

  const backdropOpacity = dragY > 0 ? Math.max(0.2, 1 - dragY / 380) : 1;

  return {
    scrollRef,
    sheetStyle,
    backdropOpacity,
    isDragging,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
    },
  };
}
