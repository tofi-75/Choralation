import { useEffect, useEffectEvent } from 'react';
import type { RefObject } from 'react';

type Direction = -1 | 1;
type SwipeStart = {
  x: number;
  y: number;
  id: number;
  target: Element;
  canScrollUp: boolean;
  canScrollDown: boolean;
  nativePan: boolean;
};

const pageThreshold = 55;
const dominance = 1.4;

export function useReaderSwipe(
  readerTarget: HTMLElement | RefObject<HTMLElement | null> | null,
  {
    enabled = true,
    dismiss,
    turnPage,
    turnHorizontal,
    horizontalThreshold = pageThreshold,
  }: {
    enabled?: boolean;
    dismiss?: () => void;
    turnPage?: (direction: Direction) => void;
    turnHorizontal?: (direction: Direction, target: Element) => void;
    horizontalThreshold?: number;
  },
) {
  const canDismiss = Boolean(dismiss);
  const canTurnPage = Boolean(turnPage);
  const canTurnHorizontal = Boolean(turnHorizontal);
  const exit = useEffectEvent(() => dismiss?.());
  const page = useEffectEvent((direction: Direction) => turnPage?.(direction));
  const horizontal = useEffectEvent((direction: Direction, target: Element) =>
    turnHorizontal?.(direction, target),
  );

  useEffect(() => {
    const reader = readerTarget instanceof HTMLElement ? readerTarget : readerTarget?.current;
    if (!enabled || !reader) return;

    let start: SwipeStart | null = null;
    let ignoreClickUntil = 0;
    const allowClick = () => {
      ignoreClickUntil = 0;
    };
    const reset = () => {
      start = null;
    };

    function cancelMultiTouch(event: TouchEvent) {
      if (event.touches.length > 1) reset();
    }

    function onStart(event: TouchEvent) {
      reset();
      allowClick();
      const target = event.target;
      if (
        event.touches.length !== 1 ||
        (window.visualViewport?.scale ?? 1) > 1.01 ||
        !(target instanceof Element) ||
        target.closest('[data-reader-swipe]') !== reader ||
        target.closest('button:not(.pdf-preview), a, select, input, textarea')
      ) {
        return;
      }

      const touch = event.touches[0];
      let canScrollUp = false;
      let canScrollDown = false;
      for (let element: Element | null = target; element; element = element.parentElement) {
        if (
          element.matches(
            '.pdf-viewport, .focus-reading, .focus-notes, .lyric-pages, .material-error',
          )
        ) {
          canScrollUp ||= element.scrollTop > 1;
          canScrollDown ||= element.scrollHeight - element.clientHeight - element.scrollTop > 1;
        }
        if (element.matches('.pdf-fullscreen, .mass-focus')) break;
      }

      start = {
        x: touch.clientX,
        y: touch.clientY,
        id: touch.identifier,
        target,
        canScrollUp,
        canScrollDown,
        nativePan: false,
      };
    }

    function onMove(event: TouchEvent) {
      if (event.touches.length !== 1) reset();
      const touch = event.touches[0];
      if (!start || start.nativePan || start.id !== touch?.identifier) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) return;

      const verticalSwipe = Math.abs(dy) >= Math.abs(dx) * dominance;
      const horizontalSwipe = Math.abs(dx) >= Math.abs(dy) * dominance;
      if (verticalSwipe && (dy > 0 ? start.canScrollUp : start.canScrollDown)) {
        // Native panning owns this gesture, even if the page reaches its edge.
        start.nativePan = true;
      } else if (
        (verticalSwipe && (canTurnPage || (dy > 0 && canDismiss))) ||
        (horizontalSwipe && canTurnHorizontal)
      ) {
        if (event.cancelable) event.preventDefault();
      }
    }

    function onEnd(event: TouchEvent) {
      const origin = start;
      reset();
      const touch = event.changedTouches[0];
      if (
        !origin ||
        origin.nativePan ||
        event.touches.length ||
        event.changedTouches.length !== 1 ||
        touch?.identifier !== origin.id ||
        (window.visualViewport?.scale ?? 1) > 1.01
      ) {
        return;
      }

      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      const vertical =
        Math.abs(dy) >= pageThreshold &&
        Math.abs(dy) >= Math.abs(dx) * dominance &&
        !(dy > 0 ? origin.canScrollUp : origin.canScrollDown);
      const horizontalSwipe =
        canTurnHorizontal &&
        Math.abs(dx) >= horizontalThreshold &&
        Math.abs(dx) >= Math.abs(dy) * dominance;
      if (!vertical && !horizontalSwipe) return;

      const dialog = origin.target.closest('.pdf-fullscreen, .mass-focus');
      const height = dialog?.clientHeight || reader?.clientHeight || window.innerHeight;
      const exitThreshold = Math.max(140, Math.min(300, height * 0.38));
      const exitSwipe = canDismiss && vertical && dy >= exitThreshold;
      if (!exitSwipe && !(vertical && canTurnPage) && !horizontalSwipe) return;

      event.preventDefault();
      ignoreClickUntil = performance.now() + 500;
      if (exitSwipe) exit();
      else if (vertical) page(dy < 0 ? 1 : -1);
      else horizontal(dx < 0 ? 1 : -1, origin.target);
    }

    function onClick(event: MouseEvent) {
      if (event.detail && performance.now() < ignoreClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        ignoreClickUntil = 0;
      }
    }

    window.addEventListener('touchstart', cancelMultiTouch, { capture: true, passive: true });
    reader.addEventListener('touchstart', onStart, { passive: true });
    reader.addEventListener('touchmove', onMove, { passive: false });
    reader.addEventListener('touchend', onEnd, { passive: false });
    reader.addEventListener('touchcancel', reset);
    reader.addEventListener('pointerdown', allowClick, true);
    reader.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('touchstart', cancelMultiTouch, true);
      reader.removeEventListener('touchstart', onStart);
      reader.removeEventListener('touchmove', onMove);
      reader.removeEventListener('touchend', onEnd);
      reader.removeEventListener('touchcancel', reset);
      reader.removeEventListener('pointerdown', allowClick, true);
      reader.removeEventListener('click', onClick, true);
    };
  }, [readerTarget, enabled, canDismiss, canTurnPage, canTurnHorizontal, horizontalThreshold]);
}
