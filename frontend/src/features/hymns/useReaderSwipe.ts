import { useRef } from 'react';
import type { TouchEvent } from 'react';

type SwipeStart = { x: number; y: number; id: number; atTop: boolean };

export function useReaderSwipe({
  dismiss,
  turn,
  isolate = false,
}: {
  dismiss: () => void;
  turn?: (direction: -1 | 1, target: Element) => void;
  isolate?: boolean;
}) {
  const start = useRef<SwipeStart | null>(null);

  function onTouchStart(event: TouchEvent<HTMLElement>) {
    if (isolate) event.stopPropagation();
    if (event.touches.length !== 1) {
      start.current = null;
      return;
    }

    const touch = event.touches[0];
    const target = event.target instanceof Element ? event.target : event.currentTarget;
    start.current = {
      x: touch.clientX,
      y: touch.clientY,
      id: touch.identifier,
      atTop:
        (target.closest('.focus-reading')?.scrollTop ?? 0) <= 1 &&
        (target.closest('.pdf-viewport')?.scrollTop ?? 0) <= 1 &&
        (window.visualViewport?.offsetTop ?? 0) <= 1,
    };
  }

  function onTouchMove(event: TouchEvent<HTMLElement>) {
    if (isolate) event.stopPropagation();
    if (event.touches.length !== 1) start.current = null;
  }

  function onTouchEnd(event: TouchEvent<HTMLElement>) {
    if (isolate) event.stopPropagation();
    const origin = start.current;
    start.current = null;
    const touch = event.changedTouches[0];
    if (!origin || event.changedTouches.length !== 1 || touch.identifier !== origin.id) return;

    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (origin.atTop && dy >= 55 && dy > Math.abs(dx) * 1.4) {
      dismiss();
    } else if (turn && Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      turn(dx < 0 ? 1 : -1, event.target instanceof Element ? event.target : event.currentTarget);
    }
  }

  function onTouchCancel(event: TouchEvent<HTMLElement>) {
    if (isolate) event.stopPropagation();
    start.current = null;
  }

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
