/** A read-only performance session; each selection retains its program position. */
import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { Ref } from 'react';
import { flushSync } from 'react-dom';
import type { Mass } from '../../api/masses';
import { HymnMaterial } from '../hymns/HymnMaterial';
import { HymnMusicalSummary } from '../hymns/HymnMusicalSummary';
import type { LyricSize } from '../hymns/HymnMaterial';
import { useReaderFullscreen } from '../hymns/useReaderFullscreen';
import { useReaderSwipe } from '../hymns/useReaderSwipe';

import type { PdfFit } from '../hymns/PdfSheet';

type Selection = Mass['program'][number];

function useScreenAwake() {
  const [status, setStatus] = useState('Requesting screen awake…');
  const request = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true;
    let lock: WakeLockSentinel | null = null;
    let requesting = false;
    const acquire = async () => {
      if (
        !active ||
        requesting ||
        document.visibilityState !== 'visible' ||
        (lock && !lock.released)
      )
        return;
      if (!navigator.wakeLock) {
        setStatus('Screen awake is unavailable in this browser.');
        return;
      }
      requesting = true;
      try {
        const acquired = await navigator.wakeLock.request('screen');
        if (!active) {
          await acquired.release();
          return;
        }
        lock = acquired;
        setStatus('Screen kept awake');
        acquired.addEventListener('release', () => {
          if (active && lock === acquired) {
            lock = null;
            setStatus('Screen awake paused.');
          }
        });
      } catch {
        if (active) setStatus('Screen may sleep. Screen-awake request was declined.');
      } finally {
        requesting = false;
      }
    };
    request.current = () => {
      void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', request.current);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', request.current);
      request.current = () => {};
      void lock?.release().catch(() => {});
    };
  }, []);
  return { status, retry: () => request.current() };
}

function FocusSession({
  selections: initialSelections,
  rootRef,
  closeFocus,
}: {
  selections: Selection[];
  rootRef: Ref<HTMLDivElement>;
  closeFocus: () => void;
}) {
  // Keep the reading sequence stable if another session edits/refetches the Mass.
  const [selections] = useState(initialSelections);
  const [index, setIndex] = useState(0);
  const [pages, setPages] = useState<Record<number, number>>({});
  const [lyricSize, setLyricSize] = useState<LyricSize>('standard');
  const scrollPositions = useRef<Record<number, number>>({});
  const reading = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const jumpId = useId();
  const [fit, setFit] = useState<PdfFit>(() =>
    window.matchMedia?.('(any-pointer: coarse) and (orientation: landscape)').matches
      ? 'width'
      : 'height',
  );
  const awake = useScreenAwake();
  const selected = selections[index];
  useLayoutEffect(() => {
    if (reading.current) reading.current.scrollTop = scrollPositions.current[selected.id] ?? 0;
  }, [selected.id]);
  function jump(nextIndex: number) {
    if (nextIndex !== index) setIndex(nextIndex);
  }
  const move = (delta: number) => jump(Math.max(0, Math.min(selections.length - 1, index + delta)));
  const swipe = useReaderSwipe({
    dismiss: closeFocus,
    turn: (direction, target) => {
      if (target.closest('.focus-reading') && !target.closest('.pdf-viewport[data-zoomed="true"]'))
        move(direction);
    },
  });
  return (
    <Dialog.Content
      className="mass-focus"
      ref={rootRef}
      aria-describedby={undefined}
      {...swipe}
      onKeyDown={(event) => {
        if (
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          (event.target instanceof Element && event.target.closest('select'))
        )
          return;
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
        <Dialog.Close className="button secondary focus-close" aria-label="Exit focus mode">
          ✕
        </Dialog.Close>
      </header>
      <div
        className="focus-reading"
        key={selected.id}
        ref={reading}
        onScroll={(event) => {
          scrollPositions.current[selected.id] = event.currentTarget.scrollTop;
        }}
        role="region"
        aria-labelledby={titleId}
        tabIndex={0}
      >
        <p className="focus-placement" dir="auto">
          {selected.placement.name}
        </p>
        <h2 id={titleId} dir="auto">
          {selected.hymn.title}
        </h2>
        <HymnMusicalSummary hymn={selected.hymn} />
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
            ←
          </button>
          <div className="focus-jump">
            <label className="sr-only" htmlFor={jumpId}>
              Jump to hymn
            </label>
            <select
              id={jumpId}
              value={index}
              onChange={(event) => jump(Number(event.target.value))}
            >
              {selections.map((selection, position) => (
                <option key={selection.id} value={position}>
                  {`${position + 1}. \u2068${selection.hymn.title}\u2069 · \u2068${selection.placement.name}\u2069`}
                </option>
              ))}
            </select>
            <span role="status">
              Hymn {index + 1} of {selections.length}
            </span>
          </div>
          <button
            className="button primary"
            onClick={() => move(1)}
            disabled={index === selections.length - 1}
            aria-label="Next hymn"
          >
            →
          </button>
        </nav>
        <div className="awake-status">
          <span role="status">{awake.status}</span>
          {navigator.wakeLock && awake.status !== 'Screen kept awake' && (
            <button className="text-button" onClick={awake.retry}>
              Retry screen awake
            </button>
          )}
        </div>
      </footer>
    </Dialog.Content>
  );
}

export function MassFocusMode({ selections }: { selections: Selection[] }) {
  const [open, setOpen] = useState(false);
  const closeFocus = useCallback(() => setOpen(false), []);
  const { rootRef, requestFullscreen } = useReaderFullscreen(open, closeFocus);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className="button secondary focus-trigger"
        disabled={!selections.length}
        onClick={(event) => {
          if (!window.matchMedia?.('(any-pointer: coarse)').matches) return;
          event.preventDefault();
          flushSync(() => setOpen(true));
          requestFullscreen();
        }}
      >
        Focus mode
      </Dialog.Trigger>
      <Dialog.Portal>
        {open && (
          <>
            <Dialog.Overlay className="dialog-overlay" />
            <FocusSession selections={selections} rootRef={rootRef} closeFocus={closeFocus} />
          </>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
