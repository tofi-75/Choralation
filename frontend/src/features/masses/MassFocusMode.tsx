/** A read-only performance session; each selection retains its program position. */
import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import type { Ref, RefObject } from 'react';
import { flushSync } from 'react-dom';
import type { Mass } from '../../api/masses';
import { HymnMaterial } from '../hymns/HymnMaterial';
import { HymnMusicalSummary } from '../hymns/HymnMusicalSummary';
import type { LyricPageNavigation, LyricSize } from '../hymns/FocusLyrics';
import { useReaderFullscreen } from '../hymns/useReaderFullscreen';
import { useReaderSwipe } from '../hymns/useReaderSwipe';

import type { PdfFit } from '../hymns/PdfSheet';

type Selection = Mass['program'][number];

function useScreenAwake() {
  useEffect(() => {
    let active = true;
    let lock: WakeLockSentinel | null = null;
    let requesting = false;
    const acquire = async () => {
      if (
        !active ||
        requesting ||
        document.visibilityState !== 'visible' ||
        (lock && !lock.released) ||
        !navigator.wakeLock
      )
        return;
      requesting = true;
      try {
        const acquired = await navigator.wakeLock.request('screen');
        if (!active) {
          await acquired.release();
          return;
        }
        lock = acquired;
        acquired.addEventListener('release', () => {
          if (lock === acquired) lock = null;
        });
      } catch {
        // Focus remains usable when the browser declines the wake lock.
      } finally {
        requesting = false;
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, []);
}

function FocusSession({
  selections: initialSelections,
  rootRef,
  closeFocus,
  initialSelectionId,
  restoreFocus,
}: {
  selections: Selection[];
  rootRef: RefObject<HTMLDivElement | null>;
  closeFocus: () => void;
  initialSelectionId: number | null;
  restoreFocus: (event: Event) => void;
}) {
  // Keep the reading sequence stable if another session edits/refetches the Mass.
  const [selections] = useState(initialSelections);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      initialSelections.findIndex((row) => row.id === initialSelectionId),
    ),
  );
  const [pages, setPages] = useState<Record<number, number>>({});
  const [lyricSize, setLyricSize] = useState<LyricSize>('standard');
  const [lyricPositions, setLyricPositions] = useState<Record<number, number>>({});
  const turnLyricPage = useRef<LyricPageNavigation>(null);
  const titleId = useId();
  const [fit, setFit] = useState<PdfFit>(() =>
    window.matchMedia?.('(any-pointer: coarse)').matches ? 'width' : 'height',
  );
  useScreenAwake();
  const selected = selections[index];
  function jump(nextIndex: number) {
    if (nextIndex !== index) setIndex(nextIndex);
  }
  const move = (delta: number) => jump(Math.max(0, Math.min(selections.length - 1, index + delta)));
  useReaderSwipe(rootRef, {
    dismiss: closeFocus,
    turnHorizontal: (direction, target) => {
      if (target.closest('.focus-reading')) move(direction);
    },
  });
  return (
    <Dialog.Content
      className="mass-focus"
      ref={rootRef}
      aria-describedby={undefined}
      data-reader-swipe
      onCloseAutoFocus={restoreFocus}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        rootRef.current?.focus({ preventScroll: true });
      }}
      onKeyDown={(event) => {
        if (
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          (event.target instanceof Element && event.target.closest('select'))
        )
          return;
        if (
          turnLyricPage.current &&
          ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)
        ) {
          event.preventDefault();
          turnLyricPage.current(event.key === 'ArrowUp' || event.key === 'PageUp' ? -1 : 1);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          move(1);
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      <Dialog.Title className="sr-only">Focus mode</Dialog.Title>
      <header className="focus-header">
        <div className="focus-heading">
          <p className="focus-placement" dir="auto">
            {selected.placement.name}
          </p>
          <div className="focus-hymn-picker">
            <h2 id={titleId} dir="auto">
              {selected.hymn.title}
            </h2>
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
            <select
              aria-label="Jump to hymn"
              value={index}
              onChange={(event) => jump(Number(event.target.value))}
            >
              {selections.map((selection, position) => (
                <option key={selection.id} value={position}>
                  {`${position + 1}. \u2068${selection.hymn.title}\u2069 · \u2068${selection.placement.name}\u2069`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Dialog.Close
          className="button secondary reader-icon-button focus-close"
          aria-label="Exit focus mode"
        >
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </Dialog.Close>
        <HymnMusicalSummary hymn={selected.hymn} />
      </header>
      <div
        className="focus-reading"
        key={selected.id}
        role="region"
        aria-labelledby={titleId}
        tabIndex={0}
      >
        {selected.notes && (
          <p className="focus-notes preserve-lines" dir="auto">
            {selected.notes}
          </p>
        )}
        <HymnMaterial
          hymn={selected.hymn}
          focus
          fit={fit}
          onFitChange={setFit}
          page={pages[selected.id] ?? 1}
          onPageChange={(page) => setPages((previous) => ({ ...previous, [selected.id]: page }))}
          lyricSize={lyricSize}
          onLyricSizeChange={setLyricSize}
          lyricPosition={lyricPositions[selected.id] ?? 0}
          onLyricPositionChange={(position) =>
            setLyricPositions((previous) => ({ ...previous, [selected.id]: position }))
          }
          lyricNavigationRef={turnLyricPage}
          onExitFocus={closeFocus}
          onHymnSwipe={move}
        />
      </div>
      <footer className="focus-footer">
        <nav aria-label="Hymn navigation">
          <button
            className="button secondary"
            onClick={() => move(-1)}
            disabled={index === 0}
            aria-label="Previous hymn"
          >
            <span aria-hidden="true">&lt;</span>
          </button>
          <span className="focus-count" role="status">
            Hymn {index + 1} of {selections.length}
          </span>
          <button
            className="button primary"
            onClick={() => move(1)}
            disabled={index === selections.length - 1}
            aria-label="Next hymn"
          >
            <span aria-hidden="true">&gt;</span>
          </button>
        </nav>
      </footer>
    </Dialog.Content>
  );
}

const activeFocusStorageKey = 'choralation-active-mass-focus';

export type MassFocusHandle = { open: (selectionId: number, trigger: HTMLElement) => void };

export function MassFocusMode({
  selections,
  resumeKey,
  launchRef,
}: {
  selections: Selection[];
  resumeKey?: string;
  launchRef?: Ref<MassFocusHandle>;
}) {
  const [initialSelectionId, setInitialSelectionId] = useState<number | null>(null);
  const launchButton = useRef<HTMLButtonElement>(null);
  const origin = useRef<{ element: HTMLElement; x: number; y: number } | null>(null);
  const [open, setOpen] = useState(() => {
    if (!resumeKey || !selections.length) return false;
    try {
      return sessionStorage.getItem(activeFocusStorageKey) === resumeKey;
    } catch {
      return false;
    }
  });
  const changeOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!resumeKey) return;
      try {
        if (next) sessionStorage.setItem(activeFocusStorageKey, resumeKey);
        else if (sessionStorage.getItem(activeFocusStorageKey) === resumeKey)
          sessionStorage.removeItem(activeFocusStorageKey);
      } catch {
        // Focus can still open and close if session storage is unavailable.
      }
    },
    [resumeKey],
  );
  const closeFocus = useCallback(() => changeOpen(false), [changeOpen]);
  const { rootRef, requestFullscreen } = useReaderFullscreen(open, closeFocus);
  useImperativeHandle(launchRef, () => ({
    open(selectionId, trigger) {
      if (!selections.some((row) => row.id === selectionId)) return;
      origin.current = { element: trigger, x: window.scrollX, y: window.scrollY };
      flushSync(() => {
        setInitialSelectionId(selectionId);
        changeOpen(true);
      });
      if (window.matchMedia?.('(any-pointer: coarse)').matches) requestFullscreen();
    },
  }));
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    const previous = origin.current;
    const target = previous?.element.isConnected ? previous.element : launchButton.current;
    target?.focus({ preventScroll: true });
    if (previous) window.scrollTo(previous.x, previous.y);
    origin.current = null;
  };
  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger
        ref={launchButton}
        className="button secondary focus-trigger"
        disabled={!selections.length}
        onClick={(event) => {
          origin.current = null;
          setInitialSelectionId(null);
          if (!window.matchMedia?.('(any-pointer: coarse)').matches) return;
          event.preventDefault();
          flushSync(() => changeOpen(true));
          requestFullscreen();
        }}
      >
        Focus mode
      </Dialog.Trigger>
      <Dialog.Portal>
        {open && (
          <>
            <Dialog.Overlay className="dialog-overlay" />
            <FocusSession
              selections={selections}
              rootRef={rootRef}
              closeFocus={closeFocus}
              initialSelectionId={initialSelectionId}
              restoreFocus={restoreFocus}
            />
          </>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
