/** A read-only performance session; each selection retains its program position. */
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import type { Mass } from '../../api/masses';
import { HymnMaterial } from '../hymns/HymnMaterial';

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

function FocusSession({ selections: initialSelections }: { selections: Selection[] }) {
  // Keep the reading sequence stable if another session edits/refetches the Mass.
  const [selections] = useState(initialSelections);
  const [index, setIndex] = useState(0);
  const [fit, setFit] = useState<PdfFit>('height');
  const touch = useRef<{ x: number; y: number } | null>(null);
  const awake = useScreenAwake();
  const selected = selections[index];
  const move = (delta: number) =>
    setIndex((value) => Math.max(0, Math.min(selections.length - 1, value + delta)));
  return (
    <Dialog.Content
      className="mass-focus"
      aria-describedby="focus-help"
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
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
      <header className="focus-header">
        <div>
          <Dialog.Title>Focus mode</Dialog.Title>
          <Dialog.Description id="focus-help">
            Swipe for hymns; PDF side arrows turn pages.
          </Dialog.Description>
        </div>
        <Dialog.Close className="button secondary focus-close" aria-label="Exit focus mode">
          ✕
        </Dialog.Close>
      </header>
      <div
        className="focus-reading"
        key={selected.id}
        onTouchStart={(event) => {
          if (event.touches.length !== 1) {
            touch.current = null;
            return;
          }
          touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        }}
        onTouchMove={(event) => {
          if (event.touches.length !== 1) touch.current = null;
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          if (!start || event.changedTouches.length !== 1) return;
          const deltaX = event.changedTouches[0].clientX - start.x;
          const deltaY = event.changedTouches[0].clientY - start.y;
          if (Math.abs(deltaX) >= 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4)
            move(deltaX < 0 ? 1 : -1);
        }}
      >
        <p className="focus-placement" dir="auto">
          {selected.placement.name}
        </p>
        <h2 dir="auto">{selected.hymn.title}</h2>
        {selected.notes && (
          <p className="focus-notes preserve-lines" dir="auto">
            {selected.notes}
          </p>
        )}
        <HymnMaterial key={selected.id} hymn={selected.hymn} focus fit={fit} onFitChange={setFit} />
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
          <span role="status" aria-live="polite">
            Hymn {index + 1} of {selections.length}
          </span>
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
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="button secondary focus-trigger" disabled={!selections.length}>
        Focus mode
      </Dialog.Trigger>
      <Dialog.Portal>
        {open && (
          <>
            <Dialog.Overlay className="dialog-overlay" />
            <FocusSession selections={selections} />
          </>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
